export declare class PdfCache {
    private cacheDir;
    private maxSizeMB;
    private maxAge;
    constructor(cacheDir?: string, maxSizeMB?: number, maxAgeHours?: number);
    private getCacheKey;
    private getCacheFilePath;
    has(url: string): boolean;
    get(url: string): Buffer | null;
    set(url: string, buffer: Buffer): void;
    private getCurrentCacheSizeMB;
    private cleanupOldFiles;
    private cleanup;
    getStats(): {
        files: number;
        sizeMB: number;
        maxSizeMB: number;
    };
}
//# sourceMappingURL=pdf-cache.d.ts.map