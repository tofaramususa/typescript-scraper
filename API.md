# Past Papers Scraper API

A Cloudflare Workers API for scraping and storing Cambridge IGCSE/AS/A Level past papers from PapaCambridge.

## Base URL

```
https://past-papers-scraper-api.your-subdomain.workers.dev
```

## Endpoints

### 1. Scrape Papers

**POST** `/api/scrape`

Scrape papers from a PapaCambridge URL and return results directly.

#### Request Body

```json
{
  "url": "https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580",
  "config": {
    "startYear": 2024,
    "endYear": 2020,
    "generateEmbeddings": true
  }
}
```

#### Parameters

- `url` (required): PapaCambridge subject URL
- `config.startYear` (optional): Latest year to scrape (default: 2024)
- `config.endYear` (optional): Earliest year to scrape (default: 2015)  
- `config.generateEmbeddings` (optional): Generate OpenAI embeddings (default: true)

#### Response

```json
{
  "success": true,
  "totalPapers": 500,
  "successfulDownloads": 485,
  "failedDownloads": 15,
  "skippedDuplicates": 12,
  "embeddingsGenerated": 485,
  "databaseRecords": 485,
  "processingTime": 3600000
}
```

### 2. Health Check

**GET** `/api/health`

Check if the API is running.

#### Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

### 3. API Documentation

**GET** `/`

Returns this API documentation in JSON format.

## Example Usage

### curl

```bash
# Scrape papers
curl -X POST https://your-worker.workers.dev/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580",
    "config": {
      "startYear": 2024,
      "endYear": 2020
    }
  }'
```

### JavaScript/Fetch

```javascript
// Scrape papers
const response = await fetch('https://your-worker.workers.dev/api/scrape', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580',
    config: {
      startYear: 2024,
      endYear: 2020,
      generateEmbeddings: true
    }
  })
});

const result = await response.json();
if (result.success) {
  console.log('Scraping completed:', result);
  console.log(`Downloaded ${result.successfulDownloads} papers`);
} else {
  console.error('Scraping failed:', result.error);
}
```

### Python

```python
import requests

# Scrape papers
response = requests.post('https://your-worker.workers.dev/api/scrape', json={
    'url': 'https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580',
    'config': {
        'startYear': 2024,
        'endYear': 2020,
        'generateEmbeddings': True
    }
})

result = response.json()
if result['success']:
    print("Scraping completed:", result)
    print(f"Downloaded {result['successfulDownloads']} papers")
else:
    print("Scraping failed:", result.get('error'))
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `400`: Bad Request (validation errors)
- `404`: Not Found
- `500`: Internal Server Error

Error responses follow this format:

```json
{
  "error": "Validation error",
  "message": "Invalid URL format",
  "details": [...]
}
```

## Rate Limits

The API implements rate limiting to be respectful to PapaCambridge:
- 500ms delays between requests
- Maximum 3 retry attempts

## Data Storage

- **PDFs**: Stored in Cloudflare R2 with organized paths
- **Metadata**: Stored in PostgreSQL (Neon) with full-text search
- **Embeddings**: Generated using OpenAI API for semantic search

## Supported URLs

The API supports PapaCambridge URLs in this format:

```
https://pastpapers.papacambridge.com/papers/caie/{level}-{subject}-{code}
```

Examples:
- `https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580`
- `https://pastpapers.papacambridge.com/papers/caie/igcse-physics-0625`
- `https://pastpapers.papacambridge.com/papers/caie/as-mathematics-9709`