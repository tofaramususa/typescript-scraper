import { type SelectPastPaper } from './schema/pastPapers';
import type { PaperMetadata } from '../utils/url-parser';
import type { StorageResult } from './pdf-storage-service';
import type { EmbeddingResult } from '../embeddings/generateEmbeddings';
export interface DatabaseResult {
    success: boolean;
    metadata: PaperMetadata;
    paperId?: number;
    error?: string;
    skipped?: boolean;
    reason?: string;
}
export declare class DatabaseService {
    insertPaper(metadata: PaperMetadata, r2Url: string, embedding?: number[], embeddingModel?: string): Promise<DatabaseResult>;
    updatePaperEmbedding(paperId: number, embedding: number[], embeddingModel: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    findPaper(metadata: PaperMetadata): Promise<SelectPastPaper | null>;
    batchInsertPapers(storageResults: StorageResult[], embeddingResults?: EmbeddingResult[]): Promise<DatabaseResult[]>;
    batchUpdateEmbeddings(embeddingResults: EmbeddingResult[]): Promise<Array<{
        success: boolean;
        paperId?: number;
        error?: string;
    }>>;
    getPapers(criteria?: {
        examBoard?: string;
        subject?: string;
        subjectCode?: string;
        level?: string;
        year?: string;
        session?: string;
        paperType?: 'qp' | 'ms';
        limit?: number;
    }): Promise<SelectPastPaper[]>;
    getStats(): Promise<{
        totalPapers: number;
        papersWithEmbeddings: number;
        uniqueSubjects: number;
        uniqueYears: number;
        papersByType: {
            qp: number;
            ms: number;
        };
    }>;
    findSimilarPapers(queryEmbedding: number[], limit?: number, threshold?: number): Promise<Array<SelectPastPaper & {
        similarity: number;
    }>>;
    private createMetadataKey;
}
//# sourceMappingURL=database-service.d.ts.map