create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '관리자',
  created_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins can read own profile" on public.admin_profiles;
create policy "admins can read own profile"
on public.admin_profiles
for select
to authenticated
using (user_id = auth.uid());

create table if not exists public.question_documents (
  id uuid primary key default gen_random_uuid(),
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'review', 'completed', 'failed')),
  extracted_text text not null default '',
  extracted_count integer not null default 0 check (extracted_count >= 0),
  extraction_error text,
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  ordinal integer not null unique check (ordinal > 0),
  category text not null,
  prompt text not null,
  options jsonb not null
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  correct_answer integer not null
    check (correct_answer >= 0 and correct_answer < jsonb_array_length(options)),
  explanation text not null default '',
  source_reference text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  source_document_id uuid references public.question_documents (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_question_documents_updated_at on public.question_documents;
create trigger set_question_documents_updated_at
before update on public.question_documents
for each row execute function public.set_updated_at();

drop trigger if exists set_questions_updated_at on public.questions;
create trigger set_questions_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

alter table public.question_documents enable row level security;
alter table public.questions enable row level security;

drop policy if exists "admins can manage question documents" on public.question_documents;
create policy "admins can manage question documents"
on public.question_documents
for all
to authenticated
using (public.is_admin())
with check (public.is_admin() and uploaded_by = auth.uid());

drop policy if exists "published questions are readable" on public.questions;

create or replace view public.published_questions
as
select ordinal,
       category,
       prompt,
       options,
       explanation,
       source_reference
from public.questions
where status = 'published';

revoke all on public.questions from anon, authenticated;
revoke all on public.published_questions from public;
grant select on public.published_questions to anon, authenticated;

drop policy if exists "admins can insert questions" on public.questions;
create policy "admins can insert questions"
on public.questions
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "admins can update questions" on public.questions;
create policy "admins can update questions"
on public.questions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins can delete questions" on public.questions;
create policy "admins can delete questions"
on public.questions
for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-documents',
  'question-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/octet-stream',
    'application/x-hwp',
    'application/haansofthwp',
    'application/vnd.hancom.hwp'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins can read question source files" on storage.objects;
create policy "admins can read question source files"
on storage.objects
for select
to authenticated
using (bucket_id = 'question-documents' and public.is_admin());

drop policy if exists "admins can upload question source files" on storage.objects;
create policy "admins can upload question source files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'question-documents'
  and public.is_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "admins can update question source files" on storage.objects;
create policy "admins can update question source files"
on storage.objects
for update
to authenticated
using (bucket_id = 'question-documents' and public.is_admin())
with check (bucket_id = 'question-documents' and public.is_admin());

drop policy if exists "admins can delete question source files" on storage.objects;
create policy "admins can delete question source files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'question-documents' and public.is_admin());
