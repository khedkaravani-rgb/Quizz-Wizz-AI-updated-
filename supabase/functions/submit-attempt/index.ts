import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
type Letter = "A" | "B" | "C" | "D";
type IncomingAnswer = { question_id?: unknown; selected_answer?: unknown };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const validLetter = (value: unknown): value is Letter => value === "A" || value === "B" || value === "C" || value === "D";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST to submit an attempt." }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Function secrets are not configured." }, 503);

  const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in before submitting an attempt." }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);

  let body: { quiz_id?: unknown; answers?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  if (typeof body.quiz_id !== "string" || !body.quiz_id.trim()) return json({ error: "quiz_id is required." }, 400);
  if (!Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 100) return json({ error: "answers must contain between 1 and 100 records." }, 400);
  const incoming = body.answers as IncomingAnswer[];
  if (incoming.some((a) => typeof a.question_id !== "string" || !validLetter(a.selected_answer))) return json({ error: "Each answer needs a question_id and an A-D selected_answer." }, 400);
  const ids = incoming.map((a) => a.question_id as string);
  if (new Set(ids).size !== ids.length) return json({ error: "Duplicate question answers are not allowed." }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: quiz, error: quizError } = await admin.from("quizzes").select("id,user_id,topic").eq("id", body.quiz_id).maybeSingle();
  if (quizError) { console.error("Quiz lookup failed", quizError); return json({ error: "Could not load this quiz." }, 500); }
  if (!quiz) return json({ error: "Quiz not found." }, 404);
  if (quiz.user_id !== user.id) return json({ error: "You cannot submit an attempt for another learner's quiz." }, 403);

  const { data: questions, error: questionsError } = await admin.from("questions").select("id,correct_answer,topic_tag,misconceptions").eq("quiz_id", quiz.id).in("id", ids);
  if (questionsError) { console.error("Question lookup failed", questionsError); return json({ error: "Could not load quiz questions." }, 500); }
  if (!questions || questions.length !== ids.length) return json({ error: "One or more question IDs do not belong to this quiz." }, 400);
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const scored = incoming.map((answer) => {
    const question = questionById.get(answer.question_id as string)!;
    const isCorrect = question.correct_answer === answer.selected_answer;
    const misconception = Array.isArray(question.misconceptions) ? question.misconceptions.find((item: any) => item.option === answer.selected_answer) : null;
    return { question_id: question.id, selected_answer: answer.selected_answer as string, is_correct: isCorrect, topic_tag: question.topic_tag as string | null, misconception_description: misconception?.explanation ?? null };
  });
  const score = scored.filter((a) => a.is_correct).length;
  const { data: attempt, error: attemptError } = await admin.from("attempts").insert({ quiz_id: quiz.id, user_id: user.id, completed_at: new Date().toISOString(), score, total: scored.length }).select().single();
  if (attemptError || !attempt) { console.error("Attempt insert failed", attemptError); return json({ error: "Could not save the attempt." }, 500); }
  const answerRows = scored.map((a) => ({ attempt_id: attempt.id, question_id: a.question_id, selected_answer: a.selected_answer, is_correct: a.is_correct }));
  const { error: answerError } = await admin.from("answers").insert(answerRows);
  if (answerError) {
    console.error("Answer insert failed", answerError);
    await admin.from("attempts").delete().eq("id", attempt.id);
    return json({ error: "Could not save the answers." }, 500);
  }

  for (const wrong of scored.filter((a) => !a.is_correct && a.topic_tag)) {
    const description = wrong.misconception_description || `Missed a question on: ${wrong.topic_tag}`;
    const { data: existing } = await admin.from("misconceptions").select("id,occurrences").eq("user_id", user.id).eq("topic", quiz.topic).eq("description", description).maybeSingle();
    if (existing) {
      const { error } = await admin.from("misconceptions").update({ occurrences: existing.occurrences + 1, last_seen: new Date().toISOString() }).eq("id", existing.id);
      if (error) console.error("Misconception update failed", error);
    } else {
      const { error } = await admin.from("misconceptions").insert({ user_id: user.id, topic: quiz.topic, description });
      if (error) console.error("Misconception insert failed", error);
    }
  }
  return json({ attempt, score, total: scored.length, answers: scored.map(({ topic_tag: _topic, misconception_description: _misconception, ...answer }) => answer) }, 201);
});

