import type { PaperMetadata } from './scraper-worker';
export interface EmbeddingResult {
    success: boolean;
    metadata: PaperMetadata;
    embedding?: number[];
    embeddingModel?: string;
    error?: string;
}
export declare class WorkersEmbeddingService {
    private apiKey;
    private model;
    constructor(apiKey: string);
    generateEmbedding(metadata: PaperMetadata): Promise<EmbeddingResult>;
    generateEmbeddings(metadataList: PaperMetadata[]): Promise<EmbeddingResult[]>;
    private createPaperText;
}
//# sourceMappingURL=embedding-service-worker.d.ts.map