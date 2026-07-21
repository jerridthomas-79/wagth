import promptData from "../data/prompts.json";

export type PromptCard = {
  id: number;
  text: string;
  category: string;
  rating: string;
  active: boolean;
};

export const prompts = promptData as PromptCard[];
