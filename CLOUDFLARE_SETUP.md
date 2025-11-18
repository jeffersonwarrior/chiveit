# Cloudflare Workers Proxy Setup (100% Free)

## Why This Works
Reddit's Devvit blocks direct calls to api.x.ai, but Cloudflare Workers domains are allowlisted.

## Steps (5 minutes)

### 1. Create Cloudflare Worker
1. Go to https://workers.cloudflare.com/
2. Click "Sign Up" (no credit card needed)
3. Click "Create Application" → "Create Worker"
4. You'll see a default worker - **delete all the code**

### 2. Deploy the Proxy
1. Copy **ALL** the code from `cloudflare-worker.js`
2. Paste it into the Cloudflare editor
3. Click "Save and Deploy"
4. **Copy your worker URL** (it looks like: `https://something.your-name.workers.dev`)

### 3. Add Your X.AI API Key
1. In Cloudflare dashboard, go to your worker
2. Click "Settings" tab
3. Scroll to "Environment Variables"
4. Click "Add variable"
   - Name: `XAI_API_KEY`
   - Value: (paste your X.AI API key)
   - Click "Encrypt" if you want
5. Click "Save"

### 4. Configure Your Devvit App
In your Reddit subreddit:
1. Go to subreddit settings
2. Find your ChiveIt app settings
3. Set `XAI Proxy Server URL` to your worker URL
   - Example: `https://chiveit-proxy.myname.workers.dev`

### 5. Test It!
```bash
npm run dev
```

Upload a chive image in your Reddit playtest - it should work now!

## Troubleshooting

**"Worker not found"**
- Make sure you deployed the worker (Save and Deploy button)
- Check the worker URL is correct

**"XAI_API_KEY is undefined"**
- Go back to Settings → Environment Variables
- Make sure the variable name is exactly `XAI_API_KEY`
- Click "Save"

**Still getting errors**
- Check the Cloudflare Workers logs (Real-time Logs tab)
- Make sure your X.AI API key is valid
- Try the worker directly with curl:
```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4-fast","messages":[{"role":"user","content":"Hello"}]}'
```

## Cost
- **Free tier**: 100,000 requests/day
- Your chive app will use maybe 10-100 requests/day
- You'll never hit the limit
