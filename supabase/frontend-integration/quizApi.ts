// src/lib/quizApi.ts
import { supabase } from "./supabaseClient";

export async function generateQuiz(params: {
  topic: string;
  difficulty?: "easy" | "medium" | "hard";
  numQuestions?: number;
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be logged in.");

  const { data, error } = await supabase.functions.invoke("generate-quiz", {
    body: params,
  });

  if (error) throw error;
  return data as {
    quiz: { id: string; topic: string; difficulty: string };
    questions: {
      id: string;
      question_text: string;
      options: string[];
      correct_answer: string;
      explanation: string;
    }[];
  };
}

export async function submitAttempt(params: {
  quiz_id: string;
  answers: { question_id: string; selected_answer: string }[];
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) throw new Error("You must be logged in.");

  const { data, error } = await supabase.functions.invoke("submit-attempt", {
    body: params,
  });

  if (error) throw error;
  return data as {
    attempt: { id: string };
    score: number;
    total: number;
    answers: { question_id: string; is_correct: boolean }[];
  };
}
