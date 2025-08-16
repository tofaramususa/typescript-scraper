export class WorkersR2Service {
    bucket;
    publicUrl;
    constructor(bucket, publicUrl) {
        this.bucket = bucket;
        this.publicUrl = publicUrl;
    }
    generateR2Key(metadata) {
        return `past-papers/caie/${metadata.level.toLowerCase()}/${metadata.syllabus}/${metadata.year}/${metadata.session}/${metadata.paperNumber}_${metadata.type}.pdf`;
    }
    generateR2Url(r2Key) {
        return r2Key;
    }
    async generatePresignedUrl(r2Key, expiresInSeconds = 3600) {
        try {
            const presignedUrl = await this.bucket.sign(r2Key, {
                method: 'GET',
                expiresIn: expiresInSeconds,
            });
            return presignedUrl;
        }
        catch (error) {
            console.error(`Failed to generate presigned URL for ${r2Key}:`, error);
            throw new Error('Failed to generate download URL');
        }
    }
    async paperExistsInR2(metadata) {
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
        }
        catch (error) {
            return { exists: false, r2Key };
        }
    }
    async storePDF(metadata, pdfBuffer) {
        try {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Failed to store PDF for ${metadata.filename}:`, errorMessage);
            return {
                success: false,
                metadata,
                error: errorMessage,
            };
        }
    }
    async getStorageStats() {
        try {
            let totalObjects = 0;
            let totalSize = 0;
            let cursor;
            do {
                const listResult = await this.bucket.list({
                    prefix: 'past-papers/',
                    cursor,
                    limit: 1000,
                });
                totalObjects += listResult.objects.length;
                totalSize += listResult.objects.reduce((sum, obj) => sum + obj.size, 0);
                cursor = listResult.truncated ? listResult.cursor : undefined;
            } while (cursor);
            return { totalObjects, totalSize };
        }
        catch (error) {
            console.error('Failed to get R2 storage stats:', error);
            return { totalObjects: 0, totalSize: 0 };
        }
    }
}
//# sourceMappingURL=r2-service-worker.js.map