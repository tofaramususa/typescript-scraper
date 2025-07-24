export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}
export declare class SimpleLogger {
    private logLevel;
    private logFile?;
    private metrics;
    constructor(logLevel?: LogLevel, logDir?: string);
    private log;
    debug(message: string, data?: any): void;
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
    logMetric(operation: string, duration: number, success: boolean): void;
    getMetrics(): typeof this.metrics & {
        uptime: number;
    };
    logSystemMetrics(): void;
}
export declare const logger: SimpleLogger;
export declare function withMetrics<T>(operation: string, fn: () => Promise<T>): Promise<T>;
//# sourceMappingURL=simple-logger.d.ts.map