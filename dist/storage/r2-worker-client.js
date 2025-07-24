import { generateStorageKey } from '../utils/url-parser';
export class WorkerR2StorageManager {
    bucket;
    customDomain;
    constructor(bucket, customDomain) {
        this.bucket = bucket;
        this.customDomain = customDomain;
    }
    async storePastPaper(examBoard, subject, subjectCode, level, year, session, paperNumber, pdfBuffer, paperType, originalUrl) {
        const metadata = {
            examBoard,
            level,
            subject,
            subjectCode,
            year,
            session,
            paperNumber,
            paperType,
            originalUrl,
        };
        const key = generateStorageKey(metadata);
        await this.bucket.put(key, pdfBuffer, {
            httpMetadata: {
                contentType: 'application/pdf',
                cacheControl: 'public, max-age=31536000',
            },
            customMetadata: {
                examBoard,
                level,
                subject,
                subjectCode,
                year,
                session,
                paperNumber,
                paperType,
                originalUrl,
                uploadedAt: new Date().toISOString(),
            },
        });
        console.log(`✅ Stored PDF: ${key}`);
        return key;
    }
    async hasPastPaper(examBoard, level, subjectCode, year, session, paperNumber, paperType) {
        const metadata = {
            examBoard,
            level,
            subject: '',
            subjectCode,
            year,
            session,
            paperNumber,
            paperType,
            originalUrl: '',
        };
        const key = generateStorageKey(metadata);
        try {
            const object = await this.bucket.head(key);
            return object !== null;
        }
        catch {
            return false;
        }
    }
    generatePublicUrl(key) {
        if (this.customDomain) {
            return `${this.customDomain}/${key}`;
        }
        return `https://your-worker-domain.workers.dev/pdf/${encodeURIComponent(key)}`;
    }
    async downloadPdf(key) {
        try {
            const object = await this.bucket.get(key);
            if (!object) {
                return null;
            }
            const arrayBuffer = await object.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }
        catch (error) {
            console.error(`Failed to download PDF ${key}:`, error);
            return null;
        }
    }
    async listPapers(options = {}) {
        const { examBoard, level, subjectCode, year, limit = 1000 } = options;
        let prefix = 'past-papers/';
        if (examBoard)
            prefix += `${examBoard.toLowerCase()}/`;
        if (level)
            prefix += `${level.toLowerCase()}/`;
        if (subjectCode)
            prefix += `${subjectCode}/`;
        if (year)
            prefix += `${year}/`;
        const objects = await this.bucket.list({
            prefix,
            limit,
        });
        return objects.objects.map((object) => ({
            key: object.key,
            metadata: object.customMetadata || {},
            size: object.size,
            uploaded: object.uploaded,
        }));
    }
    async deletePdf(key) {
        try {
            await this.bucket.delete(key);
            console.log(`🗑️  Deleted PDF: ${key}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to delete PDF ${key}:`, error);
            return false;
        }
    }
    async getStorageStats() {
        const objects = await this.bucket.list({ limit: 10000 });
        const stats = {
            totalObjects: objects.objects.length,
            totalSize: objects.objects.reduce((sum, obj) => sum + obj.size, 0),
            byExamBoard: {},
            byLevel: {},
            byYear: {},
        };
        objects.objects.forEach((object) => {
            const metadata = object.customMetadata || {};
            if (metadata.examBoard) {
                stats.byExamBoard[metadata.examBoard] = (stats.byExamBoard[metadata.examBoard] || 0) + 1;
            }
            if (metadata.level) {
                stats.byLevel[metadata.level] = (stats.byLevel[metadata.level] || 0) + 1;
            }
            if (metadata.year) {
                stats.byYear[metadata.year] = (stats.byYear[metadata.year] || 0) + 1;
            }
        });
        return stats;
    }
}
export function createWorkerR2Client(bucket, customDomain) {
    return new WorkerR2StorageManager(bucket, customDomain);
}
//# sourceMappingURL=r2-worker-client.js.map