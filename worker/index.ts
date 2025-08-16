/**
 * Cloudflare Workers API for Past Papers Scraper
 */

import { WorkersPapaCambridgeScraper, type Env, type PaperMetadata } from '../src/worker/scraper-worker';
import { WorkersDatabaseService, type DatabaseResult } from '../src/worker/database-service-worker';
import { WorkersEmbeddingService, type EmbeddingResult } from '../src/worker/embedding-service-worker';
import { WorkersR2Service, type R2StorageResult } from '../src/worker/r2-service-worker';
import { z } from 'zod';

// Request/Response schemas
const ScrapeRequestSchema = z.object({
  url: z.string().url(),
  config: z.object({
    startYear: z.number().min(2010).max(2030).optional(),
    endYear: z.number().min(2010).max(2030).optional(),
    generateEmbeddings: z.boolean().optional(),
    maxPapers: z.number().min(1).max(100).optional(), // Max papers to process in batch
  }).optional(),
});

// Scrape configuration interface
interface ScrapeConfig {
  startYear?: number;
  endYear?: number;
  generateEmbeddings?: boolean;
  maxPapers?: number;
}

// Scrape result interface
interface ScrapeResult {
  success: boolean;
  totalPapers: number;
  successfulDownloads: number;
  failedDownloads: number;
  skippedDuplicates: number;
  skippedDueToLimits: number;
  embeddingsGenerated: number;
  databaseRecords: number;
  processingTime: number;
  error?: string;
}

// Scraped paper interface
interface ScrapedPaper {
  downloadUrl: string;
  metadata: PaperMetadata;
}

/**
 * Main Worker request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route handlers
      switch (true) {
        case path === '/api/scrape' && request.method === 'POST':
          return await handleScrapeRequest(request, env, corsHeaders, ctx);
        
        // Download endpoint temporarily disabled - requires getPaperById method
        // case path.startsWith('/api/download/') && request.method === 'GET':
        //   return await handleDownloadRequest(request, env, corsHeaders);
        
        case path === '/api/health' && request.method === 'GET':
          return handleHealthCheck(corsHeaders);
        
        case path === '/' && request.method === 'GET':
          return handleRoot(corsHeaders);
        
        default:
          return new Response(
            JSON.stringify({ error: 'Not found', path, method: request.method }), 
            { 
              status: 404, 
              headers: { 
                'Content-Type': 'application/json',
                ...corsHeaders 
              } 
            }
          );
      }
    } catch (error) {
      console.error('Unhandled error:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        }), 
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          } 
        }
      );
    }
  },
};

/**
 * Handle scrape request - process synchronously and return results
 */
async function handleScrapeRequest(request: Request, env: Env, corsHeaders: Record<string, string>, ctx?: any): Promise<Response> {
  try {
    const body = await request.json();
    const validatedRequest = ScrapeRequestSchema.parse(body);

    // Validate PapaCambridge URL
    if (!validatedRequest.url.includes('pastpapers.papacambridge.com')) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid URL', 
          message: 'Only PapaCambridge URLs are supported'
        }), 
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          } 
        }
      );
    }

    // Start processing in background - return immediate response
    ctx.waitUntil(processScrapeJob({
      url: validatedRequest.url,
      config: validatedRequest.config || {},
    }, env));

    // Return immediate acknowledgment
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Scraping started - processing papers sequentially',
        note: 'All papers will be downloaded one by one. Check logs for progress.',
        url: validatedRequest.url,
        yearRange: `${validatedRequest.config?.endYear || 2015}-${validatedRequest.config?.startYear || 2024}`,
        timestamp: new Date().toISOString()
      }), 
      { 
        status: 202, // Accepted
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ 
          error: 'Validation error', 
          details: error.errors 
        }), 
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  }
}

/**
 * Handle download request - generate presigned URL
 */
async function handleDownloadRequest(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const url = new URL(request.url);
    const paperId = url.pathname.split('/').pop();

    if (!paperId) {
      return new Response(
        JSON.stringify({ error: 'Paper ID required' }), 
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          } 
        }
      );
    }

    // Get paper details from database
    const dbService = new WorkersDatabaseService(env.DATABASE_URL);
    const paperDetails = await dbService.getPaperById(parseInt(paperId));
    
    if (!paperDetails) {
      return new Response(
        JSON.stringify({ error: 'Paper not found' }), 
        { 
          status: 404, 
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders 
          } 
        }
      );
    }

    // Generate presigned URL (1 hour expiry)
    const r2Service = new WorkersR2Service(env.PAPERS_BUCKET);
    const downloadUrl = await r2Service.generatePresignedUrl(paperDetails.r2Key, 3600);

    return new Response(
      JSON.stringify({ 
        downloadUrl,
        expiresIn: 3600,
        filename: paperDetails.filename
      }), 
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate download URL',
        message: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  }
}

/**
 * Handle health check
 */
function handleHealthCheck(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }), 
    { 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    }
  );
}

/**
 * Handle root request
 */
function handleRoot(corsHeaders: Record<string, string>): Response {
  const apiDocs = {
    name: 'Past Papers Scraper API',
    version: '1.0.0',
    endpoints: {
      'POST /api/scrape': 'Start scraping papers (sequential background processing)',
      'GET /api/health': 'Health check',
    },
    example: {
      scrapeRequest: {
        url: 'https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580',
        config: {
          startYear: 2024,
          endYear: 2020,
          generateEmbeddings: true
        }
      }
    }
  };

  return new Response(
    JSON.stringify(apiDocs, null, 2), 
    { 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    }
  );
}

/**
 * Process scraping request - Complete Pipeline
 */
async function processScrapeJob(request: { url: string; config: ScrapeConfig }, env: Env): Promise<ScrapeResult> {
  const { url, config } = request;
  
  try {
    console.log(`🚀 Starting complete pipeline: ${url}`);
    
    const startTime = Date.now();
    
    // Initialize services
    const scraper = new WorkersPapaCambridgeScraper({
      startYear: config.startYear || 2024,
      endYear: config.endYear || 2015,
    });
    
    const dbService = new WorkersDatabaseService(env.DATABASE_URL);
    const embeddingService = new WorkersEmbeddingService(env.OPENAI_API_KEY);
    const r2Service = new WorkersR2Service(env.PAPERS_BUCKET);

    // Step 1: Scrape paper URLs
    const papers = await scraper.scrapePapers(url);
    console.log(`📄 Found ${papers.length} papers`);

    // Step 2: Filter out duplicates (check database and R2)
    const newPapers: ScrapedPaper[] = [];
    let skippedCount = 0;

    for (const paper of papers) {
      // Check database first (faster)
      const dbExists = await dbService.paperExists(paper.metadata);
      if (dbExists.exists) {
        console.log(`⏭️  Skipping ${paper.metadata.filename} - already in database`);
        skippedCount++;
        continue;
      }

      // Check R2 storage
      const r2Exists = await r2Service.paperExistsInR2(paper.metadata);
      if (r2Exists.exists) {
        console.log(`⏭️  Skipping ${paper.metadata.filename} - already in R2`);
        skippedCount++;
        continue;
      }

      newPapers.push(paper);
    }

    console.log(`📋 Processing ${newPapers.length} new papers (${skippedCount} skipped as duplicates)`);

    // Process all papers but download them one by one sequentially
    const maxPapers = config.maxPapers || 50; // Default to 50 papers max
    const papersToProcess = newPapers.slice(0, maxPapers);
    
    if (papersToProcess.length < newPapers.length) {
      console.log(`⚠️  Limited to ${maxPapers} papers due to Workers subrequest limits. ${newPapers.length - maxPapers} papers will be skipped.`);
    }

    // Step 3: Download PDFs and store in R2 (ONE BY ONE - NO PARALLEL PROCESSING)
    const storageResults: R2StorageResult[] = [];
    
    console.log(`🔄 Starting sequential download of ${papersToProcess.length} papers...`);
    
    for (let i = 0; i < papersToProcess.length; i++) {
      const paper = papersToProcess[i];
      
      console.log(`📥 Downloading paper ${i + 1}/${papersToProcess.length}: ${paper.metadata.filename}`);
      
      try {
        // Download PDF (one at a time)
        const pdfResponse = await fetch(paper.downloadUrl);
        if (!pdfResponse.ok) {
          throw new Error(`HTTP ${pdfResponse.status}`);
        }

        const pdfBuffer = await pdfResponse.arrayBuffer();
        console.log(`✅ Downloaded ${paper.metadata.filename} (${pdfBuffer.byteLength} bytes)`);
        
        // Store in R2 (one at a time)
        const r2Result = await r2Service.storePDF(paper.metadata, pdfBuffer);
        storageResults.push(r2Result);
        
        if (r2Result.success) {
          console.log(`💾 Stored ${paper.metadata.filename} in R2`);
        } else {
          console.log(`❌ Failed to store ${paper.metadata.filename} in R2: ${r2Result.error}`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to download ${paper.metadata.filename}:`, error);
        storageResults.push({
          success: false,
          metadata: paper.metadata,
          error: error instanceof Error ? error.message : 'Download failed',
        });
      }

      // Rate limiting between each download
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between downloads
    }

    const successfulStorageResults = storageResults.filter(r => r.success && !r.skipped);
    console.log(`📦 R2 Storage: ${successfulStorageResults.length} successful, ${storageResults.length - successfulStorageResults.length} failed`);

    // Step 4: Generate embeddings (if enabled)
    let embeddingResults: EmbeddingResult[] = [];
    if (config.generateEmbeddings !== false && successfulStorageResults.length > 0) {
      const metadataForEmbeddings = successfulStorageResults.map(r => r.metadata);
      embeddingResults = await embeddingService.generateEmbeddings(metadataForEmbeddings);
      
      console.log(`🤖 Generated ${embeddingResults.filter(r => r.success).length} embeddings`);
    }

    // Step 5: Store metadata in database
    const databaseResults: DatabaseResult[] = [];
    
    // Create embedding map for quick lookup
    const embeddingMap = new Map();
    embeddingResults.forEach(result => {
      if (result.success) {
        const key = `${result.metadata.syllabus}-${result.metadata.year}-${result.metadata.session}-${result.metadata.paperNumber}-${result.metadata.type}`;
        embeddingMap.set(key, result);
      }
    });

    for (const storageResult of successfulStorageResults) {
      if (!storageResult.r2Url) continue;

      // Find corresponding embedding
      const embeddingKey = `${storageResult.metadata.syllabus}-${storageResult.metadata.year}-${storageResult.metadata.session}-${storageResult.metadata.paperNumber}-${storageResult.metadata.type}`;
      const embeddingResult = embeddingMap.get(embeddingKey);

      const dbResult = await dbService.insertPaper(
        storageResult.metadata,
        storageResult.r2Url,
        embeddingResult?.embedding,
        embeddingResult?.embeddingModel
      );

      databaseResults.push(dbResult);
    }

    const successfulDbResults = databaseResults.filter(r => r.success && !r.skipped);
    const skippedDbResults = databaseResults.filter(r => r.skipped);
    console.log(`💾 Database: ${successfulDbResults.length} inserted, ${skippedDbResults.length} skipped, ${databaseResults.length - successfulDbResults.length - skippedDbResults.length} failed`);

    const processingTime = Date.now() - startTime;
    
    const result: ScrapeResult = {
      success: true,
      totalPapers: papers.length,
      successfulDownloads: successfulStorageResults.length,
      failedDownloads: storageResults.length - successfulStorageResults.length,
      skippedDuplicates: skippedCount,
      skippedDueToLimits: newPapers.length - papersToProcess.length,
      embeddingsGenerated: embeddingResults.filter(r => r.success).length,
      databaseRecords: successfulDbResults.length,
      processingTime,
    };

    console.log(`✅ Pipeline completed:`);
    console.log(`   📄 Total papers found: ${papers.length}`);
    console.log(`   ⏭️  Skipped duplicates: ${skippedCount}`);
    console.log(`   📦 R2 storage: ${successfulStorageResults.length} successful`);
    console.log(`   🤖 Embeddings: ${embeddingResults.filter(r => r.success).length} generated`);
    console.log(`   💾 Database: ${successfulDbResults.length} records inserted`);
    console.log(`   ⏱️  Processing time: ${Math.round(processingTime / 1000)}s`);

    return result;

  } catch (error) {
    console.error(`❌ Pipeline failed:`, error);
    
    return {
      success: false,
      totalPapers: 0,
      successfulDownloads: 0,
      failedDownloads: 0,
      skippedDuplicates: 0,
      skippedDueToLimits: 0,
      embeddingsGenerated: 0,
      databaseRecords: 0,
      processingTime: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}