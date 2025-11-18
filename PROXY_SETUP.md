# X.AI Proxy Setup Guide

## Problem

Reddit's Devvit platform uses URL allowlisting for external API calls. The `api.x.ai` domain is not on their allowlist, causing connection failures.

## Solution Options

### Option 1: Try Direct Connection First (Simplest)

The code now uses native `fetch` instead of `axios`. Try running `npm run dev` again - this might work if Reddit has allowlisted x.ai.

### Option 2: Deploy Your Own Proxy Server (Recommended)

Deploy the included proxy server to a service that IS allowlisted by Reddit.

#### Step 1: Deploy the Proxy

**Quick Deploy Options:**

**A. Deploy to Vercel (Easiest)**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy the proxy
cd /path/to/chiveit
vercel proxy-server.js

# Set environment variable on Vercel
vercel env add XAI_API_KEY
# Paste your X.AI API key when prompted
```

**B. Deploy to Railway**
1. Sign up at railway.app
2. Create new project
3. Upload `proxy-server.js` and `proxy-package.json`
4. Set environment variable: `XAI_API_KEY=your_key_here`
5. Deploy

**C. Deploy to Render**
1. Sign up at render.com
2. New Web Service
3. Connect your repo or upload files
4. Set environment variable: `XAI_API_KEY=your_key_here`
5. Deploy

#### Step 2: Configure Your Devvit App

Once deployed, you'll get a URL like: `https://your-app.vercel.app`

**Option A: Using Environment Variable (Local Testing)**
```bash
# Create .env file
echo "XAI_PROXY_URL=https://your-app.vercel.app/api/grok/vision" > .env
```

**Option B: Using Devvit Settings (Production)**
1. Add to `devvit.json`:
```json
{
  "settings": {
    "subreddit": {
      "XAIAPIKEY": {
        "label": "XAI Grok API key",
        "type": "string"
      },
      "XAI_PROXY_URL": {
        "label": "XAI Proxy Server URL",
        "type": "string",
        "defaultValue": ""
      }
    }
  }
}
```

2. Configure in your subreddit settings after installing the app

#### Step 3: Test

```bash
npm run dev
```

Upload a chive image in your Reddit playtest environment!

### Option 3: Request X.AI Allowlist from Reddit

Contact Reddit via r/Devvit to request that `api.x.ai` be added to their allowlist. This is a longer-term solution.

## Proxy Server Details

The proxy server:
- Receives requests from your Devvit app
- Forwards them to X.AI API with proper authentication
- Returns the response back to Devvit
- Keeps your API key secure (stored on proxy, not in Devvit)

**Security Notes:**
- Add rate limiting if making this public
- Consider adding authentication between Devvit and proxy
- Monitor costs on both X.AI and hosting platform

## Troubleshooting

### "XAI_API_KEY not configured on proxy server"
- Set the `XAI_API_KEY` environment variable on your proxy hosting platform

### "Connection refused" or "ENOTFOUND"
- Verify your `XAI_PROXY_URL` is correct
- Check that your proxy server is running
- Ensure the proxy URL is allowlisted by Reddit (most major hosting platforms are)

### Still getting "EAI" errors
- The proxy URL might not be allowlisted
- Try a different hosting platform (Vercel, Cloudflare Workers, etc.)
- Check Reddit's r/Devvit for current allowlist status

## Testing the Proxy Locally

```bash
# Install dependencies
npm install --prefix . -f express cors

# Set your API key
export XAI_API_KEY=your_key_here

# Run the proxy
node proxy-server.js

# In another terminal, test it
curl -X POST http://localhost:3000/api/grok/vision \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```
