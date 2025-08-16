import { z } from 'zod';
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
export declare class PapaCambridgeScraper {
    private config;
    private httpClient;
    private requestCount;
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
    getStats(): {
        requestCount: number;
        config: ScraperConfig;
    };
}
export declare function createPapaCambridgeScraper(config?: Partial<ScraperConfig>): PapaCambridgeScraper;
export {};
//# sourceMappingURL=papacambridge-scraper.d.ts.map