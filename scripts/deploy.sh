#!/bin/bash

# Past Papers Scraper API Deployment Script
echo "🚀 Deploying Past Papers Scraper API to Cloudflare Workers..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Login check (will prompt if not logged in)
echo "🔐 Checking Cloudflare authentication..."
wrangler whoami || {
    echo "Please log in to Cloudflare:"
    wrangler login
}

# Set environment secrets
echo "🔧 Setting up environment secrets..."

echo "Setting DATABASE_URL..."
echo "${DATABASE_URL}" | wrangler secret put DATABASE_URL

echo "Setting R2 credentials..."
echo "${R2_ACCOUNT_ID}" | wrangler secret put R2_ACCOUNT_ID
echo "${R2_ACCESS_KEY_ID}" | wrangler secret put R2_ACCESS_KEY_ID
echo "${R2_SECRET_ACCESS_KEY}" | wrangler secret put R2_SECRET_ACCESS_KEY
echo "${R2_BUCKET_NAME}" | wrangler secret put R2_BUCKET_NAME
echo "${R2_PUBLIC_URL}" | wrangler secret put R2_PUBLIC_URL

echo "Setting OpenAI API key..."
echo "${OPENAI_API_KEY}" | wrangler secret put OPENAI_API_KEY


# Create R2 bucket
echo "🪣 Creating R2 bucket..."
wrangler r2 bucket create cambridge-igcse-past-papers-pdf || echo "R2 bucket might already exist"

# Deploy the worker
echo "🚀 Deploying worker..."
wrangler deploy

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your API is now available at:"
echo "   https://past-papers-scraper-api.your-subdomain.workers.dev"
echo ""
echo "📖 API Endpoints:"
echo "   POST /api/scrape - Scrape papers and return results"
echo "   GET /api/health - Health check"
echo ""
echo "📝 Example usage:"
echo '   curl -X POST https://your-worker.workers.dev/api/scrape \'
echo '     -H "Content-Type: application/json" \'
echo '     -d "{\"url\": \"https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580\"}"'