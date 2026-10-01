import { supabase } from "./supabaseClient";

export type Difficulty = "easy" | "medium" | "hard";
export type AdaptiveQuestion = {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
  topic_tag: string;
  misconceptions: { option: "A" | "B" | "C" | "D"; explanation: string }[];
  follow_ups: {
    mistaken_option: "A" | "B" | "C" | "D";
    question: string;
    options: string[];
    correct_answer: "A" | "B" | "C" | "D";
    explanation: string;
  }[];
};
export type GeneratedQuiz = {
  quiz: { id: string; topic: string; difficulty: Difficulty };
  questions: AdaptiveQuestion[];
};

async function readableFunctionError(error: unknown, fallback: string): Promise<Error> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: unknown; message?: unknown };
        if (typeof body.error === "string") return new Error(body.error);
        if (typeof body.message === "string") return new Error(body.message);
      } catch { /* Fall through to the SDK's message. */ }
    }
  }
  if (error instanceof Error && error.message) return new Error(error.message);
  return new Error(fallback);
}

export async function generateQuiz(params: { topic: string; difficulty: Difficulty; numQuestions: number }): Promise<GeneratedQuiz> {
  if (!supabase) throw new Error("Supabase is not configured. Add its URL and publishable key to .env.local.");
  const { data, error } = await supabase.functions.invoke("generate-quiz", { body: params });
  if (error) throw await readableFunctionError(error, "Quiz generation failed.");
  return data as GeneratedQuiz;
}

export async function submitAttempt(params: { quiz_id: string; answers: { question_id: string; selected_answer: string }[] }) {
  if (!supabase) throw new Error("Supabase is not configured. Add its URL and publishable key to .env.local.");
  const { data, error } = await supabase.functions.invoke("submit-attempt", { body: params });
  if (error) throw await readableFunctionError(error, "Could not save this quiz attempt.");
  return data as { attempt: { id: string }; score: number; total: number; answers: { question_id: string; is_correct: boolean }[] };
}
