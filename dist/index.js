import { config } from 'dotenv';
import { PapaCambridgeScraper } from './downloaders/papacambridge-scraper';
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
        this.scraper = new PapaCambridgeScraper({
            startYear: this.config.startYear,
            endYear: this.config.endYear,
            delayMs: 2000,
        });
        const r2Client = createR2Client();
        this.pdfStorage = new PdfStorageService(r2Client, {
            concurrency: this.config.concurrency,
        });
        this.embeddings = new EmbeddingsService(process.env.OPENAI_API_KEY, {
            batchSize: 10,
        });
        this.database = new DatabaseService();
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
                const unprocessedPapers = this.progressTracker ? this.progressTracker.getUnprocessed(scrapedPapers) : scrapedPapers;
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
                            metadata: {
                                examBoard: 'CAIE',
                                level: result.metadata.level,
                                subject: result.metadata.subject,
                                subjectCode: result.metadata.syllabus,
                                year: result.metadata.year.toString(),
                                session: result.metadata.session,
                                paperNumber: result.metadata.paperNumber,
                                paperType: result.metadata.type,
                                originalUrl: result.metadata.originalUrl,
                            }
                        })).filter(item => item.metadata.paperType === 'qp' || item.metadata.paperType === 'ms');
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
function parseCliArgs(args) {
    if (args.length === 0) {
        console.log('Usage: npm run dev <papacambridge-url> [options]');
        console.log('');
        console.log('Options:');
        console.log('  --start-year <year>    Most recent year to scrape (default: 2024)');
        console.log('  --end-year <year>      Earliest year to scrape (default: 2014)');
        console.log('  --no-embeddings        Skip generating AI embeddings');
        console.log('  --concurrency <num>    Number of concurrent downloads (default: 5)');
        console.log('');
        console.log('Examples:');
        console.log('  npm run dev "https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580"');
        console.log('  npm run dev "https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580" --start-year 2023 --end-year 2020');
        console.log('  npm run dev "https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580" --start-year 2022 --end-year 2022 --no-embeddings');
        process.exit(1);
    }
    const url = args[0];
    const config = {};
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--start-year':
                const startYear = parseInt(args[i + 1]);
                if (isNaN(startYear) || startYear < 2000 || startYear > 2030) {
                    throw new Error('Invalid start year. Must be between 2000 and 2030');
                }
                config.startYear = startYear;
                i++;
                break;
            case '--end-year':
                const endYear = parseInt(args[i + 1]);
                if (isNaN(endYear) || endYear < 2000 || endYear > 2030) {
                    throw new Error('Invalid end year. Must be between 2000 and 2030');
                }
                config.endYear = endYear;
                i++;
                break;
            case '--no-embeddings':
                config.generateEmbeddings = false;
                break;
            case '--concurrency':
                const concurrency = parseInt(args[i + 1]);
                if (isNaN(concurrency) || concurrency < 1 || concurrency > 20) {
                    throw new Error('Invalid concurrency. Must be between 1 and 20');
                }
                config.concurrency = concurrency;
                i++;
                break;
            default:
                if (arg.startsWith('--')) {
                    throw new Error(`Unknown option: ${arg}`);
                }
                break;
        }
    }
    if (config.startYear && config.endYear && config.startYear < config.endYear) {
        throw new Error('Start year must be greater than or equal to end year');
    }
    return { url, ...config };
}
async function main() {
    const args = process.argv.slice(2);
    try {
        const { url, ...config } = parseCliArgs(args);
        console.log('🔧 Scraper Configuration:');
        console.log(`   📚 URL: ${url}`);
        if (config.startYear)
            console.log(`   📅 Start Year: ${config.startYear}`);
        if (config.endYear)
            console.log(`   📅 End Year: ${config.endYear}`);
        if (config.generateEmbeddings !== undefined)
            console.log(`   🧠 Generate Embeddings: ${config.generateEmbeddings}`);
        if (config.concurrency)
            console.log(`   🔄 Concurrency: ${config.concurrency}`);
        console.log('');
        const app = new PastPapersScraperApp(config);
        await app.run(url);
    }
    catch (error) {
        console.error('❌ Application failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map