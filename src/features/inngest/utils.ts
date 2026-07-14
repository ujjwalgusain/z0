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

function toPosixPath(path: string) {
  return path.replace(/\\/g, "/");
}

const interactiveAppFilePattern = /(^|\/)app\/.*\.(js|jsx|ts|tsx)$/i;
const clientDirectivePattern = /^[\s\r\n]*["']use client["'];?/;
const interactiveSignalPattern =
  /\b(useState|useEffect|useRef|useMemo|useCallback|useReducer)\b|on[A-Z][A-Za-z]+\s*=|(?:^|[^\w])(window|document|navigator|localStorage|sessionStorage)\b/;
const nestedRouteImportPattern =
  /from\s+['"](\.\/[^'"]*\/page(?:\.[^'"]+)?)['"]/g;

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

  const rootPagePath = ["app/page.tsx", "app/page.jsx", "app/page.js"].find(
    (path) => normalizedFiles[path]
  );
  const rootPage = rootPagePath ? normalizedFiles[rootPagePath] : undefined;

  if (rootPagePath && rootPage) {
    let nextRootPage = rootPage;
    let match: RegExpExecArray | null;
    nestedRouteImportPattern.lastIndex = 0;

    while ((match = nestedRouteImportPattern.exec(rootPage)) !== null) {
      const importPath = match[1];
      const routePath = toPosixPath(
        `app/${importPath.replace(/^\.\//, "")}${importPath.endsWith(".tsx") ? "" : ".tsx"}`
      );

      const routeContent = normalizedFiles[routePath];
      if (!routeContent) {
        continue;
      }

      const componentPath = routePath.replace(/\/page\.tsx$/, "/generated-view.tsx");
      const componentImportPath = importPath
        .replace(/\/page(\.tsx)?$/, "/generated-view")
        .replace(/\\/g, "/");

      normalizedFiles[componentPath] = routeContent;
      nextRootPage = nextRootPage.replace(importPath, componentImportPath);

      if (!changedPaths.includes(componentPath)) {
        changedPaths.push(componentPath);
      }
    }

    if (nextRootPage !== rootPage) {
      normalizedFiles[rootPagePath] = nextRootPage;
      if (!changedPaths.includes(rootPagePath)) {
        changedPaths.push(rootPagePath);
      }
    }
  }

  return { files: normalizedFiles, changedPaths };
}
