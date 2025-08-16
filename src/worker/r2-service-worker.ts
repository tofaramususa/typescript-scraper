/**
 * Cloudflare Workers-compatible R2 service
 * Handles R2 storage operations and duplicate checking
 */

import type { PaperMetadata } from './scraper-worker';

/**
 * R2 storage result interface
 */
export interface R2StorageResult {
  success: boolean;
  metadata: PaperMetadata;
  r2Url?: string;
  r2Key?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Workers-compatible R2 service
 */
export class WorkersR2Service {
  private bucket: any; // R2Bucket type from @cloudflare/workers-types
  private publicUrl?: string;

  constructor(bucket: any, publicUrl?: string) {
    this.bucket = bucket;
    this.publicUrl = publicUrl;
  }

  /**
   * Generate R2 key for a paper
   */
  private generateR2Key(metadata: PaperMetadata): string {
    return `past-papers/caie/${metadata.level.toLowerCase()}/${metadata.syllabus}/${metadata.year}/${metadata.session}/${metadata.paperNumber}_${metadata.type}.pdf`;
  }

  /**
   * Generate public R2 URL for a paper
   */
  private generateR2Url(r2Key: string): string {
    // Store just the R2 key - we'll generate presigned URLs on demand
    return r2Key;
  }

  /**
   * Generate presigned URL for temporary access (1 hour expiry)
   */
  async generatePresignedUrl(r2Key: string, expiresInSeconds: number = 3600): Promise<string> {
    try {
      // Generate presigned URL for the R2 object
      const presignedUrl = await this.bucket.sign(r2Key, {
        method: 'GET',
        expiresIn: expiresInSeconds,
      });
      
      return presignedUrl;
    } catch (error) {
      console.error(`Failed to generate presigned URL for ${r2Key}:`, error);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Check if paper already exists in R2
   */
  async paperExistsInR2(metadata: PaperMetadata): Promise<{ exists: boolean; r2Key: string; r2Url?: string }> {
    const r2Key = this.generateR2Key(metadata);
    
    try {
      const object = await this.bucket.head(r2Key);
      
      if (object) {
        return { 
          exists: true, 
          r2Key,
          r2Url: this.generateR2Url(r2Key)
        };
      }
      
      return { exists: false, r2Key };
    } catch (error) {
      // HEAD operation failed, assume object doesn't exist
      return { exists: false, r2Key };
    }
  }

  /**
   * Store PDF in R2 with metadata
   */
  async storePDF(
    metadata: PaperMetadata,
    pdfBuffer: ArrayBuffer
  ): Promise<R2StorageResult> {
    try {
      // Check if already exists
      const existsResult = await this.paperExistsInR2(metadata);
      
      if (existsResult.exists) {
        return {
          success: true,
          metadata,
          r2Url: existsResult.r2Url,
          r2Key: existsResult.r2Key,
          skipped: true,
          reason: 'PDF already exists in R2 storage',
        };
      }

      const r2Key = existsResult.r2Key;

      // Store in R2 with metadata
      await this.bucket.put(r2Key, pdfBuffer, {
        httpMetadata: {
          contentType: 'application/pdf',
        },
        customMetadata: {
          title: metadata.title,
          subject: metadata.subject,
          syllabus: metadata.syllabus,
          level: metadata.level,
          year: metadata.year.toString(),
          session: metadata.session,
          paperNumber: metadata.paperNumber,
          paperType: metadata.type,
          originalUrl: metadata.originalUrl,
          filename: metadata.filename,
        },
      });

      const r2Url = this.generateR2Url(r2Key);

      console.log(`✅ Stored PDF in R2: ${r2Key}`);

      return {
        success: true,
        metadata,
        r2Url,
        r2Key,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to store PDF for ${metadata.filename}:`, errorMessage);
      
      return {
        success: false,
        metadata,
        error: errorMessage,
      };
    }
  }

  /**
   * Get R2 storage statistics
   */
  async getStorageStats(): Promise<{
    totalObjects: number;
    totalSize: number;
  }> {
    try {
      // List objects with pagination to get count and size
      let totalObjects = 0;
      let totalSize = 0;
      let cursor: string | undefined;

      do {
        const listResult = await this.bucket.list({
          prefix: 'past-papers/',
          cursor,
          limit: 1000,
        });

        totalObjects += listResult.objects.length;
        totalSize += listResult.objects.reduce((sum: number, obj: any) => sum + obj.size, 0);
        
        cursor = listResult.truncated ? listResult.cursor : undefined;
      } while (cursor);

      return { totalObjects, totalSize };
    } catch (error) {
      console.error('Failed to get R2 storage stats:', error);
      return { totalObjects: 0, totalSize: 0 };
    }
  }
}