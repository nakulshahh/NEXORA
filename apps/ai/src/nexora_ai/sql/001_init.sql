-- The AI service owns the `rag` schema. The Express API owns `public`. They share a database server, not tables.
-- Requires the `vector` extension (pgvector). Neon, Supabase and the pgvector/pgvector Docker image all provide it.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS rag;

CREATE TABLE IF NOT EXISTS rag.meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS rag.documents (
  id           bigserial PRIMARY KEY,
  source_key   text NOT NULL UNIQUE,          -- e.g. lesson:A1/http-messages
  kind         text NOT NULL,                 -- lesson | article | doc | transcript
  title        text NOT NULL,
  chapter      text,
  lesson_slug  text,
  url          text,                          -- external sources only
  license      text,                          -- required for non-lesson sources
  content_hash text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rag.chunks (
  id            bigserial PRIMARY KEY,
  document_id   bigint NOT NULL REFERENCES rag.documents(id) ON DELETE CASCADE,
  ord           int NOT NULL,
  kind          text NOT NULL,                -- text | code | misconception | check | summary
  section       text NOT NULL,
  heading_path  text NOT NULL,
  anchor        text NOT NULL DEFAULT '',
  text          text NOT NULL,
  context       text NOT NULL,
  content_hash  text NOT NULL,
  -- keyword search over context + text, English stemming. Generated, so it can never drift from the text.
  tsv           tsvector GENERATED ALWAYS AS (to_tsvector('english', context || ' ' || text)) STORED,
  embedding     vector(384) NOT NULL,
  UNIQUE (document_id, ord)
);

CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON rag.chunks USING gin (tsv);
-- Approximate nearest neighbour. For a few hundred chunks an exact scan is just as fast; the index is here so the
-- same query keeps working when the corpus grows to tens of thousands.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON rag.chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_doc_idx ON rag.chunks (document_id);
