"use client";

import { CopyIcon, DownloadIcon, FolderArchiveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectFragment } from "@/features/projects/fragment-types";

function buildRunCommandSnippet() {
  return ["npm install", "npm run dev"].join("\n");
}

export default function FragmentDownload({
  data,
}: {
  data: ProjectFragment;
}) {
  const fileCount = Object.keys(data.files ?? {}).length;
  const downloadHref = `/api/fragments/${data.id}/download`;

  async function copyCommands() {
    await navigator.clipboard.writeText(buildRunCommandSnippet());
  }

  return (
    <div className="flex h-full items-center justify-center bg-muted/20 p-4 sm:p-6">
      <div className="w-full max-w-2xl rounded-3xl border bg-background p-5 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <FolderArchiveIcon className="size-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {data.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {fileCount} generated files ready to download and run locally
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button asChild size="lg" className="w-full rounded-full sm:w-auto">
            <a href={downloadHref}>
              <DownloadIcon className="size-4" />
              Download ZIP
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full rounded-full sm:w-auto"
            onClick={copyCommands}
          >
            <CopyIcon className="size-4" />
            Copy Run Commands
          </Button>
        </div>

        <div className="mt-8 rounded-2xl border bg-muted/30 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Run Locally
          </h3>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-foreground/90">
            <li>1. Download the ZIP file and extract it on your machine.</li>
            <li>2. Open the extracted folder in your terminal.</li>
            <li>3. Run <code>npm install</code>.</li>
            <li>4. Run <code>npm run dev</code>.</li>
            <li>5. Open <code>http://localhost:3000</code>.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
