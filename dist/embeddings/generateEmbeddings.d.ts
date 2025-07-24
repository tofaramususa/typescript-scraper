import type { PaperMetadata } from '../utils/url-parser';
interface EmbeddingsConfig {
    model: string;
    maxTokens: number;
    batchSize: number;
    maxRetries: number;
    rateLimitDelay: number;
    maxRequestsPerMinute: number;
}
export interface EmbeddingResult {
    success: boolean;
    metadata: PaperMetadata;
    embedding?: number[];
    embeddingModel?: string;
    extractedText?: string;
    error?: string;
    tokenCount?: number;
}
export declare class EmbeddingsService {
    private openai;
    private config;
    private requestTimes;
    constructor(apiKey: string, config?: Partial<EmbeddingsConfig>);
    generateEmbedding(metadata: PaperMetadata): Promise<EmbeddingResult>;
    batchGenerateEmbeddings(papers: Array<{
        metadata: PaperMetadata;
    }>, options?: {
        onProgress?: (completed: number, total: number) => void;
    }): Promise<EmbeddingResult[]>;
    private createSearchableText;
    private waitForRateLimit;
    private generateEmbeddingWithRetry;
    private truncateText;
    private estimateTokenCount;
    private delay;
    getStats(results: EmbeddingResult[]): {
        total: number;
        successful: number;
        failed: number;
        totalTokens: number;
        averageTokens: number;
        errors: string[];
    };
    static validateEmbedding(embedding: number[], expectedDimensions?: number): boolean;
}
export {};
//# sourceMappingURL=generateEmbeddings.d.ts.map