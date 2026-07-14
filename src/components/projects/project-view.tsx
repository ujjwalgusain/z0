"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Code, CrownIcon, DownloadIcon, EyeIcon, MessageSquareTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Fragment } from "@/generated/prisma/client";
import { useIsMobile } from "@/hooks/use-mobile";
import ProjectHeader from "./project-header";
import MessageContainer from "./message-container";
import FragmentDownload from "./fragment-download";
import FragmentWeb from "./fragment-web";
import { FileExplorer } from "./file-explorer";

export type ProjectFragment = Fragment & {
    files: Record<string, string>;
  };

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function ProjectView({ projectId }: { projectId: string }) {
    const [activeFragment, setActiveFragment] = useState<ProjectFragment | null>(
      null
    );
    const isMobile = useIsMobile();
    const [tabState, setTabState] = useState<"chat" | "preview" | "download" | "code">("chat");

    useEffect(() => {
      if (!isMobile && tabState === "chat") {
        setTabState("preview");
      }
    }, [isMobile, tabState]);

    if (isMobile) {
      return (
        <div className="flex h-[100svh] flex-col overflow-hidden">
          <ProjectHeader projectId={projectId} />
          <Tabs
            className="flex min-h-0 flex-1 flex-col"
            defaultValue="chat"
            value={tabState}
            onValueChange={(value) =>
              setTabState(value as "chat" | "preview" | "download" | "code")
            }
          >
            <div className="border-b bg-background/95 px-2 py-2 backdrop-blur supports-backdrop-filter:bg-background/80">
              <div className="flex items-center gap-2">
                <TabsList className="grid h-auto w-full grid-cols-4 rounded-2xl border p-1">
                  <TabsTrigger value="chat" className="gap-1.5 rounded-xl px-2 py-2 text-xs">
                    <MessageSquareTextIcon className="size-4" />
                    <span>Chat</span>
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="gap-1.5 rounded-xl px-2 py-2 text-xs">
                    <EyeIcon className="size-4" />
                    <span>Demo</span>
                  </TabsTrigger>
                  <TabsTrigger value="download" className="gap-1.5 rounded-xl px-2 py-2 text-xs">
                    <DownloadIcon className="size-4" />
                    <span>Files</span>
                  </TabsTrigger>
                  <TabsTrigger value="code" className="gap-1.5 rounded-xl px-2 py-2 text-xs">
                    <Code className="size-4" />
                    <span>Code</span>
                  </TabsTrigger>
                </TabsList>

                <Button asChild size="icon-sm" variant="outline" className="shrink-0 rounded-full">
                  <Link href="/">
                    <CrownIcon className="size-4" />
                    <span className="sr-only">Upgrade</span>
                  </Link>
                </Button>
              </div>
            </div>

            <TabsContent value="chat" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
              <MessageContainer
                projectId={projectId}
                activeFragment={activeFragment}
                setActiveFragment={setActiveFragment}
              />
            </TabsContent>

            <TabsContent value="preview" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              {activeFragment ? (
                <FragmentWeb data={activeFragment} />
              ) : (
                <EmptyState message="Select a fragment from chat to preview it." />
              )}
            </TabsContent>

            <TabsContent value="download" className="mt-0 min-h-0 flex-1 overflow-auto data-[state=inactive]:hidden">
              {activeFragment ? (
                <FragmentDownload data={activeFragment} />
              ) : (
                <EmptyState message="Select a fragment from chat to download it." />
              )}
            </TabsContent>

            <TabsContent value="code" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
              {activeFragment?.files &&
              Object.keys(activeFragment.files).length > 0 ? (
                <FileExplorer files={activeFragment.files} />
              ) : (
                <EmptyState message="Select a fragment from chat to view its code." />
              )}
            </TabsContent>
          </Tabs>
        </div>
      );
    }
  
    return (
      <div className="h-[100svh]">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel
            defaultSize={28}
            minSize={20}
            className="flex min-h-0 flex-col"
          >
            <ProjectHeader projectId={projectId} />
            <MessageContainer
              projectId={projectId}
              activeFragment={activeFragment}
              setActiveFragment={setActiveFragment}
            />
            
          </ResizablePanel>
  
          <ResizableHandle withHandle />
  
          <ResizablePanel defaultSize={72} minSize={45} className="min-w-0">
            <Tabs
              className="flex h-full flex-col"
              defaultValue="preview"
              value={tabState}
              onValueChange={(value) => setTabState(value as "chat" | "preview" | "download" | "code")}
            >
              <div className="flex w-full items-center gap-x-2 border-b p-2">
                <TabsList className="h-8 rounded-md border p-0">
                  <TabsTrigger
                    value="preview"
                    className="flex items-center gap-x-2 rounded-md px-3"
                  >
                    <EyeIcon className="size-4" />
                    <span>Demo</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="download"
                    className="flex items-center gap-x-2 rounded-md px-3"
                  >
                    <DownloadIcon className="size-4" />
                    <span>Download</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="code"
                    className="flex items-center gap-x-2 rounded-md px-3"
                  >
                    <Code className="size-4" />
                    <span>Code</span>
                  </TabsTrigger>
                </TabsList>
  
                <div className="ml-auto flex items-center gap-x-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/">
                      <CrownIcon className="mr-2 size-4" />
                      Upgrade
                    </Link>
                  </Button>
                </div>
              </div>

              <TabsContent
                value="preview"
                className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                {activeFragment ? (
                  <FragmentWeb data={activeFragment} />
                ) : (
                  <EmptyState message="Select a fragment to preview" />
                )}
              </TabsContent>
  
              <TabsContent
                value="download"
                className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                {activeFragment ? (
                  <FragmentDownload data={activeFragment} />
                ) : (
                  <EmptyState message="Select a fragment to download" />
                )}
              </TabsContent>
  
              <TabsContent
                value="code"
                className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                {activeFragment?.files &&
                Object.keys(activeFragment.files).length > 0 ? (
                  <FileExplorer files={activeFragment.files} />
                ) : (
                  <EmptyState message="Select a fragment to view code" />
                )}
              </TabsContent>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }
