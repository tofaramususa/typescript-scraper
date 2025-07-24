import type { PaperMetadata } from '../utils/url-parser';
interface ScraperConfig {
    startYear: number;
    endYear: number;
    maxRetries: number;
    delayMs: number;
    userAgent: string;
    useBrowserless: boolean;
}
export interface ScrapedPaper {
    metadata: PaperMetadata;
    downloadUrl: string;
}
export declare class PastPapersScraper {
    private config;
    private axiosInstance;
    private browserlessClient;
    constructor(config?: Partial<ScraperConfig>);
    scrapePapers(subjectUrl: string): Promise<ScrapedPaper[]>;
    private discoverDirectories;
    private isRelevantSessionDirectory;
    private logScrapingSummary;
    private scrapeSession;
    private isValidPaperFilename;
    private fetchWithRetry;
    private fetchWithHttp;
    private delay;
    static getUniqueSubjects(papers: ScrapedPaper[]): string[];
    static getUniqueYears(papers: ScrapedPaper[]): string[];
    static filterPapers(papers: ScrapedPaper[], criteria: {
        year?: string;
        session?: string;
        paperType?: 'qp' | 'ms';
        subject?: string;
    }): ScrapedPaper[];
}
export {};
//# sourceMappingURL=pastpapers-co-scraper.d.ts.map