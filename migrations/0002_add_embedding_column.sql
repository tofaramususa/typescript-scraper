-- Add embedding column back with pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "past_papers" ADD COLUMN "embedding" vector(1536);