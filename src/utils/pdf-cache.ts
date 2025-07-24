import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Simple PDF cache to avoid re-downloading
 */
export class PdfCache {
  private cacheDir: string;
  private maxSizeMB: number;
  private maxAge: number; // milliseconds

  constructor(cacheDir: string = './.cache/pdfs', maxSizeMB: number = 500, maxAgeHours: number = 24) {
    this.cacheDir = cacheDir;
    this.maxSizeMB = maxSizeMB;
    this.maxAge = maxAgeHours * 60 * 60 * 1000;

    // Create cache directory
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Clean old files on startup
    this.cleanupOldFiles();
  }

  /**
   * Generate cache key from URL
   */
  private getCacheKey(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * Get cache file path
   */
  private getCacheFilePath(url: string): string {
    const key = this.getCacheKey(url);
    return path.join(this.cacheDir, `${key}.pdf`);
  }

  /**
   * Check if PDF is cached and fresh
   */
  has(url: string): boolean {
    const filePath = this.getCacheFilePath(url);
    
    if (!fs.existsSync(filePath)) {
      return false;
    }

    // Check age
    const stats = fs.statSync(filePath);
    const age = Date.now() - stats.mtime.getTime();
    
    if (age > this.maxAge) {
      // File is too old, remove it
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.warn(`Failed to remove old cache file: ${error}`);
      }
      return false;
    }

    return true;
  }

  /**
   * Get cached PDF buffer
   */
  get(url: string): Buffer | null {
    if (!this.has(url)) {
      return null;
    }

    try {
      const filePath = this.getCacheFilePath(url);
      return fs.readFileSync(filePath);
    } catch (error) {
      console.warn(`Failed to read cached PDF: ${error}`);
      return null;
    }
  }

  /**
   * Store PDF in cache
   */
  set(url: string, buffer: Buffer): void {
    try {
      // Check cache size limit
      if (this.getCurrentCacheSizeMB() + (buffer.length / 1024 / 1024) > this.maxSizeMB) {
        this.cleanup();
      }

      const filePath = this.getCacheFilePath(url);
      fs.writeFileSync(filePath, buffer);
      
      console.log(`💾 Cached PDF: ${Math.round(buffer.length / 1024)}KB`);
    } catch (error) {
      console.warn(`Failed to cache PDF: ${error}`);
    }
  }

  /**
   * Get current cache size in MB
   */
  private getCurrentCacheSizeMB(): number {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }
      
      return totalSize / 1024 / 1024;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Clean up old files
   */
  private cleanupOldFiles(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let cleaned = 0;
      
      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtime.getTime();
        
        if (age > this.maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        console.log(`🗑️  Cleaned ${cleaned} old cache files`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup cache: ${error}`);
    }
  }

  /**
   * Clean up cache when size limit exceeded
   */
  private cleanup(): void {
    try {
      const files = fs.readdirSync(this.cacheDir)
        .map(file => {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          return { file, filePath, mtime: stats.mtime.getTime(), size: stats.size };
        })
        .sort((a, b) => a.mtime - b.mtime); // Sort by age, oldest first

      let currentSize = files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024;
      let removed = 0;

      // Remove oldest files until under limit
      for (const fileInfo of files) {
        if (currentSize <= this.maxSizeMB * 0.8) break; // Leave 20% buffer
        
        fs.unlinkSync(fileInfo.filePath);
        currentSize -= fileInfo.size / 1024 / 1024;
        removed++;
      }

      if (removed > 0) {
        console.log(`🗑️  Removed ${removed} cache files to free space`);
      }
    } catch (error) {
      console.warn(`Failed to cleanup cache: ${error}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { files: number; sizeMB: number; maxSizeMB: number } {
    try {
      const files = fs.readdirSync(this.cacheDir);
      return {
        files: files.length,
        sizeMB: Math.round(this.getCurrentCacheSizeMB() * 100) / 100,
        maxSizeMB: this.maxSizeMB
      };
    } catch (error) {
      return { files: 0, sizeMB: 0, maxSizeMB: this.maxSizeMB };
    }
  }
}