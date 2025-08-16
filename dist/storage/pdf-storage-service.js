import axios from 'axios';
import { ScraperStorageManager } from './r2_client_service';
export class PdfStorageService {
    config;
    axiosInstance;
    storageManager;
    constructor(r2Client, config = {}) {
        this.config = {
            maxRetries: 3,
            timeoutMs: 60000,
            maxFileSizeMB: 50,
            concurrency: 5,
            ...config,
        };
        this.axiosInstance = axios.create({
            timeout: this.config.timeoutMs,
            maxContentLength: this.config.maxFileSizeMB * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        this.storageManager = new ScraperStorageManager(r2Client);
    }
    async storePdf(downloadUrl, metadata, options = {}) {
        const { skipIfExists = true } = options;
        try {
            if (skipIfExists) {
                const exists = await this.storageManager.hasPastPaper('Cambridge', metadata.level, metadata.syllabus, metadata.year.toString(), metadata.session, metadata.paperNumber, metadata.type);
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
            const r2Key = await this.storageManager.storePastPaper('Cambridge', metadata.subject, metadata.syllabus, metadata.level, metadata.year.toString(), metadata.session, metadata.paperNumber, pdfBuffer, metadata.type, metadata.originalUrl);
            const r2Url = this.storageManager.generatePublicUrl(r2Key);
            console.log(`Successfully stored: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.type})`);
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
        return this.retryOperation(async () => {
            console.log(`📥 Downloading PDF via HTTP: ${url}`);
            const headResponse = await this.axiosInstance.head(url);
            const contentLength = parseInt(headResponse.headers['content-length'] || '0');
            const isLarge = contentLength > 10 * 1024 * 1024;
            if (isLarge) {
                console.log(`📦 Large file detected (${Math.round(contentLength / 1024 / 1024)}MB), using streaming...`);
                return this.downloadWithStream(url);
            }
            else {
                const response = await this.axiosInstance.get(url, {
                    responseType: 'arraybuffer',
                });
                if (response.status === 200) {
                    return Buffer.from(response.data);
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        });
    }
    async downloadWithStream(url) {
        const response = await this.axiosInstance.get(url, {
            responseType: 'stream',
        });
        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const chunks = [];
        let totalSize = 0;
        const maxSize = this.config.maxFileSizeMB * 1024 * 1024;
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                totalSize += chunk.length;
                if (totalSize > maxSize) {
                    reject(new Error(`File too large: ${Math.round(totalSize / 1024 / 1024)}MB > ${this.config.maxFileSizeMB}MB`));
                    return;
                }
                chunks.push(chunk);
            });
            response.data.on('end', () => {
                console.log(`✅ Downloaded ${Math.round(totalSize / 1024 / 1024)}MB successfully`);
                resolve(Buffer.concat(chunks));
            });
            response.data.on('error', (error) => {
                reject(new Error(`Stream error: ${error.message}`));
            });
        });
    }
    isValidPdf(buffer) {
        const pdfSignature = Buffer.from('%PDF-');
        return buffer.length >= 5 && buffer.subarray(0, 5).equals(pdfSignature);
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
            totalSizeMB: 0,
            errors,
        };
    }
    async cleanup(results) {
        const failedUploads = results.filter(r => r.r2Key && !r.success);
        if (failedUploads.length === 0) {
            return;
        }
        console.log(`Cleaning up ${failedUploads.length} failed uploads...`);
        for (const result of failedUploads) {
            try {
                if (result.r2Key) {
                    console.log(`Cleaned up failed upload: ${result.r2Key}`);
                }
            }
            catch (error) {
                console.warn(`Failed to cleanup ${result.r2Key}:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
    }
    async retryOperation(operation) {
        let lastError;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (attempt < this.config.maxRetries) {
                    const delay = attempt * 1000;
                    console.log(`⏳ Attempt ${attempt} failed, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }
}
//# sourceMappingURL=pdf-storage-service.js.map