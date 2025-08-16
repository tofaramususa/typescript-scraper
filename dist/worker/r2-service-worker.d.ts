import type { PaperMetadata } from './scraper-worker';
export interface R2StorageResult {
    success: boolean;
    metadata: PaperMetadata;
    r2Url?: string;
    r2Key?: string;
    error?: string;
    skipped?: boolean;
    reason?: string;
}
export declare class WorkersR2Service {
    private bucket;
    private publicUrl?;
    constructor(bucket: any, publicUrl?: string);
    private generateR2Key;
    private generateR2Url;
    generatePresignedUrl(r2Key: string, expiresInSeconds?: number): Promise<string>;
    paperExistsInR2(metadata: PaperMetadata): Promise<{
        exists: boolean;
        r2Key: string;
        r2Url?: string;
    }>;
    storePDF(metadata: PaperMetadata, pdfBuffer: ArrayBuffer): Promise<R2StorageResult>;
    getStorageStats(): Promise<{
        totalObjects: number;
        totalSize: number;
    }>;
}
//# sourceMappingURL=r2-service-worker.d.ts.map