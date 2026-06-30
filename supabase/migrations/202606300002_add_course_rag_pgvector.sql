create extension if not exists vector with schema extensions;

create table if not exists public."CourseChunks" (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null,
  chunk_index integer not null default 0,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_chunks_course_id_idx
  on public."CourseChunks" (course_id);

create index if not exists course_chunks_embedding_idx
  on public."CourseChunks"
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_course_chunks(
  query_embedding extensions.vector(1536),
  match_course_id uuid,
  match_count int default 6
)
returns table (
  id uuid,
  course_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    cc.id,
    cc.course_id,
    cc.chunk_index,
    cc.content,
    cc.metadata,
    1 - (cc.embedding operator(extensions.<=>) query_embedding) as similarity
  from public."CourseChunks" cc
  where cc.course_id = match_course_id
  order by cc.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;
