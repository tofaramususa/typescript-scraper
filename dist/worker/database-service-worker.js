import { neon } from '@neondatabase/serverless';
export class WorkersDatabaseService {
    sql;
    constructor(databaseUrl) {
        this.sql = neon(databaseUrl);
    }
    async paperExists(metadata) {
        try {
            const result = await this.sql `
        SELECT id FROM past_papers 
        WHERE exam_board = 'CAIE'
          AND subject_code = ${metadata.syllabus}
          AND level = ${metadata.level}
          AND year = ${metadata.year.toString()}
          AND session = ${metadata.session}
          AND paper_number = ${metadata.paperNumber}
          AND paper_type = ${metadata.type}
        LIMIT 1
      `;
            if (result.length > 0) {
                return { exists: true, paperId: result[0].id };
            }
            return { exists: false };
        }
        catch (error) {
            console.error('Failed to check if paper exists:', error);
            return { exists: false };
        }
    }
    async insertPaper(metadata, r2Url, embedding, embeddingModel) {
        try {
            const existsResult = await this.paperExists(metadata);
            if (existsResult.exists) {
                return {
                    success: true,
                    metadata,
                    paperId: existsResult.paperId,
                    skipped: true,
                    reason: 'Paper already exists in database',
                };
            }
            const result = await this.sql `
        INSERT INTO past_papers (
          exam_board, subject, subject_code, level, year, session, 
          paper_number, paper_type, r2_url, embedding_model
        )
        VALUES (
          'CAIE', ${metadata.subject}, ${metadata.syllabus}, ${metadata.level},
          ${metadata.year.toString()}, ${metadata.session}, ${metadata.paperNumber},
          ${metadata.type}, ${r2Url}, ${embeddingModel || null}
        )
        RETURNING id
      `;
            const paperId = result[0]?.id;
            if (embedding && embedding.length === 1536) {
                await this.updatePaperEmbedding(paperId, embedding);
            }
            console.log(`✅ Inserted paper: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.type}) - ID: ${paperId}`);
            return {
                success: true,
                metadata,
                paperId,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Failed to insert paper ${metadata.subject} ${metadata.year}:`, errorMessage);
            return {
                success: false,
                metadata,
                error: errorMessage,
            };
        }
    }
    async updatePaperEmbedding(paperId, embedding) {
        try {
            const vectorString = `[${embedding.join(',')}]`;
            await this.sql `
        UPDATE past_papers 
        SET embedding = ${vectorString}::vector,
            last_updated = NOW()
        WHERE id = ${paperId}
      `;
            console.log(`✅ Updated embedding for paper ID: ${paperId}`);
        }
        catch (error) {
            console.error(`❌ Failed to update embedding for paper ID ${paperId}:`, error);
        }
    }
    async getStats() {
        try {
            const totalResult = (await this.sql `SELECT COUNT(*) as total FROM past_papers`)[0];
            const embeddingsResult = (await this.sql `SELECT COUNT(*) as total FROM past_papers WHERE embedding IS NOT NULL`)[0];
            const subjectsResult = (await this.sql `SELECT COUNT(DISTINCT subject) as total FROM past_papers`)[0];
            return {
                totalPapers: parseInt(totalResult.total) || 0,
                papersWithEmbeddings: parseInt(embeddingsResult.total) || 0,
                uniqueSubjects: parseInt(subjectsResult.total) || 0,
            };
        }
        catch (error) {
            console.error('Failed to get database stats:', error);
            return {
                totalPapers: 0,
                papersWithEmbeddings: 0,
                uniqueSubjects: 0,
            };
        }
    }
}
//# sourceMappingURL=database-service-worker.js.map