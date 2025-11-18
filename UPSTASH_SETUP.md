# Upstash Redis Setup for ChiveIt v1.1

## 1. Create Free Upstash Redis Database

1. Go to https://upstash.com
2. Sign up (free tier: 10,000 commands/day)
3. Click "Create Database"
   - Name: `chiveit`
   - Type: `Regional`
   - Region: Choose closest to your location
   - TLS: Enabled
4. Click "Create"

## 2. Get Connection Details

After creation, you'll see:
- **Endpoint**: `redis-xxxxx.upstash.io:6379`
- **Password**: `AXXXxxxxxxxxx`

Click "Redis Connect" → Copy the connection string format:
```
redis://default:AXXXxxxxxxxxx@redis-xxxxx.upstash.io:6379
```

## 3. Configure Devvit App

Devvit's built-in Redis requires no configuration - it's automatically available via `redis` in server code.

**Important**: The Devvit app uses Devvit's built-in Redis (automatically provisioned per subreddit).
The worker uses Upstash Redis. They must share the same Redis instance.

### Option A: Use Upstash for Both (Recommended)

Add to `.env`:
```bash
REDIS_URL=redis://default:AXXXxxxxxxxxx@redis-xxxxx.upstash.io:6379
```

Then modify `src/server/index.ts` to connect to Upstash instead of Devvit's built-in Redis.

### Option B: Use Devvit Redis (requires hosted worker on same network)

This won't work for local worker - Devvit Redis is only accessible from within Reddit's network.

## 4. Configure Worker

Create `worker/.env`:
```bash
REDIS_URL=redis://default:AXXXxxxxxxxxx@redis-xxxxx.upstash.io:6379
XAI_API_KEY=your_xai_api_key_here
```

## 5. Start Worker

```bash
cd worker
npm install
npm start
```

You should see:
```
Connected to Redis
Worker started, polling queue...
```

## 6. Test End-to-End

1. Start Devvit dev server: `npm run dev`
2. Open Reddit playtest: https://www.reddit.com/r/chiveit_dev/?playtest=chiveit
3. Upload chive image
4. Watch worker logs for processing
5. See results appear in UI

## Troubleshooting

**Worker can't connect to Redis:**
- Check REDIS_URL format
- Verify Upstash database is active
- Test with redis-cli: `redis-cli -u "redis://..."`

**Jobs queued but not processing:**
- Check worker is running
- Check worker logs for errors
- Verify XAI_API_KEY is set

**Images not uploading:**
- Check Devvit has media upload permissions
- Verify file size < 10MB
