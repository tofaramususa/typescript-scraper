import axios from 'axios';
export class BrowserlessClient {
    config;
    httpClient;
    lastRequestTime = 0;
    requestCount = 0;
    constructor(config = {}) {
        this.config = {
            apiKey: process.env.BROWSERLESS_API_KEY || '',
            baseUrl: 'https://production-sfo.browserless.io',
            timeout: 45000,
            useResidentialProxy: true,
            maxRetries: 3,
            rateLimitDelay: 5000,
            useContentApiOnly: true,
            ...config,
        };
        if (!this.config.apiKey) {
            throw new Error('Browserless API key is required');
        }
        this.httpClient = axios.create({
            baseURL: this.config.baseUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
            },
        });
    }
    async getContent(options) {
        const { url, ...requestOptions } = options;
        await this.enforceRateLimit();
        console.log(`🌐 Browserless Content API: ${url}`);
        try {
            const payload = {
                url,
                rejectResourceTypes: ['image', 'font', 'stylesheet', 'media'],
                gotoOptions: {
                    waitUntil: 'domcontentloaded',
                    timeout: 40000
                },
                bestAttempt: true,
                waitForTimeout: 8000,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                setJavaScriptEnabled: true,
                ...requestOptions,
            };
            const endpoint = `/content?token=${this.config.apiKey}`;
            console.log(`📡 REST API Call: POST ${this.config.baseUrl}${endpoint}`);
            console.log(`📋 Payload (simplified):`, {
                url: payload.url,
                waitForTimeout: payload.waitForTimeout,
                gotoOptions: payload.gotoOptions,
                userAgent: payload.userAgent.substring(0, 50) + '...'
            });
            const response = await this.httpClient.post(endpoint, payload);
            if (response.status === 200 && response.data) {
                console.log(`✅ Content extracted: ${response.data.length} characters`);
                return response.data;
            }
            throw new Error(`Invalid response: ${response.status}`);
        }
        catch (error) {
            console.error(`❌ Content API failed for ${url}:`, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async getUnblockedContent(options) {
        const { url, ...requestOptions } = options;
        console.log(`🔓 Browserless Unblock API: ${url}`);
        try {
            const payload = {
                url,
                content: true,
                screenshot: false,
                cookies: false,
                browserWSEndpoint: false,
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1366, height: 768 },
                ...requestOptions,
            };
            const proxyParam = this.config.useResidentialProxy ? '&proxy=residential' : '';
            const endpoint = `/unblock?token=${this.config.apiKey}${proxyParam}`;
            console.log(`📡 REST API Call: POST ${this.config.baseUrl}${endpoint}`);
            console.log(`📋 Payload:`, JSON.stringify(payload, null, 2));
            console.log(`🏠 Using residential proxy: ${this.config.useResidentialProxy}`);
            const response = await this.httpClient.post(endpoint, payload);
            if (response.status === 200 && response.data) {
                console.log(`✅ Unblocked content extracted: ${response.data.length} characters`);
                return response.data;
            }
            throw new Error(`Invalid response: ${response.status}`);
        }
        catch (error) {
            console.error(`❌ Unblock API failed for ${url}:`, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    async extractContent(url, options = {}) {
        console.log(`🎯 Extracting content (Content API only): ${url}`);
        if (!this.config.useContentApiOnly) {
            console.log(`⚠️  Note: Unblock API disabled due to 400 errors. Using Content API only.`);
        }
        const contentOptions = {
            url,
            waitForTimeout: 10000,
            bestAttempt: true,
            gotoOptions: {
                waitUntil: 'domcontentloaded',
                timeout: 45000
            },
            rejectResourceTypes: ['image', 'font', 'stylesheet', 'media'],
            ...options,
        };
        return await this.getContent(contentOptions);
    }
    async extractContentWithRetry(url, options = {}) {
        let lastError;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                console.log(`🌐 Browserless attempt ${attempt}/${this.config.maxRetries}: ${url}`);
                const content = await this.extractContent(url, options);
                if (content.length < 300) {
                    throw new Error(`Content too short (${content.length} chars), might be error page`);
                }
                if (content.includes('403 Forbidden') || content.includes('Server Error')) {
                    throw new Error(`Server rejected request (403/Error page detected)`);
                }
                if (content.includes('blocked') || content.includes('Bot detected')) {
                    throw new Error(`Bot detection triggered`);
                }
                console.log(`✅ Successfully extracted ${content.length} chars on attempt ${attempt}`);
                return content;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                console.log(`❌ Attempt ${attempt} failed: ${lastError.message}`);
                if (attempt < this.config.maxRetries) {
                    const baseDelay = Math.min(attempt * 3000, 15000);
                    const jitter = Math.random() * 2000;
                    const delay = baseDelay + jitter;
                    console.log(`⏳ Enhanced backoff: Waiting ${Math.round(delay)}ms before retry...`);
                    await this.delay(delay);
                    console.log(`🛡️  Additional rate limiting between retries...`);
                    await this.delay(this.config.rateLimitDelay);
                }
            }
        }
        throw new Error(`Failed to extract content after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }
    async downloadFile(url) {
        console.log(`📥 Downloading file via Browserless: ${url}`);
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: this.config.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            if (response.status === 200) {
                const buffer = Buffer.from(response.data);
                console.log(`✅ File downloaded: ${Math.round(buffer.length / 1024)}KB`);
                return buffer;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        catch (error) {
            console.error(`❌ File download failed: ${url}`, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.config.rateLimitDelay) {
            const waitTime = this.config.rateLimitDelay - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: Waiting ${waitTime}ms before next request...`);
            await this.delay(waitTime);
        }
        this.lastRequestTime = Date.now();
        this.requestCount++;
        console.log(`📊 Browserless request #${this.requestCount}`);
    }
    async testConnection() {
        console.log(`🔍 Testing Browserless REST API connection...`);
        console.log(`📡 Base URL: ${this.config.baseUrl}`);
        console.log(`🔑 API Key: ${this.config.apiKey.slice(0, 8)}...`);
        console.log(`🏠 Residential Proxy: ${this.config.useResidentialProxy}`);
        try {
            const testUrl = 'https://httpbin.org/html';
            console.log(`🧪 Testing with: ${testUrl}`);
            const content = await this.extractContent(testUrl);
            console.log(`✅ Connection test successful! Extracted ${content.length} characters`);
        }
        catch (error) {
            console.error(`❌ Connection test failed:`, error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    getConfig() {
        const { apiKey, ...config } = this.config;
        return config;
    }
    getRateLimitStats() {
        return {
            requestCount: this.requestCount,
            lastRequestTime: this.lastRequestTime,
            rateLimitDelay: this.config.rateLimitDelay,
            timeSinceLastRequest: Date.now() - this.lastRequestTime,
        };
    }
}
export function createBrowserlessClient(config) {
    return new BrowserlessClient(config);
}
//# sourceMappingURL=browserless-client.js.map