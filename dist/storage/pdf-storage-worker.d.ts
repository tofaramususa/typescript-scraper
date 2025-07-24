import { WorkerR2StorageManager } from './r2-worker-client';
import type { PaperMetadata } from '../utils/url-parser';
interface WorkerPdfStorageConfig {
    maxRetries: number;
    timeoutMs: number;
    maxFileSizeMB: number;
    concurrency: number;
    useBrowserless: boolean;
}
export interface WorkerStorageResult {
    success: boolean;
    metadata: PaperMetadata;
    r2Key?: string;
    r2Url?: string;
    error?: string;
    skipped?: boolean;
    reason?: string;
}
export declare class WorkerPdfStorageService {
    private config;
    private storageManager;
    private browserlessClient?;
    constructor(storageManager: WorkerR2StorageManager, config?: Partial<WorkerPdfStorageConfig>);
    storePdf(downloadUrl: string, metadata: PaperMetadata, options?: {
        skipIfExists?: boolean;
    }): Promise<WorkerStorageResult>;
    batchStorePdfs(papers: Array<{
        downloadUrl: string;
        metadata: PaperMetadata;
    }>, options?: {
        skipIfExists?: boolean;
        onProgress?: (completed: number, total: number) => void;
    }): Promise<WorkerStorageResult[]>;
    private downloadPdfWithRetry;
    private delay;
    getStats(results: WorkerStorageResult[]): {
        total: number;
        successful: number;
        skipped: number;
        failed: number;
        errors: string[];
    };
}
export {};
//# sourceMappingURL=pdf-storage-worker.d.ts.map