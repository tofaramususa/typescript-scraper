# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based scraper that extracts past papers from pastpapers.co and papacambridge.com, stores PDFs in Cloudflare R2, generates AI embeddings using OpenAI, and stores metadata in PostgreSQL. The project has two deployment targets: a Node.js CLI application and a Cloudflare Workers API.

## Key Commands

### Development
- `npm run dev <url>` - Run the CLI scraper with a target URL
- `npm run build` - Build TypeScript to JavaScript (dist/)
- `npm start` - Run the built CLI application

### Database Operations  
- `npm run db:generate` - Generate database schema with Drizzle Kit
- `npm run db:migrate` - Apply database migrations

### Cloudflare Workers
- `npm run worker:dev` - Start local development server for the Workers API
- `npm run worker:deploy` - Deploy the Workers API to Cloudflare
- `npm run worker:tail` - View live logs from deployed worker

### Quick Testing
- `npx tsx quick-test.ts` - Run quick tests
- `npx tsx src/index.ts <url>` - Direct TypeScript execution

## Architecture

### Dual Runtime Architecture
The codebase supports two runtime environments:
1. **Node.js CLI** (`src/index.ts`) - Full-featured scraper with local file operations
2. **Cloudflare Workers API** (`worker/index.ts`) - Serverless HTTP API with background processing

### Core Components

**Scrapers**
- `src/downloaders/papacambridge-scraper.ts` - Web scraping logic for discovering papers
- `src/worker/scraper-worker.ts` - Workers-compatible scraper implementation

**Storage Services**
- `src/storage/pdf-storage-service.ts` - Node.js PDF download and R2 upload
- `src/storage/database-service.ts` - Node.js PostgreSQL operations  
- `src/worker/r2-service-worker.ts` - Workers-compatible R2 storage
- `src/worker/database-service-worker.ts` - Workers-compatible database operations

**AI/Embeddings**
- `src/embeddings/generateEmbeddings.ts` - Node.js OpenAI integration
- `src/worker/embedding-service-worker.ts` - Workers-compatible embeddings

**Utilities**
- `src/utils/url-parser.ts` - Extract metadata from PDF URLs
- `src/utils/progress-tracker.ts` - Resume capability for interrupted scrapes
- `src/utils/simple-logger.ts` - Logging with metrics
- `src/utils/pdf-cache.ts` - In-memory PDF caching

### Database Schema
Located in `src/storage/schema/pastPapers.ts` using Drizzle ORM. Key fields include paper metadata (subject, year, session, paper type) and embeddings for AI search.

## Environment Configuration

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` - Cloudflare R2 credentials
- `OPENAI_API_KEY` - For generating embeddings

For Workers deployment, set secrets using:
```bash
wrangler secret put <SECRET_NAME>
```

## URL Parser Logic
The `url-parser.ts` extracts structured metadata from URLs like:
`https://pastpapers.co/cie/IGCSE/Mathematics-0580/2024-March/0580_m24_ms_42.pdf`

Extracts: exam board (cie), level (IGCSE), subject code (0580), year (2024), session (March), paper number (42), type (ms=mark scheme, qp=question paper).

## Code Conventions

**Type Safety**
- Prefer Zod schemas with inferred types over manual interfaces
- Use `import type` for type-only imports
- Avoid `any` - use proper typing

**File Organization**
- Classes: PascalCase
- Files/directories: kebab-case  
- Variables/functions: camelCase
- Constants/env vars: UPPERCASE

**Error Handling**
- Use comprehensive try-catch blocks
- Log errors with context using the logger utility
- Implement retry logic for network operations
- Graceful degradation for optional features like embeddings

**Performance**
- Use `Promise.all()` for parallel operations where possible
- Implement rate limiting (2s delay between requests)
- Cache frequently accessed data
- Sequential processing in Workers to avoid subrequest limits

## Workers-Specific Considerations

- Maximum 50 subrequests per invocation
- Process PDFs sequentially, not in parallel
- Use background processing with `ctx.waitUntil()`
- Implement proper CORS headers for API access
- R2 binding configured as `PAPERS_BUCKET`

## Testing & Development

The scraper includes comprehensive logging and progress tracking. Use the quick-test script for rapid iteration. The application supports resume capability - interrupted scrapes can continue from where they left off using the progress tracker.