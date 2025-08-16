/**
 * Cloudflare Workers-compatible embedding service
 * Uses OpenAI API for generating embeddings
 */

import type { PaperMetadata } from './scraper-worker';

/**
 * Embedding result interface
 */
export interface EmbeddingResult {
  success: boolean;
  metadata: PaperMetadata;
  embedding?: number[];
  embeddingModel?: string;
  error?: string;
}

/**
 * Workers-compatible embedding service
 */
export class WorkersEmbeddingService {
  private apiKey: string;
  private model: string = 'text-embedding-3-small';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Generate embedding for paper metadata
   */
  async generateEmbedding(metadata: PaperMetadata): Promise<EmbeddingResult> {
    try {
      // Create text representation of the paper for embedding
      const paperText = this.createPaperText(metadata);

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: paperText,
          model: this.model,
          encoding_format: 'float',
        }),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const embedding = data.data[0]?.embedding;

      if (!embedding || !Array.isArray(embedding) || embedding.length !== 1536) {
        throw new Error('Invalid embedding response from OpenAI');
      }

      console.log(`✅ Generated embedding for: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.type})`);

      return {
        success: true,
        metadata,
        embedding,
        embeddingModel: this.model,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to generate embedding for ${metadata.subject} ${metadata.year}:`, errorMessage);
      
      return {
        success: false,
        metadata,
        error: errorMessage,
      };
    }
  }

  /**
   * Generate embeddings for multiple papers in batch
   */
  async generateEmbeddings(metadataList: PaperMetadata[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    
    console.log(`🤖 Starting embedding generation for ${metadataList.length} papers`);

    // Process embeddings in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < metadataList.length; i += batchSize) {
      const batch = metadataList.slice(i, i + batchSize);
      
      const batchPromises = batch.map(metadata => this.generateEmbedding(metadata));
      const batchResults = await Promise.all(batchPromises);
      
      results.push(...batchResults);

      // Rate limiting - wait between batches
      if (i + batchSize < metadataList.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Log summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`🤖 Embedding generation completed: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Create text representation of paper metadata for embedding
   */
  private createPaperText(metadata: PaperMetadata): string {
    const parts = [
      metadata.title,
      `${metadata.level} ${metadata.subject}`,
      `Syllabus ${metadata.syllabus}`,
      `${metadata.year} ${metadata.session}`,
      `Paper ${metadata.paperNumber}`,
      metadata.type === 'qp' ? 'Question Paper' : 
      metadata.type === 'ms' ? 'Mark Scheme' :
      metadata.type === 'gt' ? 'Grade Threshold' :
      metadata.type === 'er' ? 'Examiner Report' :
      metadata.type === 'ci' ? 'Confidential Instructions' : 
      metadata.type,
    ];

    return parts.filter(Boolean).join(' - ');
  }
}