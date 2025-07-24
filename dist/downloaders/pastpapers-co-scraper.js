import axios from 'axios';
import * as cheerio from 'cheerio';
import { BrowserlessClient } from '../services/browserless-client';
import { parsePaperUrl, isValidPastPapersUrl } from '../utils/url-parser';
export class PastPapersScraper {
    config;
    axiosInstance;
    browserlessClient;
    constructor(config = {}) {
        this.config = {
            startYear: 2024,
            endYear: 2014,
            maxRetries: 3,
            delayMs: 8000,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            useBrowserless: true,
            ...config,
        };
        this.axiosInstance = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': this.config.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            },
        });
        this.browserlessClient = new BrowserlessClient({
            useResidentialProxy: true,
            maxRetries: this.config.maxRetries,
            rateLimitDelay: 7000,
            useContentApiOnly: true,
        });
    }
    async scrapePapers(subjectUrl) {
        if (!isValidPastPapersUrl(subjectUrl)) {
            throw new Error(`Invalid pastpapers.co URL: ${subjectUrl}`);
        }
        console.log(`🚀 Starting scrape for: ${subjectUrl}`);
        const allPapers = [];
        console.log(`🔍 Discovering available directories using query format: ${subjectUrl}`);
        const availableDirectories = await this.discoverDirectories(subjectUrl);
        if (availableDirectories.length === 0) {
            console.log(`❌ No directories found at ${subjectUrl}`);
            return allPapers;
        }
        console.log(`📂 Found ${availableDirectories.length} directories to scrape`);
        for (const directory of availableDirectories) {
            try {
                console.log(`\n📂 Scraping directory: ${directory}`);
                const directoryPapers = await this.scrapeSession(directory);
                allPapers.push(...directoryPapers);
                console.log(`✅ Directory complete: Found ${directoryPapers.length} papers`);
                await this.delay(this.config.delayMs);
            }
            catch (error) {
                console.error(`❌ Failed to scrape directory ${directory}:`, error instanceof Error ? error.message : 'Unknown error');
                continue;
            }
        }
        console.log(`\n🎉 Scraping completed! Found ${allPapers.length} papers total.`);
        this.logScrapingSummary(allPapers);
        return allPapers;
    }
    async discoverDirectories(queryUrl) {
        try {
            const html = await this.fetchWithRetry(queryUrl);
            const $ = cheerio.load(html);
            const directories = [];
            console.log(`📋 Discovering year/session directories from query URL`);
            const directoriesFound = new Set();
            $('a[href]').each((_, element) => {
                const href = $(element).attr('href');
                const text = $(element).text().trim();
                if (href && href.includes('?dir=')) {
                    const dirMatch = href.match(/[?&]dir=([^&]+)/);
                    if (dirMatch) {
                        const dirPath = decodeURIComponent(dirMatch[1]);
                        if (this.isRelevantSessionDirectory(dirPath, text)) {
                            const baseUrl = queryUrl.split('?')[0];
                            const fullUrl = `${baseUrl}?dir=${encodeURIComponent(dirPath)}`;
                            directoriesFound.add(fullUrl);
                            console.log(`  ✅ Found: ${dirPath} (${text})`);
                        }
                        else {
                            console.log(`  ⚪ Skipped: ${dirPath} (${text}) - not relevant`);
                        }
                    }
                }
            });
            directories.push(...Array.from(directoriesFound));
            console.log(`📊 Total relevant directories found: ${directories.length}`);
            return directories.sort();
        }
        catch (error) {
            console.error(`❌ Failed to discover directories: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }
    isRelevantSessionDirectory(dirPath, linkText) {
        const yearMatch = dirPath.match(/(\d{4})/);
        if (!yearMatch) {
            return false;
        }
        const year = parseInt(yearMatch[1]);
        if (year >= this.config.endYear && year <= this.config.startYear) {
            const subjectPattern = /IGCSE\/[^\/]+-\d+\/\d{4}/;
            if (subjectPattern.test(dirPath)) {
                console.log(`  ✅ Found relevant directory: ${dirPath} (${linkText})`);
                return true;
            }
        }
        return false;
    }
    logScrapingSummary(papers) {
        if (papers.length === 0) {
            console.log(`📊 No papers found`);
            return;
        }
        const summary = papers.reduce((acc, paper) => {
            const year = paper.metadata.year;
            const type = paper.metadata.paperType;
            if (!acc[year]) {
                acc[year] = { qp: 0, ms: 0, total: 0 };
            }
            if (type === 'qp' || type === 'ms') {
                acc[year][type]++;
            }
            acc[year].total++;
            return acc;
        }, {});
        console.log(`\n📊 Scraping Summary:`);
        console.log(`📋 Total papers: ${papers.length}`);
        console.log(`📚 Years covered: ${Object.keys(summary).sort().join(', ')}`);
        console.log(`\n📈 Breakdown by year:`);
        Object.entries(summary)
            .sort(([a], [b]) => b.localeCompare(a))
            .forEach(([year, stats]) => {
            console.log(`  ${year}: ${stats.total} papers (${stats.qp} question papers, ${stats.ms} mark schemes)`);
        });
    }
    async scrapeSession(sessionUrl) {
        const html = await this.fetchWithRetry(sessionUrl);
        const $ = cheerio.load(html);
        const papers = [];
        console.log(`🔎 Scanning session for PDFs: ${sessionUrl}`);
        const pdfFilenames = new Set();
        $('a').each((_, element) => {
            const href = $(element).attr('href');
            const linkText = $(element).text().trim();
            if (linkText && linkText.endsWith('.pdf')) {
                pdfFilenames.add(linkText);
                console.log(`📄 Found PDF filename link: ${linkText}`);
            }
            if (href && href.endsWith('.pdf')) {
                const filename = href.split('/').pop();
                if (filename) {
                    pdfFilenames.add(filename);
                    console.log(`📄 Found PDF in href: ${filename}`);
                }
            }
        });
        const pageText = $.text();
        const pdfMatches = pageText.match(/\d{4}_[a-z]+\d{2}_[a-z]+_\d+\.pdf/gi);
        if (pdfMatches) {
            pdfMatches.forEach(filename => {
                pdfFilenames.add(filename);
                console.log(`📄 Found PDF pattern in text: ${filename}`);
            });
        }
        $('a').filter((_, el) => $(el).text().toLowerCase().includes('download')).each((_, element) => {
            const href = $(element).attr('href');
            if (href && href.includes('.pdf')) {
                const filename = href.split('/').pop();
                if (filename && filename.endsWith('.pdf')) {
                    pdfFilenames.add(filename);
                    console.log(`📄 Found PDF via download button: ${filename}`);
                }
            }
        });
        $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            if (href.includes('.pdf')) {
                let filename = '';
                if (href.endsWith('.pdf')) {
                    filename = href.split('/').pop() || '';
                }
                else if (href.includes('.pdf')) {
                    const pdfMatch = href.match(/([^/]+\.pdf)/);
                    if (pdfMatch) {
                        filename = pdfMatch[1];
                    }
                }
                if (filename && this.isValidPaperFilename(filename)) {
                    pdfFilenames.add(filename);
                    console.log(`📄 Found PDF in href attribute: ${filename}`);
                }
            }
        });
        console.log(`📋 Total unique PDF filenames found: ${pdfFilenames.size}`);
        for (const filename of pdfFilenames) {
            try {
                const fullUrl = `${sessionUrl}${filename}`;
                if (this.isValidPaperFilename(filename)) {
                    const metadata = parsePaperUrl(fullUrl);
                    papers.push({
                        metadata,
                        downloadUrl: fullUrl,
                    });
                    console.log(`✅ Successfully parsed: ${metadata.subject} ${metadata.year} ${metadata.session} Paper ${metadata.paperNumber} (${metadata.paperType})`);
                }
                else {
                    console.log(`⚠️  Skipping invalid filename format: ${filename}`);
                }
            }
            catch (error) {
                console.warn(`❌ Failed to parse PDF filename: ${filename}`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
        console.log(`📊 Session summary: Found ${pdfFilenames.size} PDF filenames, successfully parsed ${papers.length} papers`);
        return papers;
    }
    isValidPaperFilename(filename) {
        const pattern = /^\d{4}_[a-z]+\d{2}_(qp|ms)_\d+\.pdf$/i;
        return pattern.test(filename);
    }
    async fetchWithRetry(url) {
        if (this.config.useBrowserless) {
            try {
                return await this.browserlessClient.extractContentWithRetry(url, {
                    waitForTimeout: 3000,
                    rejectResourceTypes: ['image', 'font', 'stylesheet'],
                    gotoOptions: { waitUntil: 'domcontentloaded' },
                    bestAttempt: true,
                });
            }
            catch (error) {
                console.log(`🔄 Browserless requests failed, falling back to HTTP for: ${url}`);
                console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return await this.fetchWithHttp(url);
            }
        }
        return await this.fetchWithHttp(url);
    }
    async fetchWithHttp(url) {
        let lastError;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                console.log(`📡 HTTP Fetch: ${url} (attempt ${attempt}/${this.config.maxRetries})`);
                const response = await this.axiosInstance.get(url);
                if (response.status === 200) {
                    return response.data;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (attempt < this.config.maxRetries) {
                    const backoffDelay = this.config.delayMs * Math.pow(2, attempt - 1);
                    console.log(`Attempt ${attempt} failed, retrying in ${backoffDelay}ms...`);
                    await this.delay(backoffDelay);
                }
            }
        }
        throw new Error(`Failed to fetch ${url} after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    static getUniqueSubjects(papers) {
        const subjects = new Set(papers.map(p => p.metadata.subject));
        return Array.from(subjects).sort();
    }
    static getUniqueYears(papers) {
        const years = new Set(papers.map(p => p.metadata.year));
        return Array.from(years).sort();
    }
    static filterPapers(papers, criteria) {
        return papers.filter(paper => {
            if (criteria.year && paper.metadata.year !== criteria.year)
                return false;
            if (criteria.session && paper.metadata.session !== criteria.session)
                return false;
            if (criteria.paperType && paper.metadata.paperType !== criteria.paperType)
                return false;
            if (criteria.subject && paper.metadata.subject !== criteria.subject)
                return false;
            return true;
        });
    }
}
//# sourceMappingURL=pastpapers-co-scraper.js.map