export interface ErrorWithContext {
    error: Error;
    context: string;
    operation: string;
    retryable: boolean;
}
export declare class SimpleErrorHandler {
    private errorCounts;
    handle(error: unknown, context: string, operation: string): ErrorWithContext;
    private normalizeError;
    private isRetryable;
    getStats(): Record<string, number>;
}
export declare function withRetry<T>(operation: () => Promise<T>, maxRetries?: number, baseDelay?: number, context?: string): Promise<T>;
export declare function safeAsync<T>(operation: () => Promise<T>, defaultValue: T, context?: string): Promise<{
    success: boolean;
    data: T;
    error?: string;
}>;
//# sourceMappingURL=error-handler.d.ts.map