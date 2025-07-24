/**
 * Cloudflare Workers-compatible scraper
 * Adapted from the Node.js version to work in the Workers environment
 */

import { z } from 'zod';

// Types for Workers environment
export interface Env {
  DATABASE_URL: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  OPENAI_API_KEY: string;
  PAPERS_BUCKET: R2Bucket;
  // SCRAPER_QUEUE: Queue; // Disabled for free plan
  JOB_STATUS: KVNamespace;
}

// Zod schema for paper metadata (Workers-compatible)
const PaperMetadataSchema = z.object({
  title: z.string(),
  year: z.number(),
  session: z.string(),
  paperNumber: z.string(),
  type: z.enum(['qp', 'ms', 'gt', 'er', 'ci']),
  subject: z.string(),
  level: z.string(),
  syllabus: z.string(),
  originalUrl: z.string(),
  downloadUrl: z.string(),
  filename: z.string(),
});

export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;

// Scraping configuration
interface ScraperConfig {
  startYear: number;
  endYear: number;
  delayMs: number;
  maxRetries: number;
  timeout: number;
}

// Scraped paper information
interface ScrapedPaper {
  downloadUrl: string;
  metadata: PaperMetadata;
}

/**
 * Workers-compatible PapaCambridge scraper
 */
export class WorkersPapaCambridgeScraper {
  private config: ScraperConfig;

  constructor(config: Partial<ScraperConfig> = {}) {
    this.config = {
      startYear: 2024,
      endYear: 2015, // Last 10 years
      delayMs: 2000,
      maxRetries: 3,
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Main method to scrape papers from a PapaCambridge subject URL
   */
  async scrapePapers(subjectUrl: string): Promise<ScrapedPaper[]> {
    console.log(`🎯 Workers scraper starting for: ${subjectUrl}`);
    
    // Extract subject info from URL
    const subjectInfo = this.parseSubjectUrl(subjectUrl);
    console.log(`📚 Subject: ${subjectInfo.subject}, Level: ${subjectInfo.level}, Syllabus: ${subjectInfo.syllabus}`);

    const allPapers: ScrapedPaper[] = [];

    // Get the main subject page to find all year folders
    const mainPageHtml = await this.fetchWithRetry(subjectUrl);
    const yearUrls = this.extractYearUrls(mainPageHtml, subjectUrl);
    
    console.log(`📅 Found ${yearUrls.length} year folders`);

    // Process each year
    for (const yearUrl of yearUrls) {
      const yearInfo = this.parseYearFromUrl(yearUrl);
      
      // Skip years outside our range
      if (yearInfo.year < this.config.endYear || yearInfo.year > this.config.startYear) {
        console.log(`⏭️  Skipping year ${yearInfo.year} (outside range ${this.config.endYear}-${this.config.startYear})`);
        continue;
      }

      console.log(`📂 Processing ${yearInfo.year} ${yearInfo.session}...`);
      
      try {
        const yearPageHtml = await this.fetchWithRetry(yearUrl);
        const paperUrls = this.extractPaperUrls(yearPageHtml, yearUrl);
        
        console.log(`📄 Found ${paperUrls.length} papers for ${yearInfo.year} ${yearInfo.session}`);

        // Process each paper in this year
        for (const paperUrl of paperUrls) {
          try {
            const paperMetadata = this.createPaperMetadata(
              paperUrl, 
              subjectInfo, 
              yearInfo
            );

            allPapers.push({
              downloadUrl: paperUrl,
              metadata: paperMetadata,
            });

          } catch (error) {
            console.warn(`⚠️  Failed to process paper ${paperUrl}:`, error instanceof Error ? error.message : 'Unknown error');
          }
        }

        // Rate limiting between years
        await this.delay(this.config.delayMs);

      } catch (error) {
        console.error(`❌ Failed to process year ${yearUrl}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    console.log(`✅ Scraping completed. Found ${allPapers.length} papers total`);
    return allPapers;
  }

  /**
   * Parse subject information from URL
   */
  private parseSubjectUrl(url: string): {
    subject: string;
    level: string;
    syllabus: string;
  } {
    const urlParts = url.split('/');
    const subjectPart = urlParts[urlParts.length - 1];
    
    const match = subjectPart.match(/^([a-z]+)-(.+)-(\d+)$/);
    if (!match) {
      throw new Error(`Invalid subject URL format: ${url}`);
    }

    return {
      level: match[1].toUpperCase(),
      subject: match[2].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      syllabus: match[3],
    };
  }

  /**
   * Extract year folder URLs from main subject page
   */
  private extractYearUrls(html: string, baseUrl: string): string[] {
    // Simple HTML parsing for Workers (no cheerio)
    const yearUrls: string[] = [];
    
    // Match href attributes that contain year patterns
    const hrefRegex = /href=["']([^"']*?)["']/gi;
    const textRegex = />([^<]*?(\d{4})-(may-june|oct-nov|march|feb-mar)[^<]*?)</gi;
    
    let match;
    const potentialUrls: string[] = [];
    
    // Extract all href attributes
    while ((match = hrefRegex.exec(html)) !== null) {
      potentialUrls.push(match[1]);
    }
    
    // Find URLs that match year patterns
    for (const href of potentialUrls) {
      if (href.match(/(\d{4})-(may-june|oct-nov|march|feb-mar)/i)) {
        const fullUrl = href.startsWith('http') ? href : `https://pastpapers.papacambridge.com/${href}`;
        yearUrls.push(fullUrl);
      }
    }

    return [...new Set(yearUrls)];
  }

  /**
   * Parse year and session from year URL
   */
  private parseYearFromUrl(url: string): {
    year: number;
    session: string;
  } {
    const match = url.match(/(\d{4})-(may-june|oct-nov|march|feb-mar)/i);
    if (!match) {
      throw new Error(`Could not parse year from URL: ${url}`);
    }

    return {
      year: parseInt(match[1]),
      session: match[2].toLowerCase(),
    };
  }

  /**
   * Extract PDF download URLs from a year page
   */
  private extractPaperUrls(html: string, baseUrl: string): string[] {
    const paperUrls: string[] = [];
    
    // Match PDF download links (papacambridge uses download_file.php pattern)
    const pdfRegex = /href=["']([^"']*?(?:download_file\.php|\.pdf)[^"']*?)["']/gi;
    
    let match;
    while ((match = pdfRegex.exec(html)) !== null) {
      const href = match[1];
      let fullUrl;
      
      if (href.startsWith('http')) {
        fullUrl = href;
      } else {
        const cleanHref = href.startsWith('/') ? href.slice(1) : href;
        fullUrl = `https://pastpapers.papacambridge.com/${cleanHref}`;
      }
      
      paperUrls.push(fullUrl);
    }

    return [...new Set(paperUrls)];
  }

  /**
   * Create paper metadata from URL and subject info
   */
  private createPaperMetadata(
    paperUrl: string,
    subjectInfo: { subject: string; level: string; syllabus: string },
    yearInfo: { year: number; session: string }
  ): PaperMetadata {
    // Extract filename from URL
    let filename = 'unknown.pdf';
    
    if (paperUrl.includes('download_file.php?files=')) {
      const match = paperUrl.match(/files=.*?([^/]+\.pdf)$/i);
      if (match) {
        filename = match[1];
      }
    } else {
      filename = paperUrl.split('/').pop() || 'unknown.pdf';
    }
    
    // Parse paper type and number from filename
    const { type, paperNumber } = this.parsePaperFilename(filename);
    
    const title = `${subjectInfo.subject} ${subjectInfo.syllabus} - ${yearInfo.year} ${yearInfo.session} - Paper ${paperNumber} (${type.toUpperCase()})`;

    return PaperMetadataSchema.parse({
      title,
      year: yearInfo.year,
      session: yearInfo.session,
      paperNumber,
      type,
      subject: subjectInfo.subject,
      level: subjectInfo.level,
      syllabus: subjectInfo.syllabus,
      originalUrl: paperUrl,
      downloadUrl: paperUrl,
      filename,
    });
  }

  /**
   * Parse paper type and number from filename (Cambridge format)
   */
  private parsePaperFilename(filename: string): {
    type: PaperMetadata['type'];
    paperNumber: string;
  } {
    const name = filename.toLowerCase();
    
    let type: PaperMetadata['type'] = 'qp';
    let paperNumber = '1';

    // Handle Cambridge format: 0580_s24_ms_12.pdf
    const cambridgeMatch = name.match(/(\d+)_([sw]\d+)_([a-z]+)(?:_(\d+))?\.pdf$/);
    if (cambridgeMatch) {
      const [, syllabus, session, typeCode, variant] = cambridgeMatch;
      
      switch (typeCode) {
        case 'qp': type = 'qp'; break;
        case 'ms': type = 'ms'; break;
        case 'gt': type = 'gt'; break;
        case 'er': type = 'er'; break;
        case 'ci': type = 'ci'; break;
        default: type = 'qp'; break;
      }
      
      paperNumber = variant || '1';
      return { type, paperNumber };
    }

    // Fallback logic
    if (name.includes('ms')) type = 'ms';
    else if (name.includes('gt')) type = 'gt';
    else if (name.includes('er')) type = 'er';
    else if (name.includes('ci')) type = 'ci';

    const numberMatch = name.match(/(\d+)(?:\.pdf)?$/);
    if (numberMatch) {
      paperNumber = numberMatch[1];
    }

    return { type, paperNumber };
  }

  /**
   * Fetch HTML with retry logic (Workers-compatible)
   */
  private async fetchWithRetry(url: string): Promise<string> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`🌐 Request: ${url} (attempt ${attempt}/${this.config.maxRetries})`);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        
        if (response.ok) {
          const text = await response.text();
          console.log(`✅ Fetched ${url} (${text.length} chars)`);
          return text;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`❌ Attempt ${attempt} failed for ${url}: ${lastError.message}`);

        if (attempt < this.config.maxRetries) {
          const delay = attempt * 1000;
          await this.delay(delay);
        }
      }
    }

    throw new Error(`Failed to fetch ${url} after ${this.config.maxRetries} attempts: ${lastError!.message}`);
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}