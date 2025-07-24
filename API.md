# Past Papers Scraper API

A Cloudflare Workers API for scraping and storing Cambridge IGCSE/AS/A Level past papers from PapaCambridge.

## Base URL

```
https://past-papers-scraper-api.your-subdomain.workers.dev
```

## Endpoints

### 1. Start Scraping Job

**POST** `/api/scrape`

Start a background job to scrape papers from a PapaCambridge URL.

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
  "jobId": "job_1672531200000_abc123def",
  "status": "queued",
  "message": "Scraping job queued successfully",
  "statusUrl": "/api/jobs/job_1672531200000_abc123def"
}
```

### 2. Check Job Status

**GET** `/api/jobs/{jobId}`

Check the status of a scraping job.

#### Response

```json
{
  "jobId": "job_1672531200000_abc123def",
  "status": "processing",
  "progress": {
    "currentStep": "downloading-pdfs",
    "processed": 150,
    "total": 500,
    "percentage": 30
  },
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:05:00.000Z"
}
```

#### Status Values

- `queued`: Job is waiting to be processed
- `processing`: Job is currently running
- `completed`: Job finished successfully
- `failed`: Job encountered an error

#### Completed Job Response

```json
{
  "jobId": "job_1672531200000_abc123def",
  "status": "completed",
  "progress": {
    "currentStep": "completed",
    "processed": 500,
    "total": 500,
    "percentage": 100
  },
  "result": {
    "totalPapers": 500,
    "successfulDownloads": 485,
    "failedDownloads": 15,
    "processingTime": 3600000
  },
  "createdAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T13:00:00.000Z"
}
```

### 3. Health Check

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

### 4. API Documentation

**GET** `/`

Returns this API documentation in JSON format.

## Example Usage

### curl

```bash
# Start a scraping job
curl -X POST https://your-worker.workers.dev/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580",
    "config": {
      "startYear": 2024,
      "endYear": 2020
    }
  }'

# Check job status
curl https://your-worker.workers.dev/api/jobs/job_1672531200000_abc123def
```

### JavaScript/Fetch

```javascript
// Start scraping job
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

const job = await response.json();
console.log('Job ID:', job.jobId);

// Poll for job completion
const checkStatus = async (jobId) => {
  const statusResponse = await fetch(`https://your-worker.workers.dev/api/jobs/${jobId}`);
  const status = await statusResponse.json();
  
  if (status.status === 'completed') {
    console.log('Job completed:', status.result);
  } else if (status.status === 'failed') {
    console.error('Job failed:', status.error);
  } else {
    console.log('Progress:', status.progress);
    // Check again in 30 seconds
    setTimeout(() => checkStatus(jobId), 30000);
  }
};

checkStatus(job.jobId);
```

### Python

```python
import requests
import time

# Start scraping job
response = requests.post('https://your-worker.workers.dev/api/scrape', json={
    'url': 'https://pastpapers.papacambridge.com/papers/caie/igcse-mathematics-0580',
    'config': {
        'startYear': 2024,
        'endYear': 2020,
        'generateEmbeddings': True
    }
})

job = response.json()
job_id = job['jobId']
print(f"Started job: {job_id}")

# Poll for completion
while True:
    status_response = requests.get(f'https://your-worker.workers.dev/api/jobs/{job_id}')
    status = status_response.json()
    
    if status['status'] == 'completed':
        print("Job completed:", status['result'])
        break
    elif status['status'] == 'failed':
        print("Job failed:", status.get('error'))
        break
    else:
        print(f"Progress: {status['progress']['percentage']}%")
        time.sleep(30)
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200`: Success
- `202`: Accepted (for async operations)
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
- 2-second delays between requests
- Maximum 3 retry attempts
- Concurrent job limit (handled by Cloudflare Queues)

## Data Storage

- **PDFs**: Stored in Cloudflare R2 with organized paths
- **Metadata**: Stored in PostgreSQL (Neon) with full-text search
- **Job Status**: Tracked in Cloudflare KV
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