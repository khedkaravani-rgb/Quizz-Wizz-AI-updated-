import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
type Difficulty = "easy" | "medium" | "hard";
type OptionLetter = "A" | "B" | "C" | "D";
type GeneratedQuestion = {
  question: string;
  options: [string, string, string, string];
  correct_answer: OptionLetter;
  explanation: string;
  topic_tag: string;
  misconceptions: { option: OptionLetter; explanation: string }[];
  follow_ups: { mistaken_option: OptionLetter; question: string; options: [string, string, string, string]; correct_answer: OptionLetter; explanation: string }[];
};
const letters: OptionLetter[] = ["A", "B", "C", "D"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
function validQuestion(q: any): q is GeneratedQuestion {
  return q && typeof q.question === "string" && q.question.length > 0 && Array.isArray(q.options) && q.options.length === 4 &&
    q.options.every((x: unknown) => typeof x === "string") && letters.includes(q.correct_answer) && typeof q.explanation === "string" &&
    typeof q.topic_tag === "string" && Array.isArray(q.misconceptions) && Array.isArray(q.follow_ups) &&
    q.misconceptions.length === 3 && q.follow_ups.length === 3 &&
    q.misconceptions.every((m: any) => letters.includes(m.option) && m.option !== q.correct_answer && typeof m.explanation === "string") &&
    q.follow_ups.every((f: any) => letters.includes(f.mistaken_option) && f.mistaken_option !== q.correct_answer && typeof f.question === "string" &&
      Array.isArray(f.options) && f.options.length === 4 && f.options.every((x: unknown) => typeof x === "string") && letters.includes(f.correct_answer) && typeof f.explanation === "string");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST to generate a quiz." }, 405);
  if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Function secrets are not configured. Add GEMINI_API_KEY to Supabase Function secrets." }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in before generating a quiz." }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await userClient.auth.getUser(token);
  if (authError || !user) return json({ error: "Your session is invalid or expired. Sign in again." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const difficulty = body.difficulty;
  const numQuestions = Math.floor(Number(body.numQuestions) || 5);
  if (!topic || topic.length > 120) return json({ error: "topic must be between 1 and 120 characters." }, 400);
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") return json({ error: "difficulty must be easy, medium, or hard." }, 400);
  if (numQuestions < 1 || numQuestions > 10) return json({ error: "numQuestions must be between 1 and 10." }, 400);

  const questionSchema = {
    type: "object",
    properties: {
      question: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      correct_answer: { type: "string" },
      explanation: { type: "string" },
      topic_tag: { type: "string" },
      misconceptions: { type: "array", items: { type: "object", properties: { option: { type: "string" }, explanation: { type: "string" } }, required: ["option", "explanation"] } },
      follow_ups: { type: "array", items: { type: "object", properties: { mistaken_option: { type: "string" }, question: { type: "string" }, options: { type: "array", items: { type: "string" } }, correct_answer: { type: "string" }, explanation: { type: "string" } }, required: ["mistaken_option", "question", "options", "correct_answer", "explanation"] } },
    },
    required: ["question", "options", "correct_answer", "explanation", "topic_tag", "misconceptions", "follow_ups"],
  };
  const responseSchema = {
    type: "object",
    properties: { questions: { type: "array", items: questionSchema } },
    required: ["questions"],
  };

  let aiResponse: Response | undefined;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      aiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": GEMINI_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Create accurate educational multiple-choice questions. Generate exactly ${numQuestions} ${difficulty} questions about ${JSON.stringify(topic)}. Every main question must have four distinct options (answer letters A-D correspond to option positions), one correct answer, a concise explanation, a specific topic tag, exactly three misconception explanations (one keyed to each wrong option), and exactly three easier follow-up questions (one keyed to each wrong option) that target the specific misconception. Every follow-up must also have four options, a correct answer letter, and an explanation. Return a JSON object with this shape: {"questions":[{"question":"...","options":["...","...","...","..."],"correct_answer":"A","explanation":"...","topic_tag":"...","misconceptions":[{"option":"B","explanation":"..."},{"option":"C","explanation":"..."},{"option":"D","explanation":"..."}],"follow_ups":[{"mistaken_option":"B","question":"...","options":["...","...","...","..."],"correct_answer":"A","explanation":"..."},{"mistaken_option":"C","question":"...","options":["...","...","...","..."],"correct_answer":"B","explanation":"..."},{"mistaken_option":"D","question":"...","options":["...","...","...","..."],"correct_answer":"C","explanation":"..."}]}]}.`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.5,
              responseFormat: {
                text: {
                  mimeType: "APPLICATION_JSON",
                  schema: responseSchema,
                },
              },
            },
          }),
        },
      );
    } catch (error) {
      console.error("Gemini request failed", error);
      return json({ error: "Could not reach Gemini. Please try again." }, 502);
    }
    if (aiResponse.status !== 503 || attempt === maxAttempts) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
   if (!aiResponse) {
    return json({ error: "Could not reach Gemini. Please try again." }, 502);
  }
   if (!aiResponse.ok) {
    const providerError = await aiResponse.text();
    console.error("Gemini returned status", aiResponse.status, providerError);
    let providerMessage = "";
    try {
      const parsedError = JSON.parse(providerError);
      providerMessage = typeof parsedError.error?.message === "string" ? parsedError.error.message : "";
    } catch { /* The HTTP status is still useful if Google's error body is not JSON. */ }

    const lowerMessage = providerMessage.toLowerCase();
    if (/api key|credential|unauthorized|permission denied/.test(lowerMessage)) {
      return json({ error: `Gemini rejected the API key or its permissions: ${providerMessage.slice(0, 300)}` }, 502);
    }
    if (aiResponse.status === 429) {
      return json({ error: `Gemini rate limit or free-tier quota reached${providerMessage ? `: ${providerMessage.slice(0, 300)}` : ". Check AI Studio usage and limits."}` }, 429);
    }
    if (aiResponse.status === 404) {
      return json({ error: `Gemini model or endpoint was not found: ${providerMessage.slice(0, 300)}` }, 502);
    }
    return json({ error: `Gemini request failed (HTTP ${aiResponse.status})${providerMessage ? `: ${providerMessage.slice(0, 300)}` : ". Check the Gemini request configuration."}` }, 502);
  }

  let generated: GeneratedQuestion[];
  try {
    const result = await aiResponse.json();
    const content = result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
    if (!content) throw new Error("Gemini returned no text content");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.questions) || parsed.questions.length !== numQuestions || !parsed.questions.every(validQuestion)) throw new Error("Invalid quiz shape");
    generated = parsed.questions;
  } catch (error) {
    console.error("Invalid Gemini quiz response", error);
    return json({ error: "Gemini returned a quiz in an unexpected format. Please retry." }, 502);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: quiz, error: quizError } = await admin.from("quizzes").insert({ user_id: user.id, topic, difficulty, num_questions: generated.length }).select("id, topic, difficulty").single();
  if (quizError || !quiz) {
    console.error("Quiz insert failed", quizError);
    return json({ error: "Could not save the quiz. Make sure the Supabase migration has been applied." }, 500);
  }
  const rows = generated.map((q) => ({ quiz_id: quiz.id, question_text: q.question, options: q.options, correct_answer: q.correct_answer, explanation: q.explanation, topic_tag: q.topic_tag, misconceptions: q.misconceptions, follow_ups: q.follow_ups }));
  const { data: questions, error: questionError } = await admin.from("questions").insert(rows).select("id, question_text, options, correct_answer, explanation, topic_tag, misconceptions, follow_ups");
  if (questionError || !questions) {
    console.error("Question insert failed", questionError);
    await admin.from("quizzes").delete().eq("id", quiz.id);
    return json({ error: "Could not save generated questions. Make sure the adaptive-question migration has been applied." }, 500);
  }
  return json({ quiz, questions }, 201);
});
