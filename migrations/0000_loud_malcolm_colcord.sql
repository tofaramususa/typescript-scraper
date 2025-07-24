CREATE TYPE "public"."paper_type" AS ENUM('qp', 'ms', 'gt', 'er', 'ci');--> statement-breakpoint
CREATE TABLE "past_papers" (
	"id" serial PRIMARY KEY NOT NULL,
	"exam_board" text NOT NULL,
	"subject" text NOT NULL,
	"subject_code" text NOT NULL,
	"level" text NOT NULL,
	"year" text NOT NULL,
	"session" text NOT NULL,
	"paper_number" text NOT NULL,
	"paper_type" "paper_type" DEFAULT 'qp' NOT NULL,
	"r2_url" text NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
