-- Store wrong-answer diagnoses and adaptive remediation alongside each generated question.
alter table public.questions
  add column if not exists misconceptions jsonb not null default '[]'::jsonb,
  add column if not exists follow_ups jsonb not null default '[]'::jsonb;
