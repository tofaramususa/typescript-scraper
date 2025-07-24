import { PastPapersScraper } from './downloaders/pastpapers-co-scraper';
import { WorkerPdfStorageService } from './storage/pdf-storage-worker';
import { EmbeddingsService } from './embeddings/generateEmbeddings';
import { DatabaseService } from './storage/database-service';
import { createWorkerR2Client } from './storage/r2-worker-client';
import { isValidPastPapersUrl } from './utils/url-parser';
import { logger } from './utils/simple-logger';
class PastPapersWorker {
    env;
    constructor(env) {
        this.env = env;
    }
    async handleRequest(request) {
        const url = new URL(request.url);
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json',
        };
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 200, headers: corsHeaders });
        }
        try {
            switch (url.pathname) {
                case '/':
                    return this.handleHealthCheck(corsHeaders);
                case '/scrape':
                    if (request.method !== 'POST') {
                        return this.errorResponse('Method not allowed', 405, corsHeaders);
                    }
                    return await this.handleScrapeRequest(request, corsHeaders);
                case '/status':
                    return this.handleStatusCheck(corsHeaders);
                default:
                    return this.errorResponse('Not found', 404, corsHeaders);
            }
        }
        catch (error) {
            logger.error('Worker request failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                path: url.pathname,
                method: request.method
            });
            return this.errorResponse(error instanceof Error ? error.message : 'Internal server error', 500, corsHeaders);
        }
    }
    handleHealthCheck(headers) {
        return new Response(JSON.stringify({
            success: true,
            message: 'Past Papers Scraper API is running',
            version: '1.0.0',
            endpoints: {
                'POST /scrape': 'Scrape past papers from URL',
                'GET /status': 'Check service status',
                'GET /': 'Health check'
            }
        }), {
            status: 200,
            headers
        });
    }
    handleStatusCheck(headers) {
        const status = {
            success: true,
            message: 'Service operational',
            environment: this.env.NODE_ENV,
            features: {
                browserless: !!this.env.BROWSERLESS_API_KEY,
                embeddings: !!this.env.OPENAI_API_KEY,
                r2Storage: !!this.env.PAST_PAPERS_BUCKET,
                database: !!this.env.DATABASE_URL,
            },
            timestamp: new Date().toISOString()
        };
        return new Response(JSON.stringify(status), {
            status: 200,
            headers
        });
    }
    async handleScrapeRequest(request, headers) {
        try {
            const body = await request.json();
            if (!body.url) {
                return this.errorResponse('URL is required in request body', 400, headers);
            }
            if (!isValidPastPapersUrl(body.url)) {
                return this.errorResponse('Invalid pastpapers.co URL format', 400, headers);
            }
            const options = {
                startYear: 2024,
                endYear: 2014,
                skipExistingPdfs: true,
                generateEmbeddings: true,
                concurrency: 3,
                ...body.options
            };
            logger.info('Starting scrape request', { url: body.url, options });
            const startTime = Date.now();
            const scraper = new PastPapersScraper({
                startYear: options.startYear,
                endYear: options.endYear,
                useBrowserless: true,
                delayMs: 2000,
            });
            const r2StorageManager = createWorkerR2Client(this.env.PAST_PAPERS_BUCKET, this.env.R2_CUSTOM_DOMAIN);
            const pdfStorage = new WorkerPdfStorageService(r2StorageManager, {
                concurrency: options.concurrency,
            });
            const embeddings = new EmbeddingsService(this.env.OPENAI_API_KEY, {
                batchSize: 5,
            });
            const database = new DatabaseService();
            logger.info('Scraping paper URLs');
            const scrapedPapers = await scraper.scrapePapers(body.url);
            if (scrapedPapers.length === 0) {
                return this.successResponse({
                    success: true,
                    message: 'No papers found to scrape',
                    data: {
                        papersFound: 0,
                        papersProcessed: 0,
                        pdfsStored: 0,
                        embeddingsGenerated: 0,
                        databaseRecords: 0,
                        duration: Date.now() - startTime
                    }
                }, headers);
            }
            logger.info(`Found ${scrapedPapers.length} papers`);
            logger.info('Downloading and storing PDFs');
            const storageResults = await pdfStorage.batchStorePdfs(scrapedPapers.map(paper => ({
                downloadUrl: paper.downloadUrl,
                metadata: paper.metadata,
            })), {
                skipIfExists: options.skipExistingPdfs,
            });
            let embeddingResults = [];
            if (options.generateEmbeddings) {
                logger.info('Generating embeddings');
                const successfullyStored = storageResults.filter(r => r.success && !r.skipped);
                if (successfullyStored.length > 0) {
                    const metadataForEmbeddings = successfullyStored.map(result => ({
                        metadata: result.metadata
                    }));
                    embeddingResults = await embeddings.batchGenerateEmbeddings(metadataForEmbeddings);
                }
            }
            logger.info('Storing in database');
            const databaseResults = await database.batchInsertPapers(storageResults, embeddingResults);
            const duration = Date.now() - startTime;
            const response = {
                success: true,
                message: 'Scraping completed successfully',
                data: {
                    papersFound: scrapedPapers.length,
                    papersProcessed: storageResults.filter(r => r.success).length,
                    pdfsStored: storageResults.filter(r => r.success && !r.skipped).length,
                    embeddingsGenerated: embeddingResults.filter(r => r.success).length,
                    databaseRecords: databaseResults.filter(r => r.success).length,
                    duration
                }
            };
            logger.info('Scrape request completed', response.data);
            return this.successResponse(response, headers);
        }
        catch (error) {
            logger.error('Scrape request failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return this.errorResponse(error instanceof Error ? error.message : 'Internal server error', 500, headers);
        }
    }
    successResponse(data, headers) {
        return new Response(JSON.stringify(data), {
            status: 200,
            headers
        });
    }
    errorResponse(message, status, headers) {
        return new Response(JSON.stringify({
            success: false,
            error: message
        }), {
            status,
            headers
        });
    }
}
export default {
    async fetch(request, env, ctx) {
        const worker = new PastPapersWorker(env);
        return worker.handleRequest(request);
    },
};
//# sourceMappingURL=worker.js.map