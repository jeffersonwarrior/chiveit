# ChiveIt Worker v1.1

Standalone worker service that processes image analysis jobs from Redis queue.

## Setup

### Local Development

1. Install Redis:
```bash
brew install redis  # macOS
redis-server        # Start Redis
```

2. Configure environment:
```bash
cp .env.template .env
# Edit .env with your XAI_API_KEY
```

3. Install and run:
```bash
npm install
npm run dev
```

### Linux Deployment

Build and run with Docker:

```bash
docker build -t chiveit-worker .
docker run -e REDIS_URL=redis://your-redis:6379 -e XAI_API_KEY=your-key chiveit-worker
```

Or use Docker Compose:

```yaml
version: '3.8'
services:
  worker:
    build: .
    environment:
      REDIS_URL: redis://redis:6379
      XAI_API_KEY: ${XAI_API_KEY}
    depends_on:
      - redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Architecture

- Polls `analysis:queue` in Redis
- Fetches images from Reddit CDN
- Calls X.AI API for analysis
- Stores results in `analysis:results:{jobId}`
- TTL: 1 hour for all keys
