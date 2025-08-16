# 🚀 Deployment Guide

## Pre-deployment Setup

Before deploying, you need to set the following environment variables. Run these commands in your terminal:

### Required Environment Variables

```bash
# Database connection (Neon PostgreSQL)
export DATABASE_URL="your_neon_database_url_here"

# R2 Storage credentials  
export R2_ACCOUNT_ID="your_cloudflare_account_id"
export R2_ACCESS_KEY_ID="your_r2_access_key_id" 
export R2_SECRET_ACCESS_KEY="your_r2_secret_access_key"
export R2_BUCKET_NAME="cambridge-igcse-past-papers-pdf"
export R2_PUBLIC_URL="https://your-r2-custom-domain.com"

# OpenAI API for embeddings
export OPENAI_API_KEY="your_openai_api_key_here"
```

### Required Database Migration

Before first use, run this SQL command on your Neon database to add the embedding column:

```sql
-- Add embedding column with pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "past_papers" ADD COLUMN "embedding" vector(1536);
```

## Deployment Commands

```bash
# Deploy using the provided script
chmod +x scripts/deploy.sh
./scripts/deploy.sh

# OR deploy manually with wrangler
wrangler deploy
```

## Post-deployment Verification

1. Check health endpoint: `GET https://your-worker.workers.dev/api/health`
2. Test scraping: `POST https://your-worker.workers.dev/api/scrape`

## Notes

- The R2_PUBLIC_URL should be your custom R2 domain for serving PDFs
- Make sure your R2 bucket exists and has public read access configured
- The database should have the pgvector extension installed
- OpenAI API key needs access to text-embedding-3-small model