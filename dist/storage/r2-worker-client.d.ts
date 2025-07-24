export declare class WorkerR2StorageManager {
    private bucket;
    private customDomain?;
    constructor(bucket: R2Bucket, customDomain?: string);
    storePastPaper(examBoard: string, subject: string, subjectCode: string, level: string, year: string, session: string, paperNumber: string, pdfBuffer: Buffer, paperType: 'qp' | 'ms', originalUrl: string): Promise<string>;
    hasPastPaper(examBoard: string, level: string, subjectCode: string, year: string, session: string, paperNumber: string, paperType: 'qp' | 'ms'): Promise<boolean>;
    generatePublicUrl(key: string): string;
    downloadPdf(key: string): Promise<Buffer | null>;
    listPapers(options?: {
        examBoard?: string;
        level?: string;
        subjectCode?: string;
        year?: string;
        limit?: number;
    }): Promise<Array<{
        key: string;
        metadata: Record<string, string>;
        size: number;
        uploaded: Date;
    }>>;
    deletePdf(key: string): Promise<boolean>;
    getStorageStats(): Promise<{
        totalObjects: number;
        totalSize: number;
        byExamBoard: Record<string, number>;
        byLevel: Record<string, number>;
        byYear: Record<string, number>;
    }>;
}
export declare function createWorkerR2Client(bucket: R2Bucket, customDomain?: string): WorkerR2StorageManager;
//# sourceMappingURL=r2-worker-client.d.ts.map