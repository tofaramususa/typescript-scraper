import axios from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';
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
export class PapaCambridgeScraper {
    config;
    httpClient;
    requestCount = 0;
    constructor(config = {}) {
        this.config = {
            startYear: 2024,
            endYear: 2015,
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
    async scrapePapers(subjectUrl) {
        console.log(`🎯 Starting PapaCambridge scraper for: ${subjectUrl}`);
        const subjectInfo = this.parseSubjectUrl(subjectUrl);
        console.log(`📚 Subject: ${subjectInfo.subject}, Level: ${subjectInfo.level}, Syllabus: ${subjectInfo.syllabus}`);
        const allPapers = [];
        const mainPageHtml = await this.fetchWithRetry(subjectUrl);
        const yearUrls = this.extractYearUrls(mainPageHtml, subjectUrl);
        console.log(`📅 Found ${yearUrls.length} year folders`);
        for (const yearUrl of yearUrls) {
            const yearInfo = this.parseYearFromUrl(yearUrl);
            if (yearInfo.year < this.config.endYear || yearInfo.year > this.config.startYear) {
                console.log(`⏭️  Skipping year ${yearInfo.year} (outside range ${this.config.endYear}-${this.config.startYear})`);
                continue;
            }
            console.log(`📂 Processing ${yearInfo.year} ${yearInfo.session}...`);
            try {
                const yearPageHtml = await this.fetchWithRetry(yearUrl);
                const paperUrls = this.extractPaperUrls(yearPageHtml, yearUrl);
                console.log(`📄 Found ${paperUrls.length} papers for ${yearInfo.year} ${yearInfo.session}`);
                for (const paperUrl of paperUrls) {
                    try {
                        const paperMetadata = this.createPaperMetadata(paperUrl, subjectInfo, yearInfo);
                        allPapers.push({
                            downloadUrl: paperUrl,
                            metadata: paperMetadata,
                        });
                    }
                    catch (error) {
                        console.warn(`⚠️  Failed to process paper ${paperUrl}:`, error instanceof Error ? error.message : 'Unknown error');
                    }
                }
                await this.delay(this.config.delayMs);
            }
            catch (error) {
                console.error(`❌ Failed to process year ${yearUrl}:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
        console.log(`✅ Scraping completed. Found ${allPapers.length} papers total`);
        return allPapers;
    }
    parseSubjectUrl(url) {
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
    extractYearUrls(html, baseUrl) {
        const $ = cheerio.load(html);
        const yearUrls = [];
        const allTexts = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim();
            if (href && text) {
                allTexts.push(text);
                const yearMatch = text.match(/(20[0-3]\d|19[89]\d)(?:[-\s]*(may-june|oct-nov|march|feb-mar|june|nov))?/i) ||
                    text.match(/^(20[0-3]\d|19[89]\d)$/);
                if (yearMatch) {
                    let fullUrl;
                    if (href.startsWith('http')) {
                        fullUrl = href;
                    }
                    else {
                        const cleanHref = href.startsWith('/') ? href.slice(1) : href;
                        fullUrl = `https://pastpapers.papacambridge.com/${cleanHref}`;
                    }
                    yearUrls.push(fullUrl);
                }
            }
        });
        console.log('📋 Sample link texts found:', allTexts.slice(0, 20).join(', '));
        return [...new Set(yearUrls)];
    }
    parseYearFromUrl(url) {
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
            session: match[2] ? match[2].toLowerCase() : 'annual',
        };
    }
    extractPaperUrls(html, baseUrl) {
        const $ = cheerio.load(html);
        const paperUrls = [];
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            if (href && (href.includes('download_file.php') || href.toLowerCase().endsWith('.pdf'))) {
                let fullUrl;
                if (href.startsWith('http')) {
                    fullUrl = href;
                }
                else {
                    const cleanHref = href.startsWith('/') ? href.slice(1) : href;
                    fullUrl = `https://pastpapers.papacambridge.com/${cleanHref}`;
                }
                paperUrls.push(fullUrl);
            }
        });
        return [...new Set(paperUrls)];
    }
    createPaperMetadata(paperUrl, subjectInfo, yearInfo) {
        let filename = 'unknown.pdf';
        if (paperUrl.includes('download_file.php?files=')) {
            const match = paperUrl.match(/files=.*?([^/]+\.pdf)$/i);
            if (match) {
                filename = match[1];
            }
        }
        else {
            filename = paperUrl.split('/').pop() || 'unknown.pdf';
        }
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
    parsePaperFilename(filename) {
        const name = filename.toLowerCase();
        let type = 'qp';
        let paperNumber = '1';
        const cambridgeMatch = name.match(/(\d+)_([sw]\d+)_([a-z]+)(?:_(\d+))?\.pdf$/);
        if (cambridgeMatch) {
            const [, syllabus, session, typeCode, variant] = cambridgeMatch;
            switch (typeCode) {
                case 'qp':
                    type = 'qp';
                    break;
                case 'ms':
                    type = 'ms';
                    break;
                case 'gt':
                    type = 'gt';
                    break;
                case 'er':
                    type = 'er';
                    break;
                case 'ci':
                    type = 'ci';
                    break;
                default:
                    type = 'qp';
                    break;
            }
            paperNumber = variant || '1';
            return { type, paperNumber };
        }
        if (name.includes('ms') || name.includes('mark')) {
            type = 'ms';
        }
        else if (name.includes('gt') || name.includes('grade') || name.includes('threshold')) {
            type = 'gt';
        }
        else if (name.includes('er') || name.includes('examiner')) {
            type = 'er';
        }
        else if (name.includes('ci') || name.includes('confidential')) {
            type = 'ci';
        }
        const paperMatch = name.match(/(?:paper|p)[-_]?(\d+)/i);
        if (paperMatch) {
            paperNumber = paperMatch[1];
        }
        else {
            const numberMatch = name.match(/(\d+)(?:\.pdf)?$/);
            if (numberMatch) {
                paperNumber = numberMatch[1];
            }
        }
        return { type, paperNumber };
    }
    async fetchWithRetry(url) {
        let lastError;
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
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                console.warn(`❌ Attempt ${attempt} failed for ${url}: ${lastError.message}`);
                if (attempt < this.config.maxRetries) {
                    const delay = attempt * 1000;
                    console.log(`⏳ Waiting ${delay}ms before retry...`);
                    await this.delay(delay);
                }
            }
        }
        throw new Error(`Failed to fetch ${url} after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getStats() {
        return {
            requestCount: this.requestCount,
            config: this.config,
        };
    }
}
export function createPapaCambridgeScraper(config) {
    return new PapaCambridgeScraper(config);
}
//# sourceMappingURL=papacambridge-scraper.js.map