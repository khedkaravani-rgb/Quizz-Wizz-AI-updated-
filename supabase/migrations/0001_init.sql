-- Quizz-Wizz-AI initial schema
-- Run with: supabase db push  (or paste into Supabase SQL editor)

-- ============ PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ QUIZZES ============
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  num_questions int not null default 5,
  created_at timestamptz not null default now()
);

alter table public.quizzes enable row level security;

create policy "Users can view own quizzes"
  on public.quizzes for select
  using (auth.uid() = user_id);

create policy "Users can insert own quizzes"
  on public.quizzes for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own quizzes"
  on public.quizzes for delete
  using (auth.uid() = user_id);

-- ============ QUESTIONS ============
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  options jsonb not null, -- e.g. ["A) ...", "B) ...", "C) ...", "D) ..."]
  correct_answer text not null, -- e.g. "B"
  explanation text,
  topic_tag text, -- fine-grained subtopic, used for misconception tracking
  created_at timestamptz not null default now()
);

alter table public.questions enable row level security;

-- Questions are readable only if the parent quiz belongs to the user.
-- Inserts happen via the Edge Function using the service role key, so no
-- insert policy is granted to regular users here.
create policy "Users can view questions of own quizzes"
  on public.questions for select
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id and q.user_id = auth.uid()
    )
  );

-- ============ ATTEMPTS ============
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score int, -- number correct
  total int  -- total questions in the attempt
);

alter table public.attempts enable row level security;

create policy "Users can view own attempts"
  on public.attempts for select
  using (auth.uid() = user_id);

create policy "Users can insert own attempts"
  on public.attempts for insert
  with check (auth.uid() = user_id);

-- ============ ANSWERS ============
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_answer text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

alter table public.answers enable row level security;

create policy "Users can view own answers"
  on public.answers for select
  using (
    exists (
      select 1 from public.attempts a
      where a.id = answers.attempt_id and a.user_id = auth.uid()
    )
  );

-- ============ MISCONCEPTIONS ============
create table if not exists public.misconceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  description text not null,
  occurrences int not null default 1,
  last_seen timestamptz not null default now(),
  unique (user_id, topic, description)
);

alter table public.misconceptions enable row level security;

create policy "Users can view own misconceptions"
  on public.misconceptions for select
  using (auth.uid() = user_id);

-- Indexes for common lookups
create index if not exists idx_quizzes_user on public.quizzes(user_id);
create index if not exists idx_questions_quiz on public.questions(quiz_id);
create index if not exists idx_attempts_user on public.attempts(user_id);
create index if not exists idx_attempts_quiz on public.attempts(quiz_id);
create index if not exists idx_answers_attempt on public.answers(attempt_id);
create index if not exists idx_misconceptions_user on public.misconceptions(user_id);
