# Past Papers Scraper

A TypeScript-based scraper for extracting past papers from pastpapers.co, storing them in Cloudflare R2, and generating embeddings with OpenAI.

## Features

- 🔍 **Intelligent Scraping**: Automatically discovers directory structures and PDF links
- 📁 **R2 Storage**: Uploads PDFs to Cloudflare R2 with organized naming
- 🧠 **AI Embeddings**: Generates embeddings using OpenAI's text-embedding-3-small
- 🗄️ **PostgreSQL Storage**: Stores metadata and embeddings in a robust database
- 🚀 **Batch Processing**: Handles large datasets efficiently with concurrency control
- 🔄 **Retry Logic**: Robust error handling and retry mechanisms

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy the example environment file and fill in your credentials:
```bash
cp .env.example .env
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`: Cloudflare R2 credentials
- `OPENAI_API_KEY`: OpenAI API key for embeddings

### 3. Database Setup
```bash
npm run db:generate
npm run db:migrate
```

### 4. Run the Scraper
```bash
npm run dev "https://pastpapers.co/cie/?dir=IGCSE/Mathematics-0580"
```

## How It Works

### Directory Discovery
The scraper automatically discovers available directories from the base URL:
- `2024-March`, `2024-May-June`, `2024-Oct-Nov`
- `2023-March`, `2023-May-June`, `2023-Oct-Nov`
- `2017`, `2016`, `2015`, `2014` (year-only directories)

### PDF Identification
Multiple strategies to find PDF links:
1. Direct PDF links (`href$=".pdf"`)
2. Pattern matching for paper filenames
3. Text analysis for paper-related content
4. Embedded link extraction

### Metadata Extraction
From URLs like `https://pastpapers.co/cie/IGCSE/Mathematics-0580/2024-March/0580_m24_ms_42.pdf`:
- **Subject**: Mathematics (from path)
- **Subject Code**: 0580
- **Exam Board**: Cambridge (cie)
- **Level**: IGCSE
- **Year**: 2024
- **Session**: March
- **Paper Number**: 42
- **Paper Type**: ms (mark scheme) or qp (question paper)

### Storage Organization
PDFs are stored in R2 with organized paths:
```
past-papers/cambridge/igcse/0580/2024/March/42_ms.pdf
```

## Configuration Options

You can customize the scraper behavior:

```typescript
const app = new PastPapersScraperApp({
  startYear: 2024,        // Latest year to scrape
  endYear: 2020,          // Earliest year to scrape
  skipExistingPdfs: true, // Skip already downloaded PDFs
  generateEmbeddings: true, // Generate AI embeddings
  concurrency: 5,         // Concurrent download limit
});
```

## Testing

For quick testing:
```bash
npx tsx quick-test.ts
```

## Architecture

- **URL Parser** (`src/utils/url-parser.ts`): Extracts metadata from PDF URLs
- **Scraper** (`src/downloaders/pastpapers-co-scraper.ts`): Web scraping logic
- **Storage Service** (`src/storage/pdf-storage-service.ts`): PDF download and R2 upload
- **Embeddings** (`src/embeddings/generateEmbeddings.ts`): OpenAI integration
- **Database** (`src/storage/database-service.ts`): PostgreSQL operations
- **Orchestrator** (`src/index.ts`): Main application logic

## Output Example

```
🚀 Starting Past Papers Scraper
📚 Target URL: https://pastpapers.co/cie/?dir=IGCSE/Mathematics-0580
📅 Year range: 2014 - 2024

🔍 Discovering available directories: https://pastpapers.co/cie/IGCSE/Mathematics-0580/
📂 Found 24 directories to scrape

📂 Scraping directory: https://pastpapers.co/cie/IGCSE/Mathematics-0580/2024-March/
📄 Found direct PDF link: 0580_m24_qp_11.pdf
📄 Found direct PDF link: 0580_m24_ms_11.pdf
✅ Successfully parsed: Mathematics 2024 March Paper 11 (qp)
✅ Successfully parsed: Mathematics 2024 March Paper 11 (ms)
✅ Directory complete: Found 8 papers

💾 Downloading and storing PDFs...
📦 Progress: 8/120 (7%)

🧠 Generating embeddings...
🧠 Embedding progress: 8/120 (7%)

🗄️ Storing paper information in database...

✅ Scraping completed successfully!
⏱️ Total time: 45 seconds
📋 Papers processed: 120
💾 PDFs stored: 115
🧠 Embeddings generated: 112
🗄️ Database records: 115
```

## Error Handling

The scraper includes comprehensive error handling:
- **Network timeouts**: Automatic retries with exponential backoff
- **Rate limiting**: Delays between requests to respect server limits
- **Invalid URLs**: Validation and graceful skipping
- **Parsing errors**: Detailed logging for debugging
- **Storage failures**: Cleanup of partial uploads

## Performance

- **Concurrent downloads**: Configurable concurrency (default: 5)
- **Batch processing**: Efficient handling of large datasets
- **Memory management**: Streaming for large files
- **Resume capability**: Skip already processed papers