import { z } from 'zod';
export interface Env {
    DATABASE_URL: string;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    R2_BUCKET_NAME: string;
    R2_PUBLIC_URL?: string;
    OPENAI_API_KEY: string;
    PAPERS_BUCKET: any;
}
declare const PaperMetadataSchema: z.ZodObject<{
    title: z.ZodString;
    year: z.ZodNumber;
    session: z.ZodString;
    paperNumber: z.ZodString;
    type: z.ZodEnum<["qp", "ms", "gt", "er", "ci"]>;
    subject: z.ZodString;
    level: z.ZodString;
    syllabus: z.ZodString;
    originalUrl: z.ZodString;
    downloadUrl: z.ZodString;
    filename: z.ZodString;
}, "strip", z.ZodTypeAny, {
    title: string;
    year: number;
    session: string;
    paperNumber: string;
    type: "qp" | "ms" | "gt" | "er" | "ci";
    subject: string;
    level: string;
    syllabus: string;
    originalUrl: string;
    downloadUrl: string;
    filename: string;
}, {
    title: string;
    year: number;
    session: string;
    paperNumber: string;
    type: "qp" | "ms" | "gt" | "er" | "ci";
    subject: string;
    level: string;
    syllabus: string;
    originalUrl: string;
    downloadUrl: string;
    filename: string;
}>;
export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;
interface ScraperConfig {
    startYear: number;
    endYear: number;
    delayMs: number;
    maxRetries: number;
    timeout: number;
}
interface ScrapedPaper {
    downloadUrl: string;
    metadata: PaperMetadata;
}
export declare class WorkersPapaCambridgeScraper {
    private config;
    constructor(config?: Partial<ScraperConfig>);
    scrapePapers(subjectUrl: string): Promise<ScrapedPaper[]>;
    private parseSubjectUrl;
    private extractYearUrls;
    private parseYearFromUrl;
    private extractPaperUrls;
    private createPaperMetadata;
    private parsePaperFilename;
    private fetchWithRetry;
    private delay;
}
export {};
//# sourceMappingURL=scraper-worker.d.ts.map