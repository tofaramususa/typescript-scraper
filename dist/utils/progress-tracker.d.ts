export interface ProgressState {
    sessionId: string;
    startTime: number;
    lastUpdate: number;
    totalPapers: number;
    processedPapers: string[];
    completedSteps: string[];
    currentStep: string;
    config: Record<string, any>;
}
export declare class ProgressTracker {
    private progressFile;
    private state;
    constructor(sessionId: string, progressDir?: string);
    private createNewSession;
    private loadProgress;
    saveProgress(): void;
    setTotal(total: number): void;
    markProcessed(paperUrl: string): void;
    isProcessed(paperUrl: string): boolean;
    completeStep(step: string): void;
    setCurrentStep(step: string): void;
    getProgress(): number;
    getStats(): {
        processed: number;
        total: number;
        percentage: number;
        elapsed: number;
        estimatedRemaining: number;
    };
    getUnprocessed<T extends {
        downloadUrl: string;
    }>(papers: T[]): T[];
    cleanup(): void;
    static generateSessionId(url: string): string;
}
//# sourceMappingURL=progress-tracker.d.ts.map