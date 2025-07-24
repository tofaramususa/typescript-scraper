interface BrowserlessConfig {
    apiKey: string;
    baseUrl: string;
    timeout: number;
    useResidentialProxy: boolean;
    maxRetries: number;
    rateLimitDelay: number;
    useContentApiOnly: boolean;
}
interface ContentOptions {
    url: string;
    waitForSelector?: string;
    waitForTimeout?: number;
    rejectResourceTypes?: string[];
    rejectRequestPattern?: string[];
    bestAttempt?: boolean;
    gotoOptions?: {
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
        timeout?: number;
    };
}
interface UnblockOptions {
    url: string;
    content?: boolean;
    screenshot?: boolean;
    cookies?: boolean;
    browserWSEndpoint?: boolean;
}
export declare class BrowserlessClient {
    private config;
    private httpClient;
    private lastRequestTime;
    private requestCount;
    constructor(config?: Partial<BrowserlessConfig>);
    getContent(options: ContentOptions): Promise<string>;
    getUnblockedContent(options: UnblockOptions): Promise<string>;
    extractContent(url: string, options?: Partial<ContentOptions>): Promise<string>;
    extractContentWithRetry(url: string, options?: Partial<ContentOptions>): Promise<string>;
    downloadFile(url: string): Promise<Buffer>;
    private delay;
    private enforceRateLimit;
    testConnection(): Promise<void>;
    getConfig(): Omit<BrowserlessConfig, 'apiKey'>;
    getRateLimitStats(): {
        requestCount: number;
        lastRequestTime: number;
        rateLimitDelay: number;
        timeSinceLastRequest: number;
    };
}
export declare function createBrowserlessClient(config?: Partial<BrowserlessConfig>): BrowserlessClient;
export {};
//# sourceMappingURL=browserless-client.d.ts.map