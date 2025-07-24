import OpenAI from 'openai';
export class EmbeddingsService {
    openai;
    config;
    requestTimes = [];
    constructor(apiKey, config = {}) {
        this.openai = new OpenAI({ apiKey });
        this.config = {
            model: 'text-embedding-3-small',
            maxTokens: 8000,
            batchSize: 10,
            maxRetries: 3,
            rateLimitDelay: 1000,
            maxRequestsPerMinute: 50,
            ...config,
        };
    }
    async generateEmbedding(metadata) {
        try {
            const searchableText = this.createSearchableText(metadata);
            if (!searchableText || searchableText.trim().length === 0) {
                throw new Error('No searchable text could be created from metadata');
            }
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Failed to generate embedding for ${metadata.subject} ${metadata.year}: ${errorMessage}`);
            return {
                success: false,
                metadata,
                error: errorMessage,
            };
        }
    }
    async batchGenerateEmbeddings(papers, options = {}) {
        const { onProgress } = options;
        const results = [];
        console.log(`Starting batch embedding generation for ${papers.length} papers`);
        for (let i = 0; i < papers.length; i += this.config.batchSize) {
            const batch = papers.slice(i, i + this.config.batchSize);
            console.log(`Processing batch ${Math.floor(i / this.config.batchSize) + 1}/${Math.ceil(papers.length / this.config.batchSize)}`);
            for (const { metadata } of batch) {
                const result = await this.generateEmbedding(metadata);
                results.push(result);
                if (onProgress) {
                    onProgress(results.length, papers.length);
                }
                await this.delay(100);
            }
            if (i + this.config.batchSize < papers.length) {
                await this.delay(2000);
            }
        }
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`Batch embedding generation completed: ${successful} successful, ${failed} failed`);
        return results;
    }
    createSearchableText(metadata) {
        const parts = [
            `Subject: ${metadata.subject}`,
            `Exam Board: ${metadata.examBoard}`,
            `Level: ${metadata.level}`,
            `Subject Code: ${metadata.subjectCode}`,
            `Year: ${metadata.year}`,
            `Session: ${metadata.session}`,
            `Paper Number: ${metadata.paperNumber}`,
            `Paper Type: ${metadata.paperType === 'qp' ? 'Question Paper' : 'Mark Scheme'}`,
            `${metadata.examBoard} ${metadata.level} ${metadata.subject}`,
            `${metadata.year} ${metadata.session} examination`,
            `Paper ${metadata.paperNumber} ${metadata.paperType === 'qp' ? 'questions' : 'marking scheme'}`,
            metadata.subject.toLowerCase().includes('math') ? 'mathematics maths' : '',
            metadata.subject.toLowerCase().includes('phys') ? 'physics science' : '',
            metadata.subject.toLowerCase().includes('chem') ? 'chemistry science' : '',
            metadata.subject.toLowerCase().includes('bio') ? 'biology science' : '',
            metadata.session.includes('May') ? 'summer' : '',
            metadata.session.includes('October') ? 'winter' : '',
            metadata.session.includes('February') ? 'winter' : '',
            metadata.level.includes('IGCSE') ? 'GCSE O-Level' : '',
            metadata.level.includes('A-level') ? 'Advanced Level' : '',
        ].filter(Boolean).join(' ');
        return parts;
    }
    async waitForRateLimit() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
        if (this.requestTimes.length >= this.config.maxRequestsPerMinute) {
            const oldestRequest = this.requestTimes[0];
            const waitTime = 60000 - (now - oldestRequest) + 100;
            if (waitTime > 0) {
                console.log(`⏳ Rate limit reached, waiting ${Math.round(waitTime / 1000)}s...`);
                await this.delay(waitTime);
            }
        }
        await this.delay(this.config.rateLimitDelay);
        this.requestTimes.push(Date.now());
    }
    async generateEmbeddingWithRetry(text) {
        let lastError;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                await this.waitForRateLimit();
                const response = await this.openai.embeddings.create({
                    model: this.config.model,
                    input: text,
                });
                if (response.data && response.data.length > 0) {
                    return response.data[0].embedding;
                }
                throw new Error('No embedding data returned from OpenAI');
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (lastError.message.includes('rate limit') || lastError.message.includes('429')) {
                    const backoffDelay = 5000 * Math.pow(2, attempt - 1);
                    console.log(`Rate limit hit, retrying in ${backoffDelay}ms... (attempt ${attempt}/${this.config.maxRetries})`);
                    await this.delay(backoffDelay);
                }
                else if (attempt < this.config.maxRetries) {
                    const backoffDelay = 1000 * attempt;
                    console.log(`Embedding attempt ${attempt} failed, retrying in ${backoffDelay}ms...`);
                    await this.delay(backoffDelay);
                }
            }
        }
        throw new Error(`Failed to generate embedding after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }
    truncateText(text, maxTokens) {
        const maxChars = maxTokens * 4;
        if (text.length <= maxChars) {
            return text;
        }
        let truncated = text.slice(0, maxChars);
        const lastSentence = truncated.lastIndexOf('.');
        if (lastSentence > maxChars * 0.8) {
            truncated = truncated.slice(0, lastSentence + 1);
        }
        return truncated;
    }
    estimateTokenCount(text) {
        return Math.ceil(text.length / 4);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getStats(results) {
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
    static validateEmbedding(embedding, expectedDimensions = 1536) {
        return Array.isArray(embedding) && embedding.length === expectedDimensions;
    }
}
//# sourceMappingURL=generateEmbeddings.js.map