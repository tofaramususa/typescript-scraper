import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';

/**
 * Zod schema for paper metadata
 */
const PaperMetadataSchema = z.object({
  title: z.string(),
  year: z.number(),
  session: z.string(),
  paperNumber: z.string(),
  type: z.enum(['qp', 'ms', 'gt', 'er', 'ci']), // question paper, mark scheme, grade threshold, examiner report, confidential instructions
  subject: z.string(),
  level: z.string(),
  syllabus: z.string(),
  originalUrl: z.string(),
  downloadUrl: z.string(),
  filename: z.string(),
});

export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;

/**
 * Configuration for the PapaCambridge scraper
 */
interface ScraperConfig {
  startYear: number;
  endYear: number;
  delayMs: number;
  maxRetries: number;
  timeout: number;
}

/**
 * Scraped paper information
 */
interface ScrapedPaper {
  downloadUrl: string;
  metadata: PaperMetadata;
}

/**
 * PapaCambridge scraper for extracting past papers
 */
export class PapaCambridgeScraper {
  private config: ScraperConfig;
  private httpClient: AxiosInstance;
  private requestCount: number = 0;

  constructor(config: Partial<ScraperConfig> = {}) {
    this.config = {
      startYear: 2024,
      endYear: 2015, // Last 10 years: 2015-2024
      delayMs: 2000,
      maxRetries: 3,
      timeout: 30000,
      ...config,
    };

    this.httpClient = axios.create({
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
    });
  }

  /**
   * Main method to scrape papers from a PapaCambridge subject URL
   * 
   * @param subjectUrl - URL like "https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580"
   * @returns Array of scraped papers with metadata
   */
  async scrapePapers(subjectUrl: string): Promise<ScrapedPaper[]> {
    console.log(`🎯 Starting PapaCambridge scraper for: ${subjectUrl}`);
    
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
    // URL format: https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580
    const urlParts = url.split('/');
    const subjectPart = urlParts[urlParts.length - 1]; // e.g., "igcse-mathematics-0580"
    
    const match = subjectPart.match(/^([a-z]+)-(.+)-(\d+)$/);
    if (!match) {
      throw new Error(`Invalid subject URL format: ${url}`);
    }

    return {
      level: match[1].toUpperCase(), // e.g., "IGCSE"
      subject: match[2].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // e.g., "Mathematics"
      syllabus: match[3], // e.g., "0580"
    };
  }

  /**
   * Extract year folder URLs from main subject page
   */
  private extractYearUrls(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const yearUrls: string[] = [];

    // Look for links that contain year patterns
    const allTexts: string[] = []; // Debug: collect all link texts
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();
      
      if (href && text) {
        allTexts.push(text); // Debug: collect all texts
        
        // Match patterns like "2024-May-June", "2023-Oct-Nov", "2025-March", etc.
        // Also match simple year patterns like "2014", "2015" for older papers
        // More permissive pattern to catch different formats
        const yearMatch = text.match(/(20[0-3]\d|19[89]\d)(?:[-\s]*(may-june|oct-nov|march|feb-mar|june|nov))?/i) ||
                          text.match(/^(20[0-3]\d|19[89]\d)$/); // Just year by itself
        
        if (yearMatch) {
          // Build correct URL - the href is relative like "papers/caie/igcse-mathematics-0580-2024-may-june"
          let fullUrl;
          if (href.startsWith('http')) {
            fullUrl = href;
          } else {
            // Remove leading slash if present and construct URL properly
            const cleanHref = href.startsWith('/') ? href.slice(1) : href;
            fullUrl = `https://pastpapers.papacambridge.com/${cleanHref}`;
          }
          yearUrls.push(fullUrl);
        }
      }
    });

    // Debug: log some sample texts to see what's available
    console.log('📋 Sample link texts found:', allTexts.slice(0, 20).join(', '));

    return [...new Set(yearUrls)]; // Remove duplicates
  }

  /**
   * Parse year and session from year URL
   */
  private parseYearFromUrl(url: string): {
    year: number;
    session: string;
  } {
    // Extract from URL patterns like "2024-may-june", "2023-oct-nov", "2025-march", or just "2014"
    // More permissive matching for different URL formats
    const match = url.match(/(19[89]\d|20[0-3]\d)(?:[-\s]*(may-june|oct-nov|march|feb-mar|june|nov))?/i);
    if (!match) {
      throw new Error(`Could not parse year from URL: ${url}`);
    }

    const year = parseInt(match[1]);
    if (year < 1980 || year > 2030) {
      throw new Error(`Invalid year ${year} parsed from URL: ${url}`);
    }

    return {
      year: year,
      session: match[2] ? match[2].toLowerCase() : 'annual', // Default to 'annual' for simple year folders
    };
  }

  /**
   * Extract PDF download URLs from a year page
   */
  private extractPaperUrls(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const paperUrls: string[] = [];

    // Look for PDF download links (papacambridge uses download_file.php?files= pattern)
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      
      if (href && (href.includes('download_file.php') || href.toLowerCase().endsWith('.pdf'))) {
        let fullUrl;
        if (href.startsWith('http')) {
          fullUrl = href;
        } else {
          // Build URL properly for papacambridge download links
          const cleanHref = href.startsWith('/') ? href.slice(1) : href;
          fullUrl = `https://pastpapers.papacambridge.com/${cleanHref}`;
        }
        paperUrls.push(fullUrl);
      }
    });

    return [...new Set(paperUrls)]; // Remove duplicates
  }

  /**
   * Create paper metadata from URL and subject info
   */
  private createPaperMetadata(
    paperUrl: string,
    subjectInfo: { subject: string; level: string; syllabus: string },
    yearInfo: { year: number; session: string }
  ): PaperMetadata {
    // Extract filename from URL (handle download_file.php?files= format)
    let filename = 'unknown.pdf';
    
    if (paperUrl.includes('download_file.php?files=')) {
      // Extract from download_file.php?files=https://...upload/0580_s24_ms_12.pdf
      const match = paperUrl.match(/files=.*?([^/]+\.pdf)$/i);
      if (match) {
        filename = match[1];
      }
    } else {
      // Standard URL - get last part
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
   * Parse paper type and number from filename
   * Handles Cambridge format: 0580_s24_ms_12.pdf
   */
  private parsePaperFilename(filename: string): {
    type: PaperMetadata['type'];
    paperNumber: string;
  } {
    const name = filename.toLowerCase();
    
    let type: PaperMetadata['type'] = 'qp'; // default to question paper
    let paperNumber = '1'; // default

    // Handle Cambridge format: 0580_s24_ms_12.pdf
    const cambridgeMatch = name.match(/(\d+)_([sw]\d+)_([a-z]+)(?:_(\d+))?\.pdf$/);
    if (cambridgeMatch) {
      const [, syllabus, session, typeCode, variant] = cambridgeMatch;
      
      // Map Cambridge type codes to our types
      switch (typeCode) {
        case 'qp': type = 'qp'; break;
        case 'ms': type = 'ms'; break;
        case 'gt': type = 'gt'; break;
        case 'er': type = 'er'; break;
        case 'ci': type = 'ci'; break;
        default: type = 'qp'; break;
      }
      
      // Use variant number if available, otherwise default to '1'
      paperNumber = variant || '1';
      
      return { type, paperNumber };
    }

    // Fallback to original logic for other formats
    // Determine paper type
    if (name.includes('ms') || name.includes('mark')) {
      type = 'ms';
    } else if (name.includes('gt') || name.includes('grade') || name.includes('threshold')) {
      type = 'gt';
    } else if (name.includes('er') || name.includes('examiner')) {
      type = 'er';
    } else if (name.includes('ci') || name.includes('confidential')) {
      type = 'ci';
    }

    // Extract paper number
    const paperMatch = name.match(/(?:paper|p)[-_]?(\d+)/i);
    if (paperMatch) {
      paperNumber = paperMatch[1];
    } else {
      // Try to extract from common patterns
      const numberMatch = name.match(/(\d+)(?:\.pdf)?$/);
      if (numberMatch) {
        paperNumber = numberMatch[1];
      }
    }

    return { type, paperNumber };
  }

  /**
   * Fetch HTML with retry logic
   */
  private async fetchWithRetry(url: string): Promise<string> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        this.requestCount++;
        console.log(`🌐 Request #${this.requestCount}: ${url} (attempt ${attempt}/${this.config.maxRetries})`);

        const response = await this.httpClient.get(url);
        
        if (response.status === 200 && response.data) {
          console.log(`✅ Fetched ${url} (${response.data.length} chars)`);
          return response.data;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`❌ Attempt ${attempt} failed for ${url}: ${lastError.message}`);

        if (attempt < this.config.maxRetries) {
          const delay = attempt * 1000; // Exponential backoff
          console.log(`⏳ Waiting ${delay}ms before retry...`);
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

  /**
   * Get scraper statistics
   */
  getStats(): {
    requestCount: number;
    config: ScraperConfig;
  } {
    return {
      requestCount: this.requestCount,
      config: this.config,
    };
  }
}

/**
 * Factory function to create a PapaCambridge scraper
 */
export function createPapaCambridgeScraper(config?: Partial<ScraperConfig>): PapaCambridgeScraper {
  return new PapaCambridgeScraper(config);
}