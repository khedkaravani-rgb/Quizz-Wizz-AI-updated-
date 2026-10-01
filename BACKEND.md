# Quizz-Wizz-AI — Supabase backend

The app uses Supabase Auth and Postgres, Supabase Edge Functions, and Gemini 2.5 Flash for quiz generation. The React app signs learners in with email and password, generates quizzes through `generate-quiz`, shows answer-specific feedback and easier follow-up questions, then submits answers to `submit-attempt` for server-side scoring.

## Configure the app

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` to `https://zhjeweayozglwpxxsnzp.supabase.co` (or your own project URL).
3. Set `VITE_SUPABASE_ANON_KEY` to the project's publishable key. It is meant for browser clients. Never put `GEMINI_API_KEY` or the service-role key in a `VITE_` variable.
4. Enable Email authentication in Supabase Dashboard → Authentication → Providers. With email confirmation enabled, new learners must confirm before signing in.

The frontend API is already connected in `src/lib/`; there is no need to copy helper files from another folder.

## Apply the database schema

From this project folder, run:

```powershell
supabase db push
```

This creates the profiles, quizzes, questions, attempts, answers, and misconceptions tables and applies the adaptive follow-up columns in `supabase/migrations/`.

## Configure and deploy functions

Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey), then store it as the Supabase Function secret `GEMINI_API_KEY`. Do not put it in `.env.local` or frontend code. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to functions.

```powershell
supabase secrets set GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
supabase functions deploy generate-quiz
supabase functions deploy submit-attempt
```

Both functions require a valid signed-in user's Supabase access token. `generate-quiz` accepts `{ "topic": "Photosynthesis", "difficulty": "easy", "numQuestions": 5 }`; it calls Gemini, then saves a quiz with per-option misconception explanations and targeted follow-ups. `submit-attempt` accepts `{ "quiz_id": "...", "answers": [{ "question_id": "...", "selected_answer": "A" }] }`; it scores on the server, stores answers, and tracks misconception descriptions.

Gemini free-tier availability and request limits depend on the selected model and project and can change. Check AI Studio's Usage page if generation is rate-limited. Google currently says content sent on the free tier may be used to improve its products, so avoid sending confidential or sensitive learner data.

If the CLI reports an internal deploy 500, retry that function once with `--debug`. A Docker warning by itself does not block a remote deploy.

## Run the app

```powershell
npm install
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's environment settings before deploying the frontend. Keep `GEMINI_API_KEY` only in Supabase Function secrets.
