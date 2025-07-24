import * as fs from 'fs';
import * as path from 'path';
export class ProgressTracker {
    progressFile;
    state;
    constructor(sessionId, progressDir = './.progress') {
        this.progressFile = path.join(progressDir, `${sessionId}.json`);
        if (!fs.existsSync(progressDir)) {
            fs.mkdirSync(progressDir, { recursive: true });
        }
        this.state = this.loadProgress() || this.createNewSession(sessionId);
    }
    createNewSession(sessionId) {
        return {
            sessionId,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            totalPapers: 0,
            processedPapers: [],
            completedSteps: [],
            currentStep: 'initializing',
            config: {}
        };
    }
    loadProgress() {
        try {
            if (fs.existsSync(this.progressFile)) {
                const data = fs.readFileSync(this.progressFile, 'utf8');
                const state = JSON.parse(data);
                console.log(`📂 Loaded progress: ${state.processedPapers.length}/${state.totalPapers} papers processed`);
                return state;
            }
        }
        catch (error) {
            console.warn(`⚠️  Failed to load progress file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return null;
    }
    saveProgress() {
        try {
            this.state.lastUpdate = Date.now();
            fs.writeFileSync(this.progressFile, JSON.stringify(this.state, null, 2));
        }
        catch (error) {
            console.warn(`⚠️  Failed to save progress: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    setTotal(total) {
        this.state.totalPapers = total;
        this.saveProgress();
    }
    markProcessed(paperUrl) {
        if (!this.state.processedPapers.includes(paperUrl)) {
            this.state.processedPapers.push(paperUrl);
            this.saveProgress();
        }
    }
    isProcessed(paperUrl) {
        return this.state.processedPapers.includes(paperUrl);
    }
    completeStep(step) {
        if (!this.state.completedSteps.includes(step)) {
            this.state.completedSteps.push(step);
            this.saveProgress();
        }
    }
    setCurrentStep(step) {
        this.state.currentStep = step;
        this.saveProgress();
    }
    getProgress() {
        if (this.state.totalPapers === 0)
            return 0;
        return Math.round((this.state.processedPapers.length / this.state.totalPapers) * 100);
    }
    getStats() {
        const processed = this.state.processedPapers.length;
        const total = this.state.totalPapers;
        const percentage = this.getProgress();
        const elapsed = Date.now() - this.state.startTime;
        let estimatedRemaining = 0;
        if (processed > 0) {
            const avgTimePerPaper = elapsed / processed;
            estimatedRemaining = avgTimePerPaper * (total - processed);
        }
        return {
            processed,
            total,
            percentage,
            elapsed,
            estimatedRemaining
        };
    }
    getUnprocessed(papers) {
        return papers.filter(paper => !this.isProcessed(paper.downloadUrl));
    }
    cleanup() {
        try {
            if (fs.existsSync(this.progressFile)) {
                fs.unlinkSync(this.progressFile);
                console.log('🗑️  Progress file cleaned up');
            }
        }
        catch (error) {
            console.warn(`⚠️  Failed to cleanup progress file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static generateSessionId(url) {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const relevant = pathParts.slice(-2).join('-');
        return `${relevant}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '');
    }
}
//# sourceMappingURL=progress-tracker.js.map