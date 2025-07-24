import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export class R2StorageClient {
    client;
    bucketName;
    constructor(config) {
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
    async upload(key, data, options = {}) {
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
        }
        catch (error) {
            throw new Error(`Failed to upload ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async download(key) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            const response = await this.client.send(command);
            if (!response.Body) {
                throw new Error('No body in response');
            }
            const chunks = [];
            for await (const chunk of response.Body) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        }
        catch (error) {
            throw new Error(`Failed to download ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async exists(key) {
        try {
            await this.client.send(new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            }));
            return true;
        }
        catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw error;
        }
    }
    async delete(key) {
        try {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            }));
        }
        catch (error) {
            throw new Error(`Failed to delete ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    generatePublicUrl(key) {
        const domain = process.env.R2_CUSTOM_DOMAIN || `${this.bucketName}.r2.dev`;
        return `https://${domain}/${key}`;
    }
    async getPresignedUrl(key, options = {}) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            return await getSignedUrl(this.client, command, {
                expiresIn: options.expiresIn || 3600,
            });
        }
        catch (error) {
            throw new Error(`Failed to generate presigned URL for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async uploadPDF(key, pdfBuffer, metadata) {
        return this.upload(key, pdfBuffer, {
            contentType: 'application/pdf',
            cacheControl: 'public, max-age=31536000, immutable',
            metadata: {
                ...metadata,
                uploadedAt: new Date().toISOString(),
                source: 'sylabl-scraper'
            }
        });
    }
    async batchUpload(uploads, concurrency = 5) {
        const results = [];
        for (let i = 0; i < uploads.length; i += concurrency) {
            const batch = uploads.slice(i, i + concurrency);
            const batchPromises = batch.map(async ({ key, data, options }) => {
                try {
                    const result = await this.upload(key, data, options);
                    return { ...result, success: true };
                }
                catch (error) {
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
export function createR2Client(config) {
    const r2Config = {
        accountId: config?.accountId || process.env.R2_ACCOUNT_ID,
        accessKeyId: config?.accessKeyId || process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: config?.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY,
        bucketName: config?.bucketName || process.env.R2_BUCKET_NAME,
    };
    const missing = Object.entries(r2Config).filter(([_, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(`Missing required R2 configuration: ${missing.join(', ')}`);
    }
    return new R2StorageClient(r2Config);
}
export class ScraperStorageManager {
    r2;
    constructor(r2Client) {
        this.r2 = r2Client;
    }
    async storePastPaper(examBoard, subject, subjectCode, level, year, session, paperNumber, pdfBuffer, paperType = 'qp', originalUrl) {
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
    async hasPastPaper(examBoard, level, subjectCode, year, session, paperNumber, paperType = 'qp') {
        const key = `past-papers/${examBoard.toLowerCase()}/${level.toLowerCase()}/${subjectCode}/${year}/${session}/${paperNumber}_${paperType}.pdf`;
        return this.r2.exists(key);
    }
    async getPdfUrl(examBoard, level, subjectCode, year, session, paperNumber, paperType = 'qp', options = {}) {
        const key = `past-papers/${examBoard.toLowerCase()}/${level.toLowerCase()}/${subjectCode}/${year}/${session}/${paperNumber}_${paperType}.pdf`;
        return this.r2.getPresignedUrl(key, options);
    }
    generatePublicUrl(key) {
        return this.r2.generatePublicUrl(key);
    }
}
//# sourceMappingURL=r2_client_service.js.map