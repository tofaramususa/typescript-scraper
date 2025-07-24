import { BrowserlessClient } from '../services/browserless-client';
import { withRetry } from '../utils/error-handler';
export class WorkerPdfStorageService {
    config;
    storageManager;
    browserlessClient;
    constructor(storageManager, config = {}) {
        this.config = {
            maxRetries: 3,
            timeoutMs: 30000,
            maxFileSizeMB: 50,
            concurrency: 3,
            useBrowserless: true,
            ...config,
        };
        this.storageManager = storageManager;
        if (this.config.useBrowserless) {
            this.browserlessClient = new BrowserlessClient();
        }
    }
    async storePdf(downloadUrl, metadata, options = {}) {
        const { skipIfExists = true } = options;
        try {
            if (skipIfExists) {
                const exists = await this.storageManager.hasPastPaper(metadata.examBoard, metadata.level, metadata.subjectCode, metadata.year, metadata.session, metadata.paperNumber, metadata.paperType);
                if (exists) {
                    return {
                        success: true,
                        metadata,
                        skipped: true,
                        reason: 'Paper already exists in storage',
                    };
                }
            }
            const pdfBuffer = await this.downloadPdfWithRetry(downloadUrl);
            if (pdfBuffer.length === 0) {
                throw new Error('Downloaded PDF is empty');
            }
            const sizeMB = pdfBuffer.length / (1024 * 1024);
            if (sizeMB > this.config.maxFileSizeMB) {
                throw new Error(`PDF too large: ${sizeMB.toFixed(2)}MB (max ${this.config.maxFileSizeMB}MB)`);
            }
            const r2Key = await this.storageManager.storePastPaper(metadata.examBoard, metadata.subject, metadata.subjectCode, metadata.level, metadata.year, metadata.session, metadata.paperNumber, pdfBuffer, metadata.paperType, metadata.originalUrl);
            const r2Url = this.storageManager.generatePublicUrl(r2Key);
            console.log(`Successfully stored: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.paperType})`);
            return {
                success: true,
                metadata,
                r2Key,
                r2Url,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to store PDF for ${metadata.subject} ${metadata.year}: ${errorMessage}`);
            return {
                success: false,
                metadata,
                error: errorMessage,
            };
        }
    }
    async batchStorePdfs(papers, options = {}) {
        const { skipIfExists = true, onProgress } = options;
        const results = [];
        console.log(`Starting batch storage of ${papers.length} PDFs with concurrency ${this.config.concurrency}`);
        for (let i = 0; i < papers.length; i += this.config.concurrency) {
            const batch = papers.slice(i, i + this.config.concurrency);
            const batchPromises = batch.map(async ({ downloadUrl, metadata }) => {
                return this.storePdf(downloadUrl, metadata, { skipIfExists });
            });
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            if (onProgress) {
                onProgress(results.length, papers.length);
            }
            if (i + this.config.concurrency < papers.length) {
                await this.delay(1000);
            }
        }
        const successful = results.filter(r => r.success).length;
        const skipped = results.filter(r => r.skipped).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`Batch storage completed: ${successful} successful, ${skipped} skipped, ${failed} failed`);
        return results;
    }
    async downloadPdfWithRetry(url) {
        if (this.config.useBrowserless && this.browserlessClient) {
            try {
                console.log(`📥 Downloading PDF via Browserless: ${url}`);
                return await this.browserlessClient.downloadFile(url);
            }
            catch (error) {
                console.log(`🔄 Browserless download failed, falling back to direct HTTP: ${url}`);
                console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        return withRetry(async () => {
            console.log(`📥 Downloading PDF via HTTP: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }, this.config.maxRetries, 1000, `download-${url}`);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getStats(results) {
        const successful = results.filter(r => r.success && !r.skipped);
        const skipped = results.filter(r => r.skipped);
        const failed = results.filter(r => !r.success);
        const errors = failed.map(r => r.error || 'Unknown error');
        return {
            total: results.length,
            successful: successful.length,
            skipped: skipped.length,
            failed: failed.length,
            errors,
        };
    }
}
//# sourceMappingURL=pdf-storage-worker.js.map