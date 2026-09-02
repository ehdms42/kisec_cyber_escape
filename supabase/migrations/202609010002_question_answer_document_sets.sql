alter table public.question_documents
  add column if not exists document_role text
    check (document_role in ('question', 'answer')),
  add column if not exists pair_id uuid;

create unique index if not exists question_documents_pair_role_unique
  on public.question_documents (pair_id, document_role)
  where pair_id is not null and document_role is not null;

alter table public.questions
  add column if not exists answer_document_id uuid
    references public.question_documents (id) on delete set null;

create index if not exists questions_answer_document_idx
  on public.questions (answer_document_id)
  where answer_document_id is not null;

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/octet-stream',
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/zip',
  'application/x-zip-compressed'
]
where id = 'question-documents';
