import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple progress tracking and resume capability
 */
export interface ProgressState {
  sessionId: string;
  startTime: number;
  lastUpdate: number;
  totalPapers: number;
  processedPapers: string[]; // Store paper URLs or IDs
  completedSteps: string[];
  currentStep: string;
  config: Record<string, any>;
}

export class ProgressTracker {
  private progressFile: string;
  private state: ProgressState;

  constructor(sessionId: string, progressDir: string = './.progress') {
    this.progressFile = path.join(progressDir, `${sessionId}.json`);
    
    // Create progress directory if it doesn't exist
    if (!fs.existsSync(progressDir)) {
      fs.mkdirSync(progressDir, { recursive: true });
    }

    this.state = this.loadProgress() || this.createNewSession(sessionId);
  }

  /**
   * Create a new session
   */
  private createNewSession(sessionId: string): ProgressState {
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

  /**
   * Load existing progress
   */
  private loadProgress(): ProgressState | null {
    try {
      if (fs.existsSync(this.progressFile)) {
        const data = fs.readFileSync(this.progressFile, 'utf8');
        const state = JSON.parse(data);
        console.log(`📂 Loaded progress: ${state.processedPapers.length}/${state.totalPapers} papers processed`);
        return state;
      }
    } catch (error) {
      console.warn(`⚠️  Failed to load progress file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return null;
  }

  /**
   * Save current progress
   */
  saveProgress(): void {
    try {
      this.state.lastUpdate = Date.now();
      fs.writeFileSync(this.progressFile, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.warn(`⚠️  Failed to save progress: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set total number of papers
   */
  setTotal(total: number): void {
    this.state.totalPapers = total;
    this.saveProgress();
  }

  /**
   * Mark a paper as processed
   */
  markProcessed(paperUrl: string): void {
    if (!this.state.processedPapers.includes(paperUrl)) {
      this.state.processedPapers.push(paperUrl);
      this.saveProgress();
    }
  }

  /**
   * Check if a paper was already processed
   */
  isProcessed(paperUrl: string): boolean {
    return this.state.processedPapers.includes(paperUrl);
  }

  /**
   * Mark a step as completed
   */
  completeStep(step: string): void {
    if (!this.state.completedSteps.includes(step)) {
      this.state.completedSteps.push(step);
      this.saveProgress();
    }
  }

  /**
   * Set current step
   */
  setCurrentStep(step: string): void {
    this.state.currentStep = step;
    this.saveProgress();
  }

  /**
   * Get progress percentage
   */
  getProgress(): number {
    if (this.state.totalPapers === 0) return 0;
    return Math.round((this.state.processedPapers.length / this.state.totalPapers) * 100);
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    processed: number;
    total: number;
    percentage: number;
    elapsed: number;
    estimatedRemaining: number;
  } {
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

  /**
   * Get unprocessed papers from a list
   */
  getUnprocessed<T extends { downloadUrl: string }>(papers: T[]): T[] {
    return papers.filter(paper => !this.isProcessed(paper.downloadUrl));
  }

  /**
   * Clean up progress file
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.progressFile)) {
        fs.unlinkSync(this.progressFile);
        console.log('🗑️  Progress file cleaned up');
      }
    } catch (error) {
      console.warn(`⚠️  Failed to cleanup progress file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate session ID from URL
   */
  static generateSessionId(url: string): string {
    // Extract meaningful parts from URL for session ID
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const relevant = pathParts.slice(-2).join('-'); // Last 2 path segments
    return `${relevant}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, '');
  }
}