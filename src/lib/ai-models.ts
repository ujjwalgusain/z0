export type AiModel = {
  id: string;
  label: string;
  description: string;
};

export const AI_MODELS: AiModel[] = [
  {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    description: "Fast and budget-friendly",
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "Stronger coding quality",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Fast Gemini option",
  },
];

export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

export function isSupportedAiModel(value: unknown): value is string {
  return typeof value === "string" && AI_MODELS.some((model) => model.id === value);
}
