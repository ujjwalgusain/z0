import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import { builtinModules } from "node:module";
import { getCurrentUser } from "@/features/auth/actions";
import { parseFragmentFiles } from "@/features/projects/fragment-types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const repoRoot = process.cwd();
const sourceExtensions = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".mts",
  ".json",
  ".css",
];
const builtInPackages = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`])
);
const importPattern =
  /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const cssImportPattern = /@import\s+["']([^"']+)["']/g;

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function toPosixPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function detectSourceRoot(files: Record<string, string>) {
  return Object.keys(files).some((filePath) => toPosixPath(filePath).startsWith("src/"))
    ? "src"
    : "";
}

function normalizeFileMap(files: Record<string, string>) {
  const normalized: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== "string") {
      continue;
    }

    normalized[toPosixPath(filePath)] = content;
  }

  return normalized;
}

function buildProjectFilePath(relativePath: string, sourceRoot: string) {
  const cleaned = toPosixPath(relativePath).replace(/^src\//, "");
  return sourceRoot ? `src/${cleaned}` : cleaned;
}

function buildRepoCandidates(filePath: string, sourceRoot: string) {
  const normalized = toPosixPath(filePath);
  const candidates = new Set<string>();

  if (sourceRoot && normalized.startsWith("src/")) {
    candidates.add(normalized);
  } else {
    candidates.add(`src/${normalized}`);
  }

  candidates.add(normalized);
  return Array.from(candidates).map((candidate) =>
    path.join(repoRoot, candidate.replace(/\//g, path.sep))
  );
}

function resolvePathCandidates(filePath: string) {
  const normalized = toPosixPath(filePath);

  if (/\.[a-z0-9]+$/i.test(normalized)) {
    return [normalized];
  }

  const candidates = [...sourceExtensions.map((extension) => `${normalized}${extension}`)];
  for (const extension of sourceExtensions) {
    candidates.push(`${normalized}/index${extension}`);
  }

  return candidates;
}

function extractImportSpecifiers(content: string, filePath: string) {
  const specifiers = new Set<string>();
  let match: RegExpExecArray | null;

  importPattern.lastIndex = 0;
  while ((match = importPattern.exec(content)) !== null) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      specifiers.add(specifier);
    }
  }

  if (filePath.endsWith(".css")) {
    cssImportPattern.lastIndex = 0;
    while ((match = cssImportPattern.exec(content)) !== null) {
      const specifier = match[1];
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }

  return Array.from(specifiers);
}

function isLocalSpecifier(specifier: string) {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("@/");
}

function resolveLocalOutputPath(
  importerPath: string,
  specifier: string,
  sourceRoot: string
) {
  if (specifier.startsWith("@/")) {
    return buildProjectFilePath(specifier.slice(2), sourceRoot);
  }

  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return undefined;
  }

  return toPosixPath(path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier)));
}

function toPackageName(specifier: string) {
  if (specifier.startsWith("node:") || builtInPackages.has(specifier)) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : undefined;
  }

  return specifier.split("/")[0];
}

async function tryReadRepoFile(outputPath: string, sourceRoot: string) {
  for (const candidate of resolvePathCandidates(outputPath)) {
    for (const repoCandidate of buildRepoCandidates(candidate, sourceRoot)) {
      try {
        const content = await fs.readFile(repoCandidate, "utf8");
        return { outputPath: candidate, content };
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

async function collectPackagedFiles(
  initialFiles: Record<string, string>,
  sourceRoot: string
) {
  const packagedFiles = { ...initialFiles };
  const dependencies = new Set<string>();
  const queue = Object.keys(packagedFiles);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath || visited.has(currentPath)) {
      continue;
    }

    visited.add(currentPath);
    const content = packagedFiles[currentPath];
    if (typeof content !== "string") {
      continue;
    }

    for (const specifier of extractImportSpecifiers(content, currentPath)) {
      if (isLocalSpecifier(specifier)) {
        const localTarget = resolveLocalOutputPath(currentPath, specifier, sourceRoot);
        if (!localTarget) {
          continue;
        }

        const existingTarget = resolvePathCandidates(localTarget).find(
          (candidate) => packagedFiles[candidate] !== undefined
        );

        if (existingTarget) {
          if (!visited.has(existingTarget)) {
            queue.push(existingTarget);
          }
          continue;
        }

        const repoFile = await tryReadRepoFile(localTarget, sourceRoot);
        if (!repoFile) {
          continue;
        }

        packagedFiles[repoFile.outputPath] = repoFile.content;
        queue.push(repoFile.outputPath);
        continue;
      }

      const packageName = toPackageName(specifier);
      if (packageName) {
        dependencies.add(packageName);
      }
    }
  }

  return { packagedFiles, dependencies };
}

async function loadRepoPackageManifest(): Promise<PackageManifest> {
  const manifest = await fs.readFile(path.join(repoRoot, "package.json"), "utf8");
  return JSON.parse(manifest) as PackageManifest;
}

function pickVersions(
  names: Iterable<string>,
  versions: Record<string, string> | undefined
) {
  const entries = Array.from(new Set(names))
    .sort()
    .map((name) => [name, versions?.[name] ?? "latest"] as const);

  return Object.fromEntries(entries);
}

function buildPackageJson(
  title: string,
  dependencies: Set<string>,
  manifest: PackageManifest
) {
  const runtimeDependencies = new Set(["next", "react", "react-dom", ...dependencies]);
  const devDependencies = [
    "typescript",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "tailwindcss",
    "@tailwindcss/postcss",
  ];

  return `${JSON.stringify(
    {
      name: slugify(title) || "z0-project",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
      },
      dependencies: pickVersions(runtimeDependencies, manifest.dependencies),
      devDependencies: pickVersions(devDependencies, manifest.devDependencies),
    },
    null,
    2
  )}\n`;
}

function buildTsConfig(sourceRoot: string) {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "react-jsx",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: {
          "@/*": [sourceRoot ? "./src/*" : "./*"],
        },
      },
      include: [
        "next-env.d.ts",
        "**/*.ts",
        "**/*.tsx",
        ".next/types/**/*.ts",
        ".next/dev/types/**/*.ts",
        "**/*.mts",
      ],
      exclude: ["node_modules"],
    },
    null,
    2
  )}\n`;
}

function buildComponentsJson(sourceRoot: string) {
  return `${JSON.stringify(
    {
      $schema: "https://ui.shadcn.com/schema.json",
      style: "radix-maia",
      rsc: true,
      tsx: true,
      tailwind: {
        config: "",
        css: sourceRoot ? "src/app/globals.css" : "app/globals.css",
        baseColor: "mist",
        cssVariables: true,
        prefix: "",
      },
      iconLibrary: "lucide",
      rtl: false,
      aliases: {
        components: "@/components",
        utils: "@/lib/utils",
        ui: "@/components/ui",
        lib: "@/lib",
        hooks: "@/hooks",
      },
      menuColor: "default",
      menuAccent: "subtle",
      registries: {},
    },
    null,
    2
  )}\n`;
}

function buildLayout(title: string, sourceRoot: string) {
  return `import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "${title.replace(/"/g, '\\"')}",
  description: "Generated with z0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

function buildGitignore() {
  return `node_modules
.next
.env
.DS_Store
`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildReadme(title: string) {
  return `# ${title}

## Run locally

1. Extract this ZIP file.
2. Open the project folder in your terminal.
3. Run \`npm install\`.
4. Run \`npm run dev\`.
5. Open \`http://localhost:3000\` in your browser.
`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fragmentId: string }> }
) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { fragmentId } = await params;

  const fragment = await prisma.fragment.findFirst({
    where: {
      id: fragmentId,
      message: {
        project: {
          userId: user.id,
        },
      },
    },
    select: {
      id: true,
      title: true,
      files: true,
    },
  });

  if (!fragment) {
    return Response.json({ message: "Fragment not found" }, { status: 404 });
  }

  const files = parseFragmentFiles(fragment.files);
  const sourceRoot = detectSourceRoot(files);
  const normalizedFiles = normalizeFileMap(files);
  const { packagedFiles, dependencies } = await collectPackagedFiles(
    normalizedFiles,
    sourceRoot
  );
  const fileEntries = Object.entries(packagedFiles);

  if (fileEntries.length === 0) {
    return Response.json(
      { message: "No files available for download" },
      { status: 400 }
    );
  }

  const zip = new JSZip();
  const manifest = await loadRepoPackageManifest();
  const layoutPath = sourceRoot ? "src/app/layout.tsx" : "app/layout.tsx";
  const globalsPath = sourceRoot ? "src/app/globals.css" : "app/globals.css";
  const repoGlobals = await fs.readFile(path.join(repoRoot, "src/app/globals.css"), "utf8");
  dependencies.add("tw-animate-css");
  dependencies.add("shadcn");

  for (const [path, content] of fileEntries) {
    if (!path || typeof content !== "string") {
      continue;
    }

    const normalizedPath = toPosixPath(path);
    if (
      normalizedPath === "package.json" ||
      normalizedPath === "package-lock.json" ||
      normalizedPath === "tsconfig.json" ||
      normalizedPath === "next-env.d.ts" ||
      normalizedPath === "next.config.ts" ||
      normalizedPath === "postcss.config.mjs" ||
      normalizedPath === "components.json" ||
      normalizedPath === ".gitignore"
    ) {
      continue;
    }

    zip.file(normalizedPath, content);
  }

  if (!packagedFiles[layoutPath]) {
    zip.file(layoutPath, buildLayout(fragment.title, sourceRoot));
  }

  if (!packagedFiles[globalsPath]) {
    zip.file(globalsPath, repoGlobals);
  }

  zip.file("package.json", buildPackageJson(fragment.title, dependencies, manifest));
  zip.file("tsconfig.json", buildTsConfig(sourceRoot));
  zip.file(
    "next-env.d.ts",
    `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\n// NOTE: This file should not be edited.\n`
  );
  zip.file(
    "next.config.ts",
    `import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n`
  );
  zip.file(
    "postcss.config.mjs",
    `const config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n`
  );
  zip.file("components.json", buildComponentsJson(sourceRoot));
  zip.file(".gitignore", buildGitignore());
  zip.file("README.md", buildReadme(fragment.title));

  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });

  const baseName = slugify(fragment.title) || "z0-project";
  const body = Uint8Array.from(archive).buffer;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${baseName}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
