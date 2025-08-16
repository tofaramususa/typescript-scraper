import { db } from './postgres_db';
import { pastPapersTable, type InsertPastPaper, type SelectPastPaper } from './schema/pastPapers';
import { eq, and, sql } from 'drizzle-orm';
import type { PaperMetadata } from '../downloaders/papacambridge-scraper';
import type { StorageResult } from './pdf-storage-service';
import type { EmbeddingResult } from '../embeddings/generateEmbeddings';
import type { PaperMetadata as UrlPaperMetadata } from '../utils/url-parser';

/**
 * Result of database operation
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
 * Service for database operations related to past papers
 */
export class DatabaseService {
  /**
   * Converts URL-parser metadata to scraper metadata format
   */
  private convertUrlMetadataToScraperMetadata(urlMetadata: UrlPaperMetadata): PaperMetadata {
    return {
      title: `${urlMetadata.subject} ${urlMetadata.year} ${urlMetadata.session} Paper ${urlMetadata.paperNumber}`,
      year: parseInt(urlMetadata.year),
      session: urlMetadata.session,
      paperNumber: urlMetadata.paperNumber,
      type: urlMetadata.paperType as 'qp' | 'ms', // URL parser only supports qp/ms
      subject: urlMetadata.subject,
      level: urlMetadata.level,
      syllabus: urlMetadata.subjectCode,
      originalUrl: urlMetadata.originalUrl,
      downloadUrl: urlMetadata.originalUrl, // Same as original for now
      filename: `${urlMetadata.subjectCode}_${urlMetadata.paperType}_${urlMetadata.paperNumber}.pdf`,
    };
  }
  
  /**
   * Inserts a new paper record into the database
   * 
   * @param metadata - Paper metadata
   * @param r2Url - URL to the PDF in R2 storage
   * @param embedding - Optional embedding vector
   * @param embeddingModel - Model used for embedding generation
   * @returns Database operation result
   */
  async insertPaper(
    metadata: PaperMetadata,
    r2Url: string,
    embedding?: number[],
    embeddingModel?: string
  ): Promise<DatabaseResult> {
    try {
      // Check if paper already exists
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

      // Prepare insert data with proper mapping from PapaCambridge metadata
      const baseInsertData: Omit<InsertPastPaper, 'embedding'> = {
        examBoard: 'CAIE', // PapaCambridge is for Cambridge IGCSE/AS/A Level
        subject: metadata.subject,
        subjectCode: metadata.syllabus, // syllabus code (e.g. 0580)
        level: metadata.level, // IGCSE, AS, A Level
        year: metadata.year.toString(),
        session: metadata.session,
        paperNumber: metadata.paperNumber,
        paperType: metadata.type, // qp, ms, gt, er, ci
        r2Url: r2Url,
        embeddingModel: embeddingModel,
      };

      // Handle embedding insertion safely
      if (embedding) {
        // Validate embedding array
        if (!Array.isArray(embedding) || embedding.length !== 1536) {
          throw new Error(`Invalid embedding: expected array of 1536 numbers, got ${embedding?.length || 'undefined'}`);
        }
        
        // Ensure all values are numbers
        if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
          throw new Error('Invalid embedding: all values must be valid numbers');
        }
        
        // Insert with embedding using pgvector
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
      } else {
        // Insert without embedding
        const [insertedPaper] = await db.insert(pastPapersTable).values(baseInsertData).returning({ id: pastPapersTable.id });
        
        console.log(`Inserted paper: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.type}) - ID: ${insertedPaper.id}`);

        return {
          success: true,
          metadata,
          paperId: insertedPaper.id,
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to insert paper ${metadata.subject} ${metadata.year}:`, errorMessage);
      
      return {
        success: false,
        metadata,
        error: errorMessage,
      };
    }
  }

  /**
   * Updates an existing paper with embedding data
   * 
   * @param paperId - Database ID of the paper
   * @param embedding - Embedding vector
   * @param embeddingModel - Model used for embedding generation
   * @returns Database operation result
   */
  async updatePaperEmbedding(
    paperId: number,
    embedding: number[],
    embeddingModel: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate embedding array
      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        throw new Error(`Invalid embedding: expected array of 1536 numbers, got ${embedding?.length || 'undefined'}`);
      }
      
      // Ensure all values are numbers
      if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
        throw new Error('Invalid embedding: all values must be valid numbers');
      }

      // Update embedding using pgvector
      await db.update(pastPapersTable)
        .set({
          embedding: embedding,
          embeddingModel: embeddingModel,
          lastUpdated: new Date(),
        })
        .where(eq(pastPapersTable.id, paperId));

      console.log(`Updated embedding for paper ID: ${paperId}`);
      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to update embedding for paper ID ${paperId}:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Finds an existing paper by metadata
   * 
   * @param metadata - Paper metadata to search for
   * @returns Existing paper or null
   */
  async findPaper(metadata: PaperMetadata): Promise<SelectPastPaper | null> {
    try {
      const [paper] = await db.select()
        .from(pastPapersTable)
        .where(
          and(
            eq(pastPapersTable.examBoard, 'CAIE'),
            eq(pastPapersTable.subjectCode, metadata.syllabus),
            eq(pastPapersTable.level, metadata.level),
            eq(pastPapersTable.year, metadata.year.toString()),
            eq(pastPapersTable.session, metadata.session),
            eq(pastPapersTable.paperNumber, metadata.paperNumber),
            eq(pastPapersTable.paperType, metadata.type)
          )
        )
        .limit(1);

      return paper || null;

    } catch (error) {
      console.error('Failed to find paper:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Batch insert papers from storage results
   * 
   * @param storageResults - Results from PDF storage operations
   * @param embeddingResults - Optional embedding results
   * @returns Array of database operation results
   */
  async batchInsertPapers(
    storageResults: StorageResult[],
    embeddingResults?: EmbeddingResult[]
  ): Promise<DatabaseResult[]> {
    const results: DatabaseResult[] = [];
    
    // Create a map of embedding results by metadata for quick lookup
    const embeddingMap = new Map<string, EmbeddingResult>();
    if (embeddingResults) {
      for (const embeddingResult of embeddingResults) {
        const key = this.createMetadataKey(this.convertUrlMetadataToScraperMetadata(embeddingResult.metadata));
        embeddingMap.set(key, embeddingResult);
      }
    }

    console.log(`Starting batch database insertion for ${storageResults.length} papers`);

    for (const storageResult of storageResults) {
      if (!storageResult.success || storageResult.skipped || !storageResult.r2Url) {
        // Skip failed storage operations
        results.push({
          success: false,
          metadata: storageResult.metadata,
          error: storageResult.error || 'Storage operation failed or was skipped',
        });
        continue;
      }

      // Look for corresponding embedding
      const metadataKey = this.createMetadataKey(storageResult.metadata);
      const embeddingResult = embeddingMap.get(metadataKey);

      const dbResult = await this.insertPaper(
        storageResult.metadata,
        storageResult.r2Url,
        embeddingResult?.embedding,
        embeddingResult?.embeddingModel
      );

      results.push(dbResult);
    }

    // Log summary
    const successful = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Batch database insertion completed: ${successful} successful, ${skipped} skipped, ${failed} failed`);

    return results;
  }

  /**
   * Updates papers with embedding data in batch
   * 
   * @param embeddingResults - Results from embedding generation
   * @returns Array of update results
   */
  async batchUpdateEmbeddings(embeddingResults: EmbeddingResult[]): Promise<Array<{ success: boolean; paperId?: number; error?: string }>> {
    const results: Array<{ success: boolean; paperId?: number; error?: string }> = [];
    
    console.log(`Starting batch embedding updates for ${embeddingResults.length} papers`);

    for (const embeddingResult of embeddingResults) {
      if (!embeddingResult.success || !embeddingResult.embedding) {
        results.push({
          success: false,
          error: embeddingResult.error || 'Embedding generation failed',
        });
        continue;
      }

      // Find the paper in database
      const existingPaper = await this.findPaper(this.convertUrlMetadataToScraperMetadata(embeddingResult.metadata));
      
      if (!existingPaper) {
        results.push({
          success: false,
          error: 'Paper not found in database',
        });
        continue;
      }

      // Update embedding
      const updateResult = await this.updatePaperEmbedding(
        existingPaper.id,
        embeddingResult.embedding,
        embeddingResult.embeddingModel || 'text-embedding-3-small'
      );

      results.push({
        success: updateResult.success,
        paperId: existingPaper.id,
        error: updateResult.error,
      });
    }

    // Log summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Batch embedding updates completed: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Gets papers by criteria
   * 
   * @param criteria - Search criteria
   * @returns Array of papers matching criteria
   */
  async getPapers(criteria: {
    examBoard?: string;
    subject?: string;
    subjectCode?: string;
    level?: string;
    year?: string;
    session?: string;
    paperType?: 'qp' | 'ms';
    limit?: number;
  } = {}): Promise<SelectPastPaper[]> {
    try {
      const query = db.select().from(pastPapersTable);
      
      const conditions = [];
      if (criteria.examBoard) conditions.push(eq(pastPapersTable.examBoard, criteria.examBoard));
      if (criteria.subject) conditions.push(eq(pastPapersTable.subject, criteria.subject));
      if (criteria.subjectCode) conditions.push(eq(pastPapersTable.subjectCode, criteria.subjectCode));
      if (criteria.level) conditions.push(eq(pastPapersTable.level, criteria.level));
      if (criteria.year) conditions.push(eq(pastPapersTable.year, criteria.year));
      if (criteria.session) conditions.push(eq(pastPapersTable.session, criteria.session));
      if (criteria.paperType) conditions.push(eq(pastPapersTable.paperType, criteria.paperType));

      if (conditions.length > 0) {
        query.where(and(...conditions));
      }

      if (criteria.limit) {
        query.limit(criteria.limit);
      }

      return await query;

    } catch (error) {
      console.error('Failed to get papers:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Gets database statistics
   * 
   * @returns Database statistics
   */
  async getStats(): Promise<{
    totalPapers: number;
    papersWithEmbeddings: number;
    uniqueSubjects: number;
    uniqueYears: number;
    papersByType: { qp: number; ms: number };
  }> {
    try {
      const [
        totalResult,
        embeddingsResult,
        subjectsResult,
        yearsResult,
        qpResult,
        msResult
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(pastPapersTable),
        db.select({ count: sql<number>`count(*)` }).from(pastPapersTable).where(sql`embedding IS NOT NULL`),
        db.select({ count: sql<number>`count(distinct subject)` }).from(pastPapersTable),
        db.select({ count: sql<number>`count(distinct year)` }).from(pastPapersTable),
        db.select({ count: sql<number>`count(*)` }).from(pastPapersTable).where(eq(pastPapersTable.paperType, 'qp')),
        db.select({ count: sql<number>`count(*)` }).from(pastPapersTable).where(eq(pastPapersTable.paperType, 'ms')),
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

    } catch (error) {
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

  /**
   * Search for similar papers using cosine similarity
   * 
   * @param queryEmbedding - The embedding vector to search with
   * @param limit - Number of results to return (default: 10)
   * @param threshold - Similarity threshold (default: 0.7)
   * @returns Array of similar papers with similarity scores
   */
  async findSimilarPapers(
    queryEmbedding: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<Array<SelectPastPaper & { similarity: number }>> {
    try {
      // Validate embedding
      if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1536) {
        throw new Error(`Invalid query embedding: expected array of 1536 numbers, got ${queryEmbedding?.length || 'undefined'}`);
      }

      // Use pgvector cosine distance operator (<=>)
      // Note: cosine distance is 1 - cosine similarity, so we convert it back
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
          similarity: sql<number>`1 - (embedding <=> ${queryEmbedding})`
        })
        .from(pastPapersTable)
        .where(and(
          sql`embedding IS NOT NULL`,
          sql`1 - (embedding <=> ${queryEmbedding}) >= ${threshold}`
        ))
        .orderBy(sql`embedding <=> ${queryEmbedding}`)
        .limit(limit);

      return results;

    } catch (error) {
      console.error('Failed to find similar papers:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Delete a paper by ID (for testing purposes)
   * 
   * @param paperId - Database ID of the paper to delete
   * @returns Success boolean
   */
  async deletePaper(paperId: number): Promise<boolean> {
    try {
      await db.delete(pastPapersTable)
        .where(eq(pastPapersTable.id, paperId));
      
      console.log(`Deleted paper ID: ${paperId}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete paper ID ${paperId}:`, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Creates a unique key for paper metadata (for mapping purposes)
   */
  private createMetadataKey(metadata: PaperMetadata): string {
    return `CAIE-${metadata.level}-${metadata.syllabus}-${metadata.year}-${metadata.session}-${metadata.paperNumber}-${metadata.type}`;
  }
}