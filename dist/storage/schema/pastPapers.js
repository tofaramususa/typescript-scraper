import { pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core';
export const paperTypeEnum = pgEnum('paper_type', ['qp', 'ms', 'gt', 'er', 'ci']);
export const pastPapersTable = pgTable('past_papers', {
    id: serial('id').primaryKey(),
    examBoard: text('exam_board').notNull(),
    subject: text('subject').notNull(),
    subjectCode: text('subject_code').notNull(),
    level: text('level').notNull(),
    year: text('year').notNull(),
    session: text('session').notNull(),
    paperNumber: text('paper_number').notNull(),
    paperType: paperTypeEnum('paper_type').notNull().default('qp'),
    r2Url: text('r2_url').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    embeddingModel: text('embedding_model'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUpdated: timestamp('last_updated')
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});
//# sourceMappingURL=pastPapers.js.map