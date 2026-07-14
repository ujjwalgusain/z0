import JSZip from "jszip";
import { getCurrentUser } from "@/features/auth/actions";
import { parseFragmentFiles } from "@/features/projects/fragment-types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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
  const fileEntries = Object.entries(files);

  if (fileEntries.length === 0) {
    return Response.json(
      { message: "No files available for download" },
      { status: 400 }
    );
  }

  const zip = new JSZip();

  for (const [path, content] of fileEntries) {
    if (!path || typeof content !== "string") {
      continue;
    }

    zip.file(path, content);
  }

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
