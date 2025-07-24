// Main file for class to interact with Cloudflare R2 storage
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

interface PresignedUrlOptions {
  expiresIn?: number; // seconds, default 3600 (1 hour)
}

export class R2StorageClient {
  private client: S3Client;
  private bucketName: string;

  constructor(config: R2Config) {
    this.bucketName = config.bucketName;
    
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  /**
   * Upload a file to R2
   */
  async upload(
    key: string, 
    data: Buffer | Uint8Array | string, 
    options: UploadOptions = {}
  ): Promise<{ key: string; url: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: data,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: options.metadata,
        CacheControl: options.cacheControl,
      });
      await this.client.send(command);
      return {
        key,
        url: this.generatePublicUrl(key)
      };
    } catch (error) {
      throw new Error(`Failed to upload ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  /**
   * Download a file from R2
   */
  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        throw new Error('No body in response');
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      throw new Error(`Failed to download ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }));
    } catch (error) {
      throw new Error(`Failed to delete ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate public URL for R2 object
   */
  generatePublicUrl(key: string): string {
    // Use custom domain if R2_CUSTOM_DOMAIN is set, otherwise use R2.dev domain
    const domain = process.env.R2_CUSTOM_DOMAIN || `${this.bucketName}.r2.dev`;
    return `https://${domain}/${key}`;
  }

  /**
   * Generate a presigned URL for temporary access
   */
  async getPresignedUrl(key: string, options: PresignedUrlOptions = {}): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: options.expiresIn || 3600, // 1 hour default
      });
    } catch (error) {
      throw new Error(`Failed to generate presigned URL for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload a PDF with optimized settings for our use case
   */
  async uploadPDF(key: string, pdfBuffer: Buffer, metadata?: Record<string, string>): Promise<{ key: string; url: string }> {
    return this.upload(key, pdfBuffer, {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000, immutable', // 1 year cache for PDFs
      metadata: {
        ...metadata,
        uploadedAt: new Date().toISOString(),
        source: 'sylabl-scraper'
      }
    });
  }

  /**
   * Batch upload with concurrency control
   */
  async batchUpload(
    uploads: Array<{ key: string; data: Buffer; options?: UploadOptions }>,
    concurrency = 5
  ): Promise<Array<{ key: string; url: string; success: boolean; error?: string }>> {
    const results: Array<{ key: string; url: string; success: boolean; error?: string }> = [];
    
    // Process uploads in batches
    for (let i = 0; i < uploads.length; i += concurrency) {
      const batch = uploads.slice(i, i + concurrency); 
      const batchPromises = batch.map(async ({ key, data, options }) => {
        try {
          const result = await this.upload(key, data, options);
          return { ...result, success: true };
        } catch (error) {
          return {
            key,
            url: '',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    return results;
  }
}

// Factory function for easy initialization
export function createR2Client(config?: Partial<R2Config>): R2StorageClient {
  const r2Config: R2Config = {
    accountId: config?.accountId || process.env.R2_ACCOUNT_ID!,
    accessKeyId: config?.accessKeyId || process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY!,
    bucketName: config?.bucketName || process.env.R2_BUCKET_NAME!,
  };
  // Validate required config
  const missing = Object.entries(r2Config).filter(([_, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing required R2 configuration: ${missing.join(', ')}`);
  }

  return new R2StorageClient(r2Config);
}

// Usage example for scraper integration
export class ScraperStorageManager {
  private r2: R2StorageClient;

  constructor(r2Client: R2StorageClient) {
    this.r2 = r2Client;
  }
  /**
   * Store a scraped PDF with organized naming
   */
  async storePastPaper(
    examBoard: string,
    subject: string,
    subjectCode: string,
    level: string,
    year: string,
    session: string,
    paperNumber: string,
    pdfBuffer: Buffer,
    paperType: 'qp' | 'ms' = 'qp',
    originalUrl?: string
  ): Promise<string> {
    // Organized key structure: examboard/level/subjectcode/year/session/paper_type.pdf
    const key = `past-papers/${examBoard.toLowerCase()}/${level.toLowerCase()}/${subjectCode}/${year}/${session}/${paperNumber}_${paperType}.pdf`;

    const metadata = {
      examBoard,
      subject,
      subjectCode,
      level,
      year,
      session,
      paperNumber,
      paperType,
      ...(originalUrl && { originalUrl }),
      scrapedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    const result = await this.r2.uploadPDF(key, pdfBuffer, metadata);
    return result.key;
  }

  /**
   * Check if we already have this past paper
   */
  async hasPastPaper(
    examBoard: string,
    level: string,
    subjectCode: string,
    year: string,
    session: string,
    paperNumber: string,
    paperType: 'qp' | 'ms' = 'qp'
  ): Promise<boolean> {
    const key = `past-papers/${examBoard.toLowerCase()}/${level.toLowerCase()}/${subjectCode}/${year}/${session}/${paperNumber}_${paperType}.pdf`;
    return this.r2.exists(key);
  }

  /**
   * Get PDF URL for a stored past paper
   */
  async getPdfUrl(
    examBoard: string,
    level: string,
    subjectCode: string,
    year: string,
    session: string,
    paperNumber: string,
    paperType: 'qp' | 'ms' = 'qp',
    options: PresignedUrlOptions = {}
  ): Promise<string> {
    const key = `past-papers/${examBoard.toLowerCase()}/${level.toLowerCase()}/${subjectCode}/${year}/${session}/${paperNumber}_${paperType}.pdf`;
    return this.r2.getPresignedUrl(key, options);
  }

  /**
   * Generate public URL for a stored paper
   */
  generatePublicUrl(key: string): string {
    return this.r2.generatePublicUrl(key);
  }
}