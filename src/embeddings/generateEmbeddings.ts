import OpenAI from 'openai';
import type { PaperMetadata } from '../utils/url-parser';

/**
 * Configuration for embeddings generation
 */
interface EmbeddingsConfig {
  model: string;
  maxTokens: number;
  batchSize: number;
  maxRetries: number;
  rateLimitDelay: number;
  maxRequestsPerMinute: number;
}

/**
 * Result of embedding generation
 */
export interface EmbeddingResult {
  success: boolean;
  metadata: PaperMetadata;
  embedding?: number[];
  embeddingModel?: string;
  extractedText?: string;
  error?: string;
  tokenCount?: number;
}

/**
 * Service for generating embeddings from paper metadata for search
 */
export class EmbeddingsService {
  private openai: OpenAI;
  private config: EmbeddingsConfig;
  private requestTimes: number[] = []; // Track request timestamps for rate limiting

  constructor(apiKey: string, config: Partial<EmbeddingsConfig> = {}) {
    this.openai = new OpenAI({ apiKey });
    
    this.config = {
      model: 'text-embedding-3-small',
      maxTokens: 8000, // Leave some buffer for the 8191 token limit
      batchSize: 10, // Reduced for rate limiting
      maxRetries: 3,
      rateLimitDelay: 1000, // 1 second between requests
      maxRequestsPerMinute: 50, // Conservative rate limit
      ...config,
    };
  }

  /**
   * Generates embedding for paper metadata for search purposes
   * 
   * @param metadata - Paper metadata
   * @returns Embedding result
   */
  async generateEmbedding(metadata: PaperMetadata): Promise<EmbeddingResult> {
    try {
      // Create searchable text from metadata
      const searchableText = this.createSearchableText(metadata);
      
      if (!searchableText || searchableText.trim().length === 0) {
        throw new Error('No searchable text could be created from metadata');
      }

      // Generate embedding from metadata text
      const embedding = await this.generateEmbeddingWithRetry(searchableText);
      
      console.log(`Generated embedding for: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.paperType})`);
      
      return {
        success: true,
        metadata,
        embedding,
        embeddingModel: this.config.model,
        extractedText: searchableText,
        tokenCount: this.estimateTokenCount(searchableText),
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to generate embedding for ${metadata.subject} ${metadata.year}: ${errorMessage}`);
      
      return {
        success: false,
        metadata,
        error: errorMessage,
      };
    }
  }

  /**
   * Generates embeddings for multiple papers with batch processing
   * 
   * @param papers - Array of paper metadata
   * @param options - Processing options
   * @returns Array of embedding results
   */
  async batchGenerateEmbeddings(
    papers: Array<{ metadata: PaperMetadata }>,
    options: { onProgress?: (completed: number, total: number) => void } = {}
  ): Promise<EmbeddingResult[]> {
    const { onProgress } = options;
    const results: EmbeddingResult[] = [];
    
    console.log(`Starting batch embedding generation for ${papers.length} papers`);

    // Process in batches to respect rate limits
    for (let i = 0; i < papers.length; i += this.config.batchSize) {
      const batch = papers.slice(i, i + this.config.batchSize);
      
      console.log(`Processing batch ${Math.floor(i / this.config.batchSize) + 1}/${Math.ceil(papers.length / this.config.batchSize)}`);
      
      // Process batch sequentially to avoid rate limiting
      for (const { metadata } of batch) {
        const result = await this.generateEmbedding(metadata);
        results.push(result);
        
        if (onProgress) {
          onProgress(results.length, papers.length);
        }
        
        // Small delay between requests to respect rate limits
        await this.delay(100);
      }
      
      // Longer delay between batches
      if (i + this.config.batchSize < papers.length) {
        await this.delay(2000);
      }
    }

    // Log summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Batch embedding generation completed: ${successful} successful, ${failed} failed`);

    return results;
  }

  /**
   * Creates searchable text from paper metadata
   */
  private createSearchableText(metadata: PaperMetadata): string {
    // Create a comprehensive searchable string from metadata
    const parts = [
      `Subject: ${metadata.subject}`,
      `Exam Board: ${metadata.examBoard}`,
      `Level: ${metadata.level}`,
      `Subject Code: ${metadata.subjectCode}`,
      `Year: ${metadata.year}`,
      `Session: ${metadata.session}`,
      `Paper Number: ${metadata.paperNumber}`,
      `Paper Type: ${metadata.paperType === 'qp' ? 'Question Paper' : 'Mark Scheme'}`,
      
      // Add natural language descriptions for better search
      `${metadata.examBoard} ${metadata.level} ${metadata.subject}`,
      `${metadata.year} ${metadata.session} examination`,
      `Paper ${metadata.paperNumber} ${metadata.paperType === 'qp' ? 'questions' : 'marking scheme'}`,
      
      // Add alternative search terms
      metadata.subject.toLowerCase().includes('math') ? 'mathematics maths' : '',
      metadata.subject.toLowerCase().includes('phys') ? 'physics science' : '',
      metadata.subject.toLowerCase().includes('chem') ? 'chemistry science' : '',
      metadata.subject.toLowerCase().includes('bio') ? 'biology science' : '',
      
      // Session alternatives
      metadata.session.includes('May') ? 'summer' : '',
      metadata.session.includes('October') ? 'winter' : '',
      metadata.session.includes('February') ? 'winter' : '',
      
      // Level alternatives
      metadata.level.includes('IGCSE') ? 'GCSE O-Level' : '',
      metadata.level.includes('A-level') ? 'Advanced Level' : '',
    ].filter(Boolean).join(' ');
    
    return parts;
  }

  /**
   * Simple rate limiting - wait if we've hit the limit
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove timestamps older than 1 minute
    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
    
    // If we're at the limit, wait
    if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer
      if (waitTime > 0) {
        console.log(`⏳ Rate limit reached, waiting ${Math.round(waitTime / 1000)}s...`);
        await this.delay(waitTime);
      }
    }
    
    // Always add minimum delay between requests
    await this.delay(this.config.rateLimitDelay);
    
    // Record this request
    this.requestTimes.push(Date.now());
  }

  /**
   * Generates embedding with retry logic
   */
  private async generateEmbeddingWithRetry(text: string): Promise<number[]> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Wait for rate limit before making request
        await this.waitForRateLimit();
        
        const response = await this.openai.embeddings.create({
          model: this.config.model,
          input: text,
        });

        if (response.data && response.data.length > 0) {
          return response.data[0].embedding;
        }
        
        throw new Error('No embedding data returned from OpenAI');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Check if it's a rate limit error
        if (lastError.message.includes('rate limit') || lastError.message.includes('429')) {
          const backoffDelay = 5000 * Math.pow(2, attempt - 1); // Exponential backoff for rate limits
          console.log(`Rate limit hit, retrying in ${backoffDelay}ms... (attempt ${attempt}/${this.config.maxRetries})`);
          await this.delay(backoffDelay);
        } else if (attempt < this.config.maxRetries) {
          const backoffDelay = 1000 * attempt;
          console.log(`Embedding attempt ${attempt} failed, retrying in ${backoffDelay}ms...`);
          await this.delay(backoffDelay);
        }
      }
    }

    throw new Error(`Failed to generate embedding after ${this.config.maxRetries} attempts: ${lastError!.message}`);
  }

  /**
   * Truncates text to fit within token limits
   * Rough estimation: 1 token ≈ 4 characters for English text
   */
  private truncateText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4; // Rough estimation
    
    if (text.length <= maxChars) {
      return text;
    }
    
    // Truncate and try to end at a sentence boundary
    let truncated = text.slice(0, maxChars);
    const lastSentence = truncated.lastIndexOf('.');
    
    if (lastSentence > maxChars * 0.8) { // If we find a sentence end in the last 20%
      truncated = truncated.slice(0, lastSentence + 1);
    }
    
    return truncated;
  }

  /**
   * Estimates token count for text
   * Rough estimation: 1 token ≈ 4 characters for English text
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get embedding statistics
   */
  getStats(results: EmbeddingResult[]): {
    total: number;
    successful: number;
    failed: number;
    totalTokens: number;
    averageTokens: number;
    errors: string[];
  } {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalTokens = successful.reduce((sum, r) => sum + (r.tokenCount || 0), 0);
    const errors = failed.map(r => r.error || 'Unknown error');

    return {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      totalTokens,
      averageTokens: successful.length > 0 ? Math.round(totalTokens / successful.length) : 0,
      errors,
    };
  }

  /**
   * Validates embedding dimensions match expected size
   */
  static validateEmbedding(embedding: number[], expectedDimensions = 1536): boolean {
    return Array.isArray(embedding) && embedding.length === expectedDimensions;
  }
}