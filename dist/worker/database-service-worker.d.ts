import type { PaperMetadata } from './scraper-worker';
export interface DatabaseResult {
    success: boolean;
    metadata: PaperMetadata;
    paperId?: number;
    error?: string;
    skipped?: boolean;
    reason?: string;
}
export declare class WorkersDatabaseService {
    private sql;
    constructor(databaseUrl: string);
    paperExists(metadata: PaperMetadata): Promise<{
        exists: boolean;
        paperId?: number;
    }>;
    insertPaper(metadata: PaperMetadata, r2Url: string, embedding?: number[], embeddingModel?: string): Promise<DatabaseResult>;
    private updatePaperEmbedding;
    getStats(): Promise<{
        totalPapers: number;
        papersWithEmbeddings: number;
        uniqueSubjects: number;
    }>;
}
//# sourceMappingURL=database-service-worker.d.ts.map