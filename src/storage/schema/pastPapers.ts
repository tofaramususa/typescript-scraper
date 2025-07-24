import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';

export const paperTypeEnum = pgEnum('paper_type', ['qp', 'ms', 'gt', 'er', 'ci']);

export const pastPapersTable = pgTable('past_papers', {
  id: serial('id').primaryKey(),
  examBoard: text('exam_board').notNull(), // e.g. 'Cambridge', 'Edexcel'
  subject: text('subject').notNull(), // e.g. 'Mathematics', 'Physics'
  subjectCode: text('subject_code').notNull(), // e.g. '9709', '7404'
  level: text('level').notNull(), // e.g., 'A-level', 'GCSE'
  year: text('year').notNull(), // e.g. '2023', '2024'
  session: text('session').notNull(), // e.g. 'May/June', 'October/November'
  paperNumber: text('paper_number').notNull(), // e.g. 'Paper 11', 'Paper 12'
  paperType: paperTypeEnum('paper_type').notNull().default('qp'), // 'qp' for question paper, 'ms' for mark scheme
  r2Url: text('r2_url').notNull(), // URL of the PDF in R2 storage
  // embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small model produces 1536-dimensional embeddings
  embeddingModel: text('embedding_model'), // e.g. 'text-embedding-3-small'
  createdAt: timestamp('created_at').notNull().defaultNow(), // Timestamp when the record was created
  lastUpdated: timestamp('last_updated') // Timestamp when the record was last updated
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type InsertPastPaper = typeof pastPapersTable.$inferInsert;
export type SelectPastPaper = typeof pastPapersTable.$inferSelect;