interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
}
interface UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
    cacheControl?: string;
}
interface PresignedUrlOptions {
    expiresIn?: number;
}
export declare class R2StorageClient {
    private client;
    private bucketName;
    constructor(config: R2Config);
    upload(key: string, data: Buffer | Uint8Array | string, options?: UploadOptions): Promise<{
        key: string;
        url: string;
    }>;
    download(key: string): Promise<Buffer>;
    exists(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
    generatePublicUrl(key: string): string;
    getPresignedUrl(key: string, options?: PresignedUrlOptions): Promise<string>;
    uploadPDF(key: string, pdfBuffer: Buffer, metadata?: Record<string, string>): Promise<{
        key: string;
        url: string;
    }>;
    batchUpload(uploads: Array<{
        key: string;
        data: Buffer;
        options?: UploadOptions;
    }>, concurrency?: number): Promise<Array<{
        key: string;
        url: string;
        success: boolean;
        error?: string;
    }>>;
}
export declare function createR2Client(config?: Partial<R2Config>): R2StorageClient;
export declare class ScraperStorageManager {
    private r2;
    constructor(r2Client: R2StorageClient);
    storePastPaper(examBoard: string, subject: string, subjectCode: string, level: string, year: string, session: string, paperNumber: string, pdfBuffer: Buffer, paperType?: 'qp' | 'ms', originalUrl?: string): Promise<string>;
    hasPastPaper(examBoard: string, level: string, subjectCode: string, year: string, session: string, paperNumber: string, paperType?: 'qp' | 'ms'): Promise<boolean>;
    getPdfUrl(examBoard: string, level: string, subjectCode: string, year: string, session: string, paperNumber: string, paperType?: 'qp' | 'ms', options?: PresignedUrlOptions): Promise<string>;
    generatePublicUrl(key: string): string;
}
export {};
//# sourceMappingURL=r2_client_service.d.ts.map