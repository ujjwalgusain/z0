import type { AgentResult } from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";

export interface CodeAgentState {
  sandboxId: string;
  summary: string;
  files: Record<string, string>;
}

function textFromMessage(
  message: AgentResult["output"][number]
): string | undefined {
  if (message.type !== "text") {
    return undefined;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === "string" ? part : part.text ?? ""))
      .join("");
  }

  return message.content;
}

/**
 * Extract the text of the most recent assistant message from an agent result.
 */
export function lastAssistantTextMessageContent(
  result: AgentResult
): string | undefined {
  for (let i = result.output.length - 1; i >= 0; i--) {
    const message = result.output[i];
    if (message.role !== "assistant") {
      continue;
    }

    const text = textFromMessage(message);
    if (text !== undefined) {
      return text;
    }
  }

  return undefined;
}

/** Plain text from agent output, with a fallback when nothing is found. */
export function agentOutputText(
  output: AgentResult["output"],
  fallback: string
): string {
  return lastAssistantTextMessageContent({ output } as AgentResult) ?? fallback;
}

/** Save `<task_summary>` from the agent's latest reply into network state. */
export function captureTaskSummary(
  result: AgentResult,
  network?: { state: { data: { summary?: string } } }
) {
  const text = lastAssistantTextMessageContent(result);
  if (text?.includes("<task_summary>") && network) {
    network.state.data.summary = text;
  }
}

export async function connectSandbox(sandboxId: string) {
  return Sandbox.connect(sandboxId);
}

const protectedUiPathPattern =
  /(^|\/)(src\/)?components\/ui\/.+\.(js|jsx|ts|tsx)$/i;

export function isProtectedUiPath(path: string) {
  return protectedUiPathPattern.test(path.replace(/\\/g, "/"));
}

const interactiveAppFilePattern = /(^|\/)app\/.*\.(jsx|tsx)$/i;
const clientDirectivePattern = /^[\s\r\n]*["']use client["'];?/;
const interactiveSignalPattern =
  /\b(useState|useEffect|useRef|useMemo|useCallback|useReducer)\b|on[A-Z][A-Za-z]+\s*=|(?:^|[^\w])(window|document|navigator|localStorage|sessionStorage)\b/;

function ensureUseClient(content: string): string {
  if (clientDirectivePattern.test(content) || !interactiveSignalPattern.test(content)) {
    return content;
  }

  return `"use client";\n\n${content}`;
}

export function normalizeGeneratedFiles(files: Record<string, string>) {
  const normalizedFiles = { ...files };
  const changedPaths: string[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (!interactiveAppFilePattern.test(path)) {
      continue;
    }

    const normalized = ensureUseClient(content);
    if (normalized !== content) {
      normalizedFiles[path] = normalized;
      changedPaths.push(path);
    }
  }

  return { files: normalizedFiles, changedPaths };
}
