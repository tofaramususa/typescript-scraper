import { db } from './postgres_db';
import { pastPapersTable } from './schema/pastPapers';
import { eq, and, sql } from 'drizzle-orm';
export class DatabaseService {
    convertUrlMetadataToScraperMetadata(urlMetadata) {
        return {
            title: `${urlMetadata.subject} ${urlMetadata.year} ${urlMetadata.session} Paper ${urlMetadata.paperNumber}`,
            year: parseInt(urlMetadata.year),
            session: urlMetadata.session,
            paperNumber: urlMetadata.paperNumber,
            type: urlMetadata.paperType,
            subject: urlMetadata.subject,
            level: urlMetadata.level,
            syllabus: urlMetadata.subjectCode,
            originalUrl: urlMetadata.originalUrl,
            downloadUrl: urlMetadata.originalUrl,
            filename: `${urlMetadata.subjectCode}_${urlMetadata.paperType}_${urlMetadata.paperNumber}.pdf`,
        };
    }
    async insertPaper(metadata, r2Url, embedding, embeddingModel) {
        try {
            const existingPaper = await this.findPaper(metadata);
            if (existingPaper) {
                return {
                    success: true,
                    metadata,
                    paperId: existingPaper.id,
                    skipped: true,
                    reason: 'Paper already exists in database',
                };
            }
            const baseInsertData = {
                examBoard: 'CAIE',
                subject: metadata.subject,
                subjectCode: metadata.syllabus,
                level: metadata.level,
                year: metadata.year.toString(),
                session: metadata.session,
                paperNumber: metadata.paperNumber,
                paperType: metadata.type,
                r2Url: r2Url,
                embeddingModel: embeddingModel,
            };
            if (embedding) {
                if (!Array.isArray(embedding) || embedding.length !== 1536) {
                    throw new Error(`Invalid embedding: expected array of 1536 numbers, got ${embedding?.length || 'undefined'}`);
                }
                if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
                    throw new Error('Invalid embedding: all values must be valid numbers');
                }
                const [insertedPaper] = await db.insert(pastPapersTable).values({
                    ...baseInsertData,
                    embedding: embedding
                }).returning({ id: pastPapersTable.id });
                console.log(`Inserted paper: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.type}) - ID: ${insertedPaper.id}`);
                return {
                    success: true,
                    metadata,
                    paperId: insertedPaper.id,
                };
            }
            else {
                const [insertedPaper] = await db.insert(pastPapersTable).values(baseInsertData).returning({ id: pastPapersTable.id });
                console.log(`Inserted paper: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.type}) - ID: ${insertedPaper.id}`);
                return {
                    success: true,
                    metadata,
                    paperId: insertedPaper.id,
                };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to insert paper ${metadata.subject} ${metadata.year}:`, errorMessage);
            return {
                success: false,
                metadata,
                error: errorMessage,
            };
        }
    }
    async updatePaperEmbedding(paperId, embedding, embeddingModel) {
        try {
            if (!Array.isArray(embedding) || embedding.length !== 1536) {
                throw new Error(`Invalid embedding: expected array of 1536 numbers, got ${embedding?.length || 'undefined'}`);
            }
            if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
                throw new Error('Invalid embedding: all values must be valid numbers');
            }
            await db.update(pastPapersTable)
                .set({
                embedding: embedding,
                embeddingModel: embeddingModel,
                lastUpdated: new Date(),
            })
                .where(eq(pastPapersTable.id, paperId));
            console.log(`Updated embedding for paper ID: ${paperId}`);
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to update embedding for paper ID ${paperId}:`, errorMessage);
            return { success: false, error: errorMessage };
        }
    }
    async findPaper(metadata) {
        try {
            const [paper] = await db.select()
                .from(pastPapersTable)
                .where(and(eq(pastPapersTable.examBoard, 'CAIE'), eq(pastPapersTable.subjectCode, metadata.syllabus), eq(pastPapersTable.level, metadata.level), eq(pastPapersTable.year, metadata.year.toString()), eq(pastPapersTable.session, metadata.session), eq(pastPapersTable.paperNumber, metadata.paperNumber), eq(pastPapersTable.paperType, metadata.type)))
                .limit(1);
            return paper || null;
        }
        catch (error) {
            console.error('Failed to find paper:', error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }
    async batchInsertPapers(storageResults, embeddingResults) {
        const results = [];
        const embeddingMap = new Map();
        if (embeddingResults) {
            for (const embeddingResult of embeddingResults) {
                const key = this.createMetadataKey(this.convertUrlMetadataToScraperMetadata(embeddingResult.metadata));
                embeddingMap.set(key, embeddingResult);
            }
        }
        console.log(`Starting batch database insertion for ${storageResults.length} papers`);
        for (const storageResult of storageResults) {
            if (!storageResult.success || storageResult.skipped || !storageResult.r2Url) {
                results.push({
                    success: false,
                    metadata: storageResult.metadata,
                    error: storageResult.error || 'Storage operation failed or was skipped',
                });
                continue;
            }
            const metadataKey = this.createMetadataKey(storageResult.metadata);
            const embeddingResult = embeddingMap.get(metadataKey);
            const dbResult = await this.insertPaper(storageResult.metadata, storageResult.r2Url, embeddingResult?.embedding, embeddingResult?.embeddingModel);
            results.push(dbResult);
        }
        const successful = results.filter(r => r.success && !r.skipped).length;
        const skipped = results.filter(r => r.skipped).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`Batch database insertion completed: ${successful} successful, ${skipped} skipped, ${failed} failed`);
        return results;
    }
    async batchUpdateEmbeddings(embeddingResults) {
        const results = [];
        console.log(`Starting batch embedding updates for ${embeddingResults.length} papers`);
        for (const embeddingResult of embeddingResults) {
            if (!embeddingResult.success || !embeddingResult.embedding) {
                results.push({
                    success: false,
                    error: embeddingResult.error || 'Embedding generation failed',
                });
                continue;
            }
            const existingPaper = await this.findPaper(this.convertUrlMetadataToScraperMetadata(embeddingResult.metadata));
            if (!existingPaper) {
                results.push({
                    success: false,
                    error: 'Paper not found in database',
                });
                continue;
            }
            const updateResult = await this.updatePaperEmbedding(existingPaper.id, embeddingResult.embedding, embeddingResult.embeddingModel || 'text-embedding-3-small');
            results.push({
                success: updateResult.success,
                paperId: existingPaper.id,
                error: updateResult.error,
            });
        }
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`Batch embedding updates completed: ${successful} successful, ${failed} failed`);
        return results;
    }
    async getPapers(criteria = {}) {
        try {
            const query = db.select().from(pastPapersTable);
            const conditions = [];
            if (criteria.examBoard)
                conditions.push(eq(pastPapersTable.examBoard, criteria.examBoard));
            if (criteria.subject)
                conditions.push(eq(pastPapersTable.subject, criteria.subject));
            if (criteria.subjectCode)
                conditions.push(eq(pastPapersTable.subjectCode, criteria.subjectCode));
            if (criteria.level)
                conditions.push(eq(pastPapersTable.level, criteria.level));
            if (criteria.year)
                conditions.push(eq(pastPapersTable.year, criteria.year));
            if (criteria.session)
                conditions.push(eq(pastPapersTable.session, criteria.session));
            if (criteria.paperType)
                conditions.push(eq(pastPapersTable.paperType, criteria.paperType));
            if (conditions.length > 0) {
                query.where(and(...conditions));
            }
            if (criteria.limit) {
                query.limit(criteria.limit);
            }
            return await query;
        }
        catch (error) {
            console.error('Failed to get papers:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }
    async getStats() {
        try {
            const [totalResult, embeddingsResult, subjectsResult, yearsResult, qpResult, msResult] = await Promise.all([
                db.select({ count: sql `count(*)` }).from(pastPapersTable),
                db.select({ count: sql `count(*)` }).from(pastPapersTable).where(sql `embedding IS NOT NULL`),
                db.select({ count: sql `count(distinct subject)` }).from(pastPapersTable),
                db.select({ count: sql `count(distinct year)` }).from(pastPapersTable),
                db.select({ count: sql `count(*)` }).from(pastPapersTable).where(eq(pastPapersTable.paperType, 'qp')),
                db.select({ count: sql `count(*)` }).from(pastPapersTable).where(eq(pastPapersTable.paperType, 'ms')),
            ]);
            return {
                totalPapers: totalResult[0]?.count || 0,
                papersWithEmbeddings: embeddingsResult[0]?.count || 0,
                uniqueSubjects: subjectsResult[0]?.count || 0,
                uniqueYears: yearsResult[0]?.count || 0,
                papersByType: {
                    qp: qpResult[0]?.count || 0,
                    ms: msResult[0]?.count || 0,
                },
            };
        }
        catch (error) {
            console.error('Failed to get database stats:', error instanceof Error ? error.message : 'Unknown error');
            return {
                totalPapers: 0,
                papersWithEmbeddings: 0,
                uniqueSubjects: 0,
                uniqueYears: 0,
                papersByType: { qp: 0, ms: 0 },
            };
        }
    }
    async findSimilarPapers(queryEmbedding, limit = 10, threshold = 0.7) {
        try {
            if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1536) {
                throw new Error(`Invalid query embedding: expected array of 1536 numbers, got ${queryEmbedding?.length || 'undefined'}`);
            }
            const results = await db
                .select({
                id: pastPapersTable.id,
                examBoard: pastPapersTable.examBoard,
                subject: pastPapersTable.subject,
                subjectCode: pastPapersTable.subjectCode,
                level: pastPapersTable.level,
                year: pastPapersTable.year,
                session: pastPapersTable.session,
                paperNumber: pastPapersTable.paperNumber,
                paperType: pastPapersTable.paperType,
                r2Url: pastPapersTable.r2Url,
                embedding: pastPapersTable.embedding,
                embeddingModel: pastPapersTable.embeddingModel,
                createdAt: pastPapersTable.createdAt,
                lastUpdated: pastPapersTable.lastUpdated,
                similarity: sql `1 - (embedding <=> ${queryEmbedding})`
            })
                .from(pastPapersTable)
                .where(and(sql `embedding IS NOT NULL`, sql `1 - (embedding <=> ${queryEmbedding}) >= ${threshold}`))
                .orderBy(sql `embedding <=> ${queryEmbedding}`)
                .limit(limit);
            return results;
        }
        catch (error) {
            console.error('Failed to find similar papers:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }
    async deletePaper(paperId) {
        try {
            await db.delete(pastPapersTable)
                .where(eq(pastPapersTable.id, paperId));
            console.log(`Deleted paper ID: ${paperId}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to delete paper ID ${paperId}:`, error instanceof Error ? error.message : 'Unknown error');
            return false;
        }
    }
    createMetadataKey(metadata) {
        return `CAIE-${metadata.level}-${metadata.syllabus}-${metadata.year}-${metadata.session}-${metadata.paperNumber}-${metadata.type}`;
    }
}
//# sourceMappingURL=database-service.js.map