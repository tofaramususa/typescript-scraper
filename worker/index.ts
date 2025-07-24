/**
 * Cloudflare Workers API for Past Papers Scraper
 */

import { WorkersPapaCambridgeScraper, type Env, type PaperMetadata } from '../src/worker/scraper-worker';
import { z } from 'zod';

// Request/Response schemas
const ScrapeRequestSchema = z.object({
  url: z.string().url(),
  config: z.object({
    startYear: z.number().min(2010).max(2030).optional(),
    endYear: z.number().min(2010).max(2030).optional(),
    generateEmbeddings: z.boolean().optional(),
  }).optional(),
});

const JobStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  progress: z.object({
    currentStep: z.string(),
    processed: z.number(),
    total: z.number(),
    percentage: z.number(),
  }).optional(),
  result: z.object({
    totalPapers: z.number(),
    successfulDownloads: z.number(),
    failedDownloads: z.number(),
    processingTime: z.number(),
  }).optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;
type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * Main Worker request handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        
        case path.startsWith('/api/jobs/') && request.method === 'GET':
          return await handleJobStatus(request, env, corsHeaders);
        
        case path === '/api/jobs' && request.method === 'GET':
          return await handleListJobs(request, env, corsHeaders);
        
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

  // Queue consumer disabled for free plan
  // async queue(batch: MessageBatch<ScrapeJob>, env: Env, ctx: ExecutionContext): Promise<void> {
  //   for (const message of batch.messages) {
  //     try {
  //       await processScrapeJob(message.body, env);
  //       message.ack();
  //     } catch (error) {
  //       console.error('Queue processing error:', error);
  //       message.retry();
  //     }
  //   }
  // },
};

/**
 * Handle scrape request - start background job
 */
async function handleScrapeRequest(request: Request, env: Env, corsHeaders: Record<string, string>, ctx: ExecutionContext): Promise<Response> {
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

    // Generate job ID
    const jobId = generateJobId();
    
    // Create job status
    const jobStatus: JobStatus = {
      jobId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store initial job status
    await env.JOB_STATUS.put(jobId, JSON.stringify(jobStatus));

    // Process job synchronously (free plan doesn't support queues)
    const scrapeJob: ScrapeJob = {
      jobId,
      url: validatedRequest.url,
      config: validatedRequest.config || {},
    };

    // Start processing in background using waitUntil
    ctx.waitUntil(processScrapeJob(scrapeJob, env));

    return new Response(
      JSON.stringify({ 
        success: true,
        jobId,
        status: 'queued',
        message: 'Scraping job queued successfully',
        statusUrl: `/api/jobs/${jobId}`
      }), 
      { 
        status: 202,
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

    throw error;
  }
}

/**
 * Handle job status request
 */
async function handleJobStatus(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const jobId = url.pathname.split('/').pop();

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: 'Job ID required' }), 
      { 
        status: 400, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  }

  const jobStatusJson = await env.JOB_STATUS.get(jobId);
  
  if (!jobStatusJson) {
    return new Response(
      JSON.stringify({ error: 'Job not found' }), 
      { 
        status: 404, 
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders 
        } 
      }
    );
  }

  const jobStatus = JSON.parse(jobStatusJson);
  
  return new Response(
    JSON.stringify(jobStatus), 
    { 
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders 
      } 
    }
  );
}

/**
 * Handle list jobs request
 */
async function handleListJobs(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  // This would require a more complex KV listing implementation
  // For now, return a simple message
  return new Response(
    JSON.stringify({ 
      message: 'Job listing not yet implemented',
      hint: 'Use /api/jobs/{jobId} to check specific job status'
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
      'POST /api/scrape': 'Start a new scraping job',
      'GET /api/jobs/{jobId}': 'Check job status',
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
 * Process scraping job in background
 */
async function processScrapeJob(job: ScrapeJob, env: Env): Promise<void> {
  const { jobId, url, config } = job;
  
  try {
    // Update job status to processing
    await updateJobStatus(env, jobId, {
      status: 'processing',
      progress: {
        currentStep: 'initializing',
        processed: 0,
        total: 0,
        percentage: 0,
      },
    });

    console.log(`🚀 Starting scrape job ${jobId} for ${url}`);
    
    const startTime = Date.now();
    
    // Initialize scraper
    const scraper = new WorkersPapaCambridgeScraper({
      startYear: config.startYear || 2024,
      endYear: config.endYear || 2015,
    });

    // Update status
    await updateJobStatus(env, jobId, {
      status: 'processing',
      progress: {
        currentStep: 'scraping-urls',
        processed: 0,
        total: 0,
        percentage: 10,
      },
    });

    // Scrape papers
    const papers = await scraper.scrapePapers(url);
    
    console.log(`📄 Found ${papers.length} papers for job ${jobId}`);

    // Update status
    await updateJobStatus(env, jobId, {
      status: 'processing',
      progress: {
        currentStep: 'downloading-pdfs',
        processed: 0,
        total: papers.length,
        percentage: 30,
      },
    });

    // Process papers (download and store)
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < papers.length; i++) {
      const paper = papers[i];
      
      try {
        // Download PDF
        const pdfResponse = await fetch(paper.downloadUrl);
        if (!pdfResponse.ok) {
          throw new Error(`HTTP ${pdfResponse.status}`);
        }

        const pdfBuffer = await pdfResponse.arrayBuffer();
        
        // Store in R2
        const r2Key = `past-papers/caie/${paper.metadata.level.toLowerCase()}/${paper.metadata.syllabus}/${paper.metadata.year}/${paper.metadata.session}/${paper.metadata.paperNumber}_${paper.metadata.type}.pdf`;
        
        await env.PAPERS_BUCKET.put(r2Key, pdfBuffer, {
          httpMetadata: {
            contentType: 'application/pdf',
          },
          customMetadata: {
            title: paper.metadata.title,
            subject: paper.metadata.subject,
            year: paper.metadata.year.toString(),
            session: paper.metadata.session,
            paperType: paper.metadata.type,
            originalUrl: paper.metadata.originalUrl,
          },
        });

        successCount++;
        
        // Update progress every 10 papers
        if (i % 10 === 0) {
          await updateJobStatus(env, jobId, {
            status: 'processing',
            progress: {
              currentStep: 'downloading-pdfs',
              processed: i + 1,
              total: papers.length,
              percentage: 30 + Math.round((i / papers.length) * 60),
            },
          });
        }
        
      } catch (error) {
        console.error(`Failed to process paper ${paper.metadata.filename}:`, error);
        failCount++;
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const processingTime = Date.now() - startTime;
    
    // Mark job as completed
    await updateJobStatus(env, jobId, {
      status: 'completed',
      progress: {
        currentStep: 'completed',
        processed: papers.length,
        total: papers.length,
        percentage: 100,
      },
      result: {
        totalPapers: papers.length,
        successfulDownloads: successCount,
        failedDownloads: failCount,
        processingTime,
      },
    });

    console.log(`✅ Completed job ${jobId}: ${successCount} successful, ${failCount} failed`);

  } catch (error) {
    console.error(`❌ Job ${jobId} failed:`, error);
    
    // Mark job as failed
    await updateJobStatus(env, jobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Update job status in KV
 */
async function updateJobStatus(env: Env, jobId: string, updates: Partial<JobStatus>): Promise<void> {
  const existingStatusJson = await env.JOB_STATUS.get(jobId);
  const existingStatus = existingStatusJson ? JSON.parse(existingStatusJson) : {};
  
  const updatedStatus: JobStatus = {
    ...existingStatus,
    ...updates,
    jobId,
    updatedAt: new Date().toISOString(),
  };
  
  await env.JOB_STATUS.put(jobId, JSON.stringify(updatedStatus));
}

/**
 * Generate unique job ID
 */
function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Job interface for queue
 */
interface ScrapeJob {
  jobId: string;
  url: string;
  config: {
    startYear?: number;
    endYear?: number;
    generateEmbeddings?: boolean;
  };
}