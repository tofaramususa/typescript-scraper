import { config } from 'dotenv';
import axios from 'axios';
import { PastPapersScraper } from './downloaders/pastpapers-co-scraper';
import { PdfStorageService } from './storage/pdf-storage-service';
import { EmbeddingsService } from './embeddings/generateEmbeddings';
import { DatabaseService } from './storage/database-service';
import { createR2Client } from './storage/r2_client_service';
import { validateEnvironment, logEnvironmentStatus } from './utils/env-validator';
import { ProgressTracker } from './utils/progress-tracker';
import { logger, withMetrics } from './utils/simple-logger';
import { PdfCache } from './utils/pdf-cache';
config();
class PastPapersScraperApp {
    scraper;
    pdfStorage;
    embeddings;
    database;
    config;
    axiosInstance;
    progressTracker;
    pdfCache;
    constructor(config = {}) {
        this.config = {
            startYear: 2024,
            endYear: 2014,
            skipExistingPdfs: true,
            generateEmbeddings: true,
            concurrency: 5,
            ...config,
        };
        this.validateEnvironment();
        this.scraper = new PastPapersScraper({
            startYear: this.config.startYear,
            endYear: this.config.endYear,
            useBrowserless: true,
            delayMs: 3000,
        });
        const r2Client = createR2Client();
        this.pdfStorage = new PdfStorageService(r2Client, {
            concurrency: this.config.concurrency,
        });
        this.embeddings = new EmbeddingsService(process.env.OPENAI_API_KEY, {
            batchSize: 10,
        });
        this.database = new DatabaseService();
        this.axiosInstance = axios.create({
            timeout: 60000,
            maxContentLength: 50 * 1024 * 1024,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        this.pdfCache = new PdfCache();
    }
    async run(subjectUrl) {
        return withMetrics('complete-scraping-process', async () => {
            const sessionId = ProgressTracker.generateSessionId(subjectUrl);
            this.progressTracker = new ProgressTracker(sessionId);
            logger.info('🚀 Starting Past Papers Scraper');
            logger.info(`📚 Target URL: ${subjectUrl}`);
            logger.info(`📅 Year range: ${this.config.endYear} - ${this.config.startYear}`);
            logger.info('🔧 Configuration', this.config);
            const cacheStats = this.pdfCache.getStats();
            logger.info('💾 Cache Status', cacheStats);
            const startTime = Date.now();
            try {
                this.progressTracker.setCurrentStep('scraping-urls');
                logger.info('📋 Step 1: Scraping paper URLs...');
                const scrapedPapers = await withMetrics('scrape-paper-urls', () => this.scraper.scrapePapers(subjectUrl));
                if (scrapedPapers.length === 0) {
                    logger.warn('❌ No papers found to scrape');
                    return;
                }
                this.progressTracker.setTotal(scrapedPapers.length);
                this.progressTracker.completeStep('scraping-urls');
                const unprocessedPapers = this.progressTracker.getUnprocessed(scrapedPapers);
                logger.info(`✅ Found ${scrapedPapers.length} papers total, ${unprocessedPapers.length} to process`);
                if (unprocessedPapers.length === 0) {
                    logger.info('🎉 All papers already processed!');
                    return;
                }
                this.progressTracker.setCurrentStep('downloading-pdfs');
                logger.info('💾 Step 2: Downloading and storing PDFs...');
                const storageResults = await withMetrics('download-and-store-pdfs', () => this.pdfStorage.batchStorePdfs(unprocessedPapers.map(paper => ({
                    downloadUrl: paper.downloadUrl,
                    metadata: paper.metadata,
                })), {
                    skipIfExists: this.config.skipExistingPdfs,
                    onProgress: (completed, total) => {
                        const percent = Math.round((completed / total) * 100);
                        logger.info(`📦 Progress: ${completed}/${total} (${percent}%)`);
                        if (this.progressTracker) {
                            const stats = this.progressTracker.getStats();
                            logger.debug('Progress Stats', stats);
                        }
                    },
                }));
                storageResults.forEach(result => {
                    if (result.success) {
                        this.progressTracker?.markProcessed(result.metadata.originalUrl);
                    }
                });
                this.progressTracker.completeStep('downloading-pdfs');
                const storageStats = this.pdfStorage.getStats(storageResults);
                logger.info('📊 Storage Statistics', storageStats);
                let embeddingResults = [];
                if (this.config.generateEmbeddings) {
                    this.progressTracker.setCurrentStep('generating-embeddings');
                    logger.info('🧠 Step 3: Generating embeddings...');
                    const successfullyStored = storageResults.filter(r => r.success && !r.skipped);
                    if (successfullyStored.length > 0) {
                        const metadataForEmbeddings = successfullyStored.map(result => ({
                            metadata: result.metadata
                        }));
                        embeddingResults = await withMetrics('generate-embeddings', () => this.embeddings.batchGenerateEmbeddings(metadataForEmbeddings, {
                            onProgress: (completed, total) => {
                                const percent = Math.round((completed / total) * 100);
                                logger.info(`🧠 Embedding progress: ${completed}/${total} (${percent}%)`);
                            },
                        }));
                        this.progressTracker.completeStep('generating-embeddings');
                        const embeddingStats = this.embeddings.getStats(embeddingResults);
                        logger.info('📊 Embedding Statistics', embeddingStats);
                    }
                    else {
                        logger.warn('⚠️  No successfully stored PDFs to generate embeddings for');
                    }
                }
                this.progressTracker.setCurrentStep('storing-database');
                logger.info('🗄️  Step 4: Storing paper information in database...');
                const databaseResults = await withMetrics('store-papers-database', () => this.database.batchInsertPapers(storageResults, embeddingResults));
                this.progressTracker.completeStep('storing-database');
                const dbStats = await this.database.getStats();
                logger.info('📊 Database Statistics', dbStats);
                const finalCacheStats = this.pdfCache.getStats();
                logger.info('💾 Final Cache Stats', finalCacheStats);
                logger.logSystemMetrics();
                const duration = Math.round((Date.now() - startTime) / 1000);
                const progressStats = this.progressTracker.getStats();
                logger.info('✅ Scraping completed successfully!');
                logger.info('📊 Final Summary', {
                    totalTime: `${duration}s`,
                    papersFound: scrapedPapers.length,
                    papersProcessed: progressStats.processed,
                    pdfsStored: storageStats.successful,
                    embeddingsGenerated: embeddingResults.filter(r => r.success).length,
                    databaseRecords: databaseResults.filter(r => r.success).length,
                    progressPercentage: `${progressStats.percentage}%`
                });
                if (progressStats.percentage === 100) {
                    this.progressTracker.cleanup();
                }
            }
            catch (error) {
                logger.error('❌ Scraping failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
                this.progressTracker?.saveProgress();
                throw error;
            }
        });
    }
    validateEnvironment() {
        try {
            logEnvironmentStatus();
            validateEnvironment(this.config.generateEmbeddings);
            console.log('✅ All environment variables are properly configured');
        }
        catch (error) {
            console.error('❌ Environment validation failed:');
            console.error(error instanceof Error ? error.message : 'Unknown validation error');
            throw new Error('Environment configuration is invalid. Please check your .env file.');
        }
    }
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: npm run dev <pastpapers-url>');
        console.log('Example: npm run dev "https://pastpapers.co/cie/?dir=IGCSE/Mathematics-0580"');
        process.exit(1);
    }
    const subjectUrl = args[0];
    try {
        const app = new PastPapersScraperApp({});
        await app.run(subjectUrl);
    }
    catch (error) {
        console.error('Application failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map