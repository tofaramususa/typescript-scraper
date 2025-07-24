import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
export class PdfCache {
    cacheDir;
    maxSizeMB;
    maxAge;
    constructor(cacheDir = './.cache/pdfs', maxSizeMB = 500, maxAgeHours = 24) {
        this.cacheDir = cacheDir;
        this.maxSizeMB = maxSizeMB;
        this.maxAge = maxAgeHours * 60 * 60 * 1000;
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        this.cleanupOldFiles();
    }
    getCacheKey(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    }
    getCacheFilePath(url) {
        const key = this.getCacheKey(url);
        return path.join(this.cacheDir, `${key}.pdf`);
    }
    has(url) {
        const filePath = this.getCacheFilePath(url);
        if (!fs.existsSync(filePath)) {
            return false;
        }
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtime.getTime();
        if (age > this.maxAge) {
            try {
                fs.unlinkSync(filePath);
            }
            catch (error) {
                console.warn(`Failed to remove old cache file: ${error}`);
            }
            return false;
        }
        return true;
    }
    get(url) {
        if (!this.has(url)) {
            return null;
        }
        try {
            const filePath = this.getCacheFilePath(url);
            return fs.readFileSync(filePath);
        }
        catch (error) {
            console.warn(`Failed to read cached PDF: ${error}`);
            return null;
        }
    }
    set(url, buffer) {
        try {
            if (this.getCurrentCacheSizeMB() + (buffer.length / 1024 / 1024) > this.maxSizeMB) {
                this.cleanup();
            }
            const filePath = this.getCacheFilePath(url);
            fs.writeFileSync(filePath, buffer);
            console.log(`💾 Cached PDF: ${Math.round(buffer.length / 1024)}KB`);
        }
        catch (error) {
            console.warn(`Failed to cache PDF: ${error}`);
        }
    }
    getCurrentCacheSizeMB() {
        try {
            const files = fs.readdirSync(this.cacheDir);
            let totalSize = 0;
            for (const file of files) {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                totalSize += stats.size;
            }
            return totalSize / 1024 / 1024;
        }
        catch (error) {
            return 0;
        }
    }
    cleanupOldFiles() {
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
        }
        catch (error) {
            console.warn(`Failed to cleanup cache: ${error}`);
        }
    }
    cleanup() {
        try {
            const files = fs.readdirSync(this.cacheDir)
                .map(file => {
                const filePath = path.join(this.cacheDir, file);
                const stats = fs.statSync(filePath);
                return { file, filePath, mtime: stats.mtime.getTime(), size: stats.size };
            })
                .sort((a, b) => a.mtime - b.mtime);
            let currentSize = files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024;
            let removed = 0;
            for (const fileInfo of files) {
                if (currentSize <= this.maxSizeMB * 0.8)
                    break;
                fs.unlinkSync(fileInfo.filePath);
                currentSize -= fileInfo.size / 1024 / 1024;
                removed++;
            }
            if (removed > 0) {
                console.log(`🗑️  Removed ${removed} cache files to free space`);
            }
        }
        catch (error) {
            console.warn(`Failed to cleanup cache: ${error}`);
        }
    }
    getStats() {
        try {
            const files = fs.readdirSync(this.cacheDir);
            return {
                files: files.length,
                sizeMB: Math.round(this.getCurrentCacheSizeMB() * 100) / 100,
                maxSizeMB: this.maxSizeMB
            };
        }
        catch (error) {
            return { files: 0, sizeMB: 0, maxSizeMB: this.maxSizeMB };
        }
    }
}
//# sourceMappingURL=pdf-cache.js.map