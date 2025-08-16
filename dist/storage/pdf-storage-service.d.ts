import { R2StorageClient } from './r2_client_service';
import type { PaperMetadata } from '../downloaders/papacambridge-scraper';
interface PdfStorageConfig {
    maxRetries: number;
    timeoutMs: number;
    maxFileSizeMB: number;
    concurrency: number;
}
export interface StorageResult {
    success: boolean;
    metadata: PaperMetadata;
    r2Key?: string;
    r2Url?: string;
    error?: string;
    skipped?: boolean;
    reason?: string;
}
export declare class PdfStorageService {
    private config;
    private axiosInstance;
    private storageManager;
    constructor(r2Client: R2StorageClient, config?: Partial<PdfStorageConfig>);
    storePdf(downloadUrl: string, metadata: PaperMetadata, options?: {
        skipIfExists?: boolean;
    }): Promise<StorageResult>;
    batchStorePdfs(papers: Array<{
        downloadUrl: string;
        metadata: PaperMetadata;
    }>, options?: {
        skipIfExists?: boolean;
        onProgress?: (completed: number, total: number) => void;
    }): Promise<StorageResult[]>;
    private downloadPdfWithRetry;
    private downloadWithStream;
    private isValidPdf;
    private delay;
    getStats(results: StorageResult[]): {
        total: number;
        successful: number;
        skipped: number;
        failed: number;
        totalSizeMB: number;
        errors: string[];
    };
    cleanup(results: StorageResult[]): Promise<void>;
    private retryOperation;
}
export {};
//# sourceMappingURL=pdf-storage-service.d.ts.map