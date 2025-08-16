/**
 * Cloudflare Workers-compatible database service
 * Uses Neon's serverless driver for HTTP connections
 */

import { neon } from '@neondatabase/serverless';
import type { PaperMetadata } from './scraper-worker';

/**
 * Database result interface
 */
export interface DatabaseResult {
  success: boolean;
  metadata: PaperMetadata;
  paperId?: number;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Workers-compatible database service
 */
export class WorkersDatabaseService {
  private sql: ReturnType<typeof neon>;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  /**
   * Check if a paper already exists in the database
   */
  async paperExists(metadata: PaperMetadata): Promise<{ exists: boolean; paperId?: number }> {
    try {
      const result = await this.sql`
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

      if ((result as any[]).length > 0) {
        return { exists: true, paperId: (result as any[])[0].id as number };
      }

      return { exists: false };
    } catch (error) {
      console.error('Failed to check if paper exists:', error);
      return { exists: false };
    }
  }

  /**
   * Insert a new paper record into the database
   */
  async insertPaper(
    metadata: PaperMetadata,
    r2Url: string,
    embedding?: number[],
    embeddingModel?: string
  ): Promise<DatabaseResult> {
    try {
      // Check if paper already exists
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

      // Insert new paper
      const result = await this.sql`
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

      const paperId = (result as any[])[0]?.id as number;

      // Update with embedding if provided
      if (embedding && embedding.length === 1536) {
        await this.updatePaperEmbedding(paperId, embedding);
      }

      console.log(`✅ Inserted paper: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.type}) - ID: ${paperId}`);

      return {
        success: true,
        metadata,
        paperId,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to insert paper ${metadata.subject} ${metadata.year}:`, errorMessage);
      
      return {
        success: false,
        metadata,
        error: errorMessage,
      };
    }
  }

  /**
   * Update paper with embedding data
   */
  private async updatePaperEmbedding(paperId: number, embedding: number[]): Promise<void> {
    try {
      // Convert embedding array to PostgreSQL vector format
      const vectorString = `[${embedding.join(',')}]`;
      
      await this.sql`
        UPDATE past_papers 
        SET embedding = ${vectorString}::vector,
            last_updated = NOW()
        WHERE id = ${paperId}
      `;

      console.log(`✅ Updated embedding for paper ID: ${paperId}`);
    } catch (error) {
      console.error(`❌ Failed to update embedding for paper ID ${paperId}:`, error);
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalPapers: number;
    papersWithEmbeddings: number;
    uniqueSubjects: number;
  }> {
    try {
      const totalResult = (await this.sql`SELECT COUNT(*) as total FROM past_papers` as any[])[0];
      const embeddingsResult = (await this.sql`SELECT COUNT(*) as total FROM past_papers WHERE embedding IS NOT NULL` as any[])[0];
      const subjectsResult = (await this.sql`SELECT COUNT(DISTINCT subject) as total FROM past_papers` as any[])[0];

      return {
        totalPapers: parseInt(totalResult.total as string) || 0,
        papersWithEmbeddings: parseInt(embeddingsResult.total as string) || 0,
        uniqueSubjects: parseInt(subjectsResult.total as string) || 0,
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return {
        totalPapers: 0,
        papersWithEmbeddings: 0,
        uniqueSubjects: 0,
      };
    }
  }
}