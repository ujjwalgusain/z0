"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AI_MODELS, DEFAULT_AI_MODEL } from "@/lib/ai-models";

import {
  getRandomPromptTemplate,
  promptTemplateCategories,
} from "@/components/home/prompt-templates";
import { useCreateProject } from "@/features/projects/hooks/projects";

export function PromptInput() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const router = useRouter();
  const { mutate: createProject, isPending } = useCreateProject();
  const selectedModel = AI_MODELS.find((option) => option.id === model) ?? AI_MODELS[0];

  function handleSubmit() {
    createProject({ value: prompt, model }, {
      onSuccess: (project) => {
        router.push(`/projects/${project.id}`);
      },
      onError: (error) => {
        toast.error(error.message);
      }
    })
  }

  /**
   * Replace the textarea contents with a chosen template prompt.
   *
   * @param nextPrompt - The template prompt text to load into the input.
   */
  function applySuggestion(nextPrompt: string) {
    setPrompt(nextPrompt);
  }

  /**
   * Load a random template prompt into the input ("Random idea").
   */
  function shuffleSuggestions() {
    setPrompt(getRandomPromptTemplate().prompt);
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <InputGroup className="h-auto min-h-32 flex-col rounded-2xl border-border/60 bg-card/50 shadow-sm backdrop-blur-sm has-[>textarea]:h-auto">
        <InputGroupTextarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask z0 to build..."
          rows={4}
          // disabled={isPending}
          className="min-h-24 px-4 pt-4 text-sm"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />
        <InputGroupAddon
          align="block-end"
          className="w-full flex-col gap-2 border-t border-border/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className="h-9 w-full justify-between rounded-full border-border/70 bg-background/70 px-3 shadow-sm hover:bg-background sm:h-8 sm:min-w-32 sm:w-auto"
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  {selectedModel.label}
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-1.5">
              <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
                {AI_MODELS.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id} className="items-start py-2.5">
                    <Sparkles className="mt-0.5 size-4 text-primary" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <InputGroupButton
            size="sm"
            variant="default"
            onClick={handleSubmit}
            disabled={!prompt.trim() || isPending}
            aria-label="Submit prompt"
            className="h-9 w-full rounded-full sm:h-8 sm:w-auto sm:rounded-4xl"
          >
            {isPending ? <Spinner className="size-4" /> : <ArrowUp />}
            <span className="sm:hidden">Build</span>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <div className="flex w-full flex-col gap-5 text-left">
        {promptTemplateCategories.map((category) => (
          <div key={category.name} className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {category.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {category.templates.map(({ label, icon: Icon, prompt: templatePrompt }) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start rounded-full min-[520px]:w-auto"
                  disabled={isPending}
                  onClick={() => applySuggestion(templatePrompt)}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        ))}

        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full rounded-full text-muted-foreground min-[520px]:w-auto"
            disabled={isPending}
            onClick={shuffleSuggestions}
          >
            <RefreshCw />
            Random idea
          </Button>
        </div>
      </div>
    </div>
  );
}
