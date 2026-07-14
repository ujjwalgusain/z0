export type AiModel = {
  id: string;
  label: string;
  description: string;
};

export const AI_MODELS: AiModel[] = [
  {
    id: "openai/gpt-4o-mini",
    label: "z0 Lite",
    description: "Fastest and lowest cost",
  },
  {
    id: "openai/gpt-4.1-mini",
    label: "z0 Mini",
    description: "Better coding quality",
  },
  {
    id: "google/gemini-2.5-flash",
    label: "z0 Max",
    description: "Most capable coding model",
  },
];

export const DEFAULT_AI_MODEL = AI_MODELS[0].id;

export function isSupportedAiModel(value: unknown): value is string {
  return typeof value === "string" && AI_MODELS.some((model) => model.id === value);
}
