import { prisma } from "@/lib/db";
import { inngest } from "./client";
import { Sandbox } from "@e2b/code-interpreter";
import { MessageRole, MessageType } from "@/generated/prisma/enums";

import { createAgent, createNetwork, createState, createTool, openai } from "@inngest/agent-kit"
import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/lib/prompt";
import { DEFAULT_AI_MODEL, isSupportedAiModel } from "@/lib/ai-models";
import z from "zod"
import {
  agentOutputText,
  connectSandbox,
  isProtectedUiPath,
  lastAssistantTextMessageContent,
  normalizeGeneratedFiles,
} from "./utils";

export interface CodeAgentState {
  sandboxId: string;
  summary: string;
  files: Record<string, string>;
}

const PREVIEW_PORT = 3000;
const PREVIEW_START_COMMAND = "bun --bun run dev --turbo --hostname 0.0.0.0";

const aiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.aicredits.in/v1";
const aiApiKey = process.env.OPENAI_API_KEY;
const primaryModelId = process.env.AI_MODEL || DEFAULT_AI_MODEL;

const createGatewayModel = (model = primaryModelId) => {
  if (!aiApiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return openai({
    model,
    apiKey: aiApiKey,
    baseUrl: aiBaseUrl,
    defaultParameters: {
      temperature: 0,
      max_completion_tokens: 8192,
    },
  });
};

async function isPreviewServerReady(sandbox: Sandbox) {
  try {
    const result = await sandbox.commands.run(
      `curl -fsS http://localhost:${PREVIEW_PORT} >/dev/null`,
      { timeoutMs: 5000 }
    );

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function ensurePreviewServer(sandboxId: string) {
  const sandbox = await connectSandbox(sandboxId);

  if (await isPreviewServerReady(sandbox)) {
    return { ready: true, started: false };
  }

  await sandbox.commands.run(PREVIEW_START_COMMAND, {
    background: true,
    timeoutMs: 1000,
  });

  for (let attempt = 0; attempt < 12; attempt++) {
    if (await isPreviewServerReady(sandbox)) {
      return { ready: true, started: true };
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const processes = await sandbox.commands.list().catch(() => []);
  return {
    ready: false,
    started: true,
    processes: processes.map((process) => process.cmd).join("\n"),
  };
}


export const processTask = inngest.createFunction(
  { id: "process-task", triggers: { event: "app/task.created" } },
  async ({ event, step }) => {
    const result = await step.run("handle-task", async () => {
      return { processed: true, id: event.data.id };
    });

    await step.sleep("pause", "1s");

    return { message: `Task ${event.data.id} complete`, result };
  }
);

export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent", triggers: { event: "code-agent/run" } },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create({
        template: "92lxeu0fqf3a1b677soq"
      });

      return sandbox.sandboxId;
    })

    const previousMessages = await step.run("get-previous-messages", async () => {
      const messages = await prisma.message.findMany({
        where: {
          projectId: event.data.projectId
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      return messages.map((message) => ({
        type: "text" as const,
        role:
          message.role === MessageRole.ASSISTANT
            ? ("assistant" as const)
            : ("user" as const),
        content: message.content,
      }))
    });

    const state = createState<CodeAgentState>(
      { sandboxId, summary: "", files: {} },
      { messages: previousMessages }
    );

    const requestedModel = event.data.model;
    const selectedModelId = isSupportedAiModel(requestedModel)
      ? requestedModel
      : primaryModelId;
    const primaryModel = createGatewayModel(selectedModelId);

    const codeAgent = createAgent({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,
      model: primaryModel,
      tools: [
        // 1. Terminal
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => {
              const buffers = { stdout: "", stderr: "" };

              try {
                const sandbox = await Sandbox.connect(sandboxId);

                const result = await sandbox.commands.run(command, {
                  onStdout: (data) => {
                    buffers.stdout += data;
                  },

                  onStderr: (data) => {
                    buffers.stderr += data;
                  },
                });

                return result.stdout;
              } catch (error) {
                console.log(
                  `Command failed: ${error} \n stdout: ${buffers.stdout}\n stderr: ${buffers.stderr}`
                );

                return `Command failed: ${error} \n stdout: ${buffers.stdout}\n stderr: ${buffers.stderr}`;
              }
            });
          },
        }),

        // 2. createOrUpdateFiles
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the sanbox",
          parameters: z.object({
            files: z.array(
              z.object({
                path: z.string(),
                content: z.string(),
              })
            ),
          }),

          handler: async ({ files }, { step, network }) => {
            const newFiles = await step?.run(
              "createOrUpdateFiles",
              async () => {
                try {
                  const protectedPaths = files
                    .map((file) => file.path)
                    .filter(isProtectedUiPath);

                  if (protectedPaths.length > 0) {
                    return `Refused to modify protected shared UI files: ${protectedPaths.join(", ")}. Create project-local components instead.`;
                  }

                  const updatedFiles = network?.state?.data.files || {};

                  const sanbox = await Sandbox.connect(sandboxId);

                  for (const file of files) {
                    await sanbox.files.write(file.path, file.content);
                    updatedFiles[file.path] = file.content;
                  }

                  return updatedFiles;
                } catch (error) {
                  return "Error" + error;
                }
              }
            );

            if (typeof newFiles === "object") {
              network.state.data.files = newFiles;
            }
          },
        }),
        // 3. readFiles
        createTool({
          name: "readFiles",
          description: "Read files in the sandbox",

          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sanbox = await Sandbox.connect(sandboxId);

                const contents: Array<{ path: string; content: unknown }> = [];
                console.log(contents)

                for (const file of files) {
                  const content = await sanbox.files.read(file);
                  contents.push({ path: file, content });
                }
                return JSON.stringify(contents);
              } catch (error) {
                return "Error" + error;
              }
            });
          },
        }),
      ],

      lifecycle: {
        onResponse: async ({ result, network }) => {
          console.log(result);
          const lastAssistantMessageText =
            lastAssistantTextMessageContent(result);

          if (lastAssistantMessageText && network) {
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantMessageText;
            }
          }

          return result;
        },
      },
    });

    const network = createNetwork({
      name: "code-agent-network",
      agents: [codeAgent],
      maxIter: 15,
      router: async({ network }) => {
        const summary = network.state.data.summary;

        if(summary){
          return;
        }

        return codeAgent;
      }

    });

    const result = await network.run(event.data.value, { state });
    console.log(result)
    const { summary } = result.state.data;
    let files = result.state.data.files || {};

    const normalized = await step.run("normalize-generated-files", async () => {
      const nextFiles = normalizeGeneratedFiles(files);

      if (nextFiles.changedPaths.length === 0) {
        return nextFiles;
      }

      const sandbox = await connectSandbox(sandboxId);

      for (const path of nextFiles.changedPaths) {
        await sandbox.files.write(path, nextFiles.files[path]!);
      }

      return nextFiles;
    });

    files = normalized.files;
    result.state.data.files = files;

    const makeTextAgent = (name: string, system: string, model = primaryModel) =>
      createAgent({ name, system, model });

    const fragmentTitleGenerator = makeTextAgent("fragment-title-generator", FRAGMENT_TITLE_PROMPT);
    const responseGenerator = makeTextAgent("response-generator", RESPONSE_PROMPT);

    const [{ output: fragmentTitleOutput }, { output: responseOutput }] = await Promise.all([
      fragmentTitleGenerator.run(summary, { step }),
      responseGenerator.run(summary, { step })
    ]);

    const fragmentTitle = agentOutputText(fragmentTitleOutput, "Untitled");
    const responseText = agentOutputText(responseOutput, "Here you go");

    console.log(files)

    const isError =
      !result.state.data.summary ||
      Object.keys(result.state.data.files || {}).length === 0;

    const previewServer = isError
      ? { ready: false, started: false }
      : await step.run("ensure-preview-server", async () => {
          return ensurePreviewServer(sandboxId);
        });

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await connectSandbox(sandboxId);
      return `https://${sandbox.getHost(PREVIEW_PORT)}`
    });

    await step.run("save-result", async () => {
      if (isError) {
        return prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again.",
            role: MessageRole.ASSISTANT,
            type: MessageType.ERROR,
          },


        })
      };

      return prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: previewServer.ready
            ? responseText
            : `${responseText}\n\nThe app was generated, but the preview server did not start on port 3000. You can still download the code and run it locally.`,
          role: MessageRole.ASSISTANT,
          type: MessageType.RESULT,
          fragments: {
            create: {
              sandboxUrl,
              title: fragmentTitle,
              files
            }
          }
        }
      })
    });

    return {
      url: sandboxUrl, title: fragmentTitle, files, summary
    }
  }

)
