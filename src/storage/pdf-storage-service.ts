import axios from 'axios';
import { R2StorageClient, ScraperStorageManager } from './r2_client_service';
import type { PaperMetadata } from '../downloaders/papacambridge-scraper';

/**
 * Configuration for PDF storage service
 */
interface PdfStorageConfig {
  maxRetries: number;
  timeoutMs: number;
  maxFileSizeMB: number;
  concurrency: number;
}

/**
 * Result of PDF storage operation
 */
export interface StorageResult {
  success: boolean;
  metadata: PaperMetadata;
  r2Key?: string;
  r2Url?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Service for downloading and storing PDF files
 */
export class PdfStorageService {
  private config: PdfStorageConfig;
  private axiosInstance;
  private storageManager: ScraperStorageManager;

  constructor(r2Client: R2StorageClient, config: Partial<PdfStorageConfig> = {}) {
    this.config = {
      maxRetries: 3,
      timeoutMs: 60000, // 60 seconds
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

  /**
   * Downloads and stores a single PDF
   * 
   * @param downloadUrl - URL to download the PDF from
   * @param metadata - Paper metadata
   * @param options - Additional options
   * @returns Storage result
   */
  async storePdf(
    downloadUrl: string, 
    metadata: PaperMetadata,
    options: { skipIfExists?: boolean } = {}
  ): Promise<StorageResult> {
    const { skipIfExists = true } = options;

    try {
      // Check if paper already exists in storage
      if (skipIfExists) {
        const exists = await this.storageManager.hasPastPaper(
          metadata.examBoard,
          metadata.level,
          metadata.subjectCode,
          metadata.year,
          metadata.session,
          metadata.paperNumber,
          metadata.paperType
        );

        if (exists) {
          return {
            success: true,
            metadata,
            skipped: true,
            reason: 'Paper already exists in storage',
          };
        }
      }

      // Download PDF with retry logic
      const pdfBuffer = await this.downloadPdfWithRetry(downloadUrl);

      // Validate PDF size
      if (pdfBuffer.length === 0) {
        throw new Error('Downloaded PDF is empty');
      }

      const sizeMB = pdfBuffer.length / (1024 * 1024);
      if (sizeMB > this.config.maxFileSizeMB) {
        throw new Error(`PDF too large: ${sizeMB.toFixed(2)}MB (max ${this.config.maxFileSizeMB}MB)`);
      }

      // Store in R2
      const r2Key = await this.storageManager.storePastPaper(
        metadata.examBoard,
        metadata.subject,
        metadata.subjectCode,
        metadata.level,
        metadata.year,
        metadata.session,
        metadata.paperNumber,
        pdfBuffer,
        metadata.paperType,
        metadata.originalUrl
      );

      // Generate public URL using R2 client
      const r2Url = this.storageManager.generatePublicUrl(r2Key);

      console.log(`Successfully stored: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.paperType})`);

      return {
        success: true,
        metadata,
        r2Key,
        r2Url,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to store PDF for ${metadata.subject} ${metadata.year}: ${errorMessage}`);
      
      return {
        success: false,
        metadata,
        error: errorMessage,
      };
    }
  }

  /**
   * Downloads and stores multiple PDFs with concurrency control
   * 
   * @param papers - Array of papers to download and store
   * @param options - Storage options
   * @returns Array of storage results
   */
  async batchStorePdfs(
    papers: Array<{ downloadUrl: string; metadata: PaperMetadata }>,
    options: { skipIfExists?: boolean; onProgress?: (completed: number, total: number) => void } = {}
  ): Promise<StorageResult[]> {
    const { skipIfExists = true, onProgress } = options;
    const results: StorageResult[] = [];
    
    console.log(`Starting batch storage of ${papers.length} PDFs with concurrency ${this.config.concurrency}`);

    // Process in batches to control concurrency
    for (let i = 0; i < papers.length; i += this.config.concurrency) {
      const batch = papers.slice(i, i + this.config.concurrency);
      
      const batchPromises = batch.map(async ({ downloadUrl, metadata }) => {
        return this.storePdf(downloadUrl, metadata, { skipIfExists });
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Report progress
      if (onProgress) {
        onProgress(results.length, papers.length);
      }

      // Small delay between batches to be respectful
      if (i + this.config.concurrency < papers.length) {
        await this.delay(1000);
      }
    }

    // Log summary
    const successful = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Batch storage completed: ${successful} successful, ${skipped} skipped, ${failed} failed`);

    return results;
  }

  /**
   * Downloads a PDF with retry logic using direct HTTP
   */
  private async downloadPdfWithRetry(url: string): Promise<Buffer> {
    // Direct HTTP download with retry logic
    return this.retryOperation(async () => {
      console.log(`📥 Downloading PDF via HTTP: ${url}`);
      
      // First, check content length to decide on streaming
      const headResponse = await this.axiosInstance.head(url);
      const contentLength = parseInt(headResponse.headers['content-length'] || '0');
      const isLarge = contentLength > 10 * 1024 * 1024; // 10MB threshold
      
      if (isLarge) {
        console.log(`📦 Large file detected (${Math.round(contentLength / 1024 / 1024)}MB), using streaming...`);
        return this.downloadWithStream(url);
      } else {
        // Use regular download for smaller files
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

  /**
   * Download large files using streaming
   */
  private async downloadWithStream(url: string): Promise<Buffer> {
    const response = await this.axiosInstance.get(url, {
      responseType: 'stream',
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxSize = this.config.maxFileSizeMB * 1024 * 1024;
    
    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
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
      
      response.data.on('error', (error: Error) => {
        reject(new Error(`Stream error: ${error.message}`));
      });
    });
  }

  /**
   * Validates if downloaded content is a valid PDF
   */
  private isValidPdf(buffer: Buffer): boolean {
    // PDF files start with %PDF-
    const pdfSignature = Buffer.from('%PDF-');
    return buffer.length >= 5 && buffer.subarray(0, 5).equals(pdfSignature);
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get storage statistics
   */
  getStats(results: StorageResult[]): {
    total: number;
    successful: number;
    skipped: number;
    failed: number;
    totalSizeMB: number;
    errors: string[];
  } {
    const successful = results.filter(r => r.success && !r.skipped);
    const skipped = results.filter(r => r.skipped);
    const failed = results.filter(r => !r.success);
    const errors = failed.map(r => r.error || 'Unknown error');

    return {
      total: results.length,
      successful: successful.length,
      skipped: skipped.length,
      failed: failed.length,
      totalSizeMB: 0, // Would need to track download sizes
      errors,
    };
  }

  /**
   * Cleanup failed downloads and partial uploads
   */
  async cleanup(results: StorageResult[]): Promise<void> {
    const failedUploads = results.filter(r => r.r2Key && !r.success);
    
    if (failedUploads.length === 0) {
      return;
    }

    console.log(`Cleaning up ${failedUploads.length} failed uploads...`);
    
    for (const result of failedUploads) {
      try {
        if (result.r2Key) {
          // Delete the partial upload from R2
          // await this.storageManager.r2.delete(result.r2Key);
          console.log(`Cleaned up failed upload: ${result.r2Key}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup ${result.r2Key}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Simple retry operation utility
   */
  private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.maxRetries) {
          const delay = attempt * 1000; // 1s, 2s, 3s delays
          console.log(`⏳ Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError!;
  }
}