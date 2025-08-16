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
export class WorkersPapaCambridgeScraper {
    config;
    constructor(config = {}) {
        this.config = {
            startYear: 2024,
            endYear: 2015,
            delayMs: 2000,
            maxRetries: 3,
            timeout: 30000,
            ...config,
        };
    }
    async scrapePapers(subjectUrl) {
        console.log(`🎯 Workers scraper starting for: ${subjectUrl}`);
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
        const yearUrls = [];
        const hrefRegex = /href=["']([^"']*?)["']/gi;
        let match;
        const potentialUrls = [];
        while ((match = hrefRegex.exec(html)) !== null) {
            potentialUrls.push(match[1]);
        }
        for (const href of potentialUrls) {
            if (href.match(/papers\/caie\/igcse-mathematics-\d+-(\d{4})-(may-june|oct-nov|march|feb-mar)/i)) {
                const fullUrl = href.startsWith('http') ? href : `https://pastpapers.papacambridge.com/${href}`;
                yearUrls.push(fullUrl);
            }
        }
        console.log(`🔍 Found potential URLs: ${potentialUrls.length}`);
        console.log(`📅 Found year URLs: ${yearUrls.length}`, yearUrls);
        return [...new Set(yearUrls)];
    }
    parseYearFromUrl(url) {
        const match = url.match(/(\d{4})-(may-june|oct-nov|march|feb-mar)/i);
        if (!match) {
            throw new Error(`Could not parse year from URL: ${url}`);
        }
        return {
            year: parseInt(match[1]),
            session: match[2].toLowerCase(),
        };
    }
    extractPaperUrls(html, baseUrl) {
        const paperUrls = [];
        const pdfRegex = /href=["']([^"']*?(?:download_file\.php|\.pdf)[^"']*?)["']/gi;
        let match;
        while ((match = pdfRegex.exec(html)) !== null) {
            const href = match[1];
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
        if (name.includes('ms'))
            type = 'ms';
        else if (name.includes('gt'))
            type = 'gt';
        else if (name.includes('er'))
            type = 'er';
        else if (name.includes('ci'))
            type = 'ci';
        const numberMatch = name.match(/(\d+)(?:\.pdf)?$/);
        if (numberMatch) {
            paperNumber = numberMatch[1];
        }
        return { type, paperNumber };
    }
    async fetchWithRetry(url) {
        let lastError;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                console.log(`🌐 Request: ${url} (attempt ${attempt}/${this.config.maxRetries})`);
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    },
                    signal: AbortSignal.timeout(30000),
                });
                if (response.ok) {
                    const text = await response.text();
                    console.log(`✅ Fetched ${url} (${text.length} chars)`);
                    return text;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                console.warn(`❌ Attempt ${attempt} failed for ${url}: ${lastError.message}`);
                if (attempt < this.config.maxRetries) {
                    const delay = attempt * 1000;
                    await this.delay(delay);
                }
            }
        }
        throw new Error(`Failed to fetch ${url} after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=scraper-worker.js.map