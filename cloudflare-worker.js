/**
 * Cloudflare Worker to proxy X.AI API requests
 *
 * Deploy this to Cloudflare Workers (100% free):
 * 1. Go to https://workers.cloudflare.com/
 * 2. Sign up (no credit card needed for free tier)
 * 3. Create new worker
 * 4. Paste this code
 * 5. Add environment variable: XAI_API_KEY = your_key
 * 6. Deploy
 * 7. Copy your worker URL (e.g., https://your-worker.your-subdomain.workers.dev)
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();

      // Forward to X.AI API
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.XAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      // Get response data
      const data = await response.text();

      // Return with CORS headers
      return new Response(data, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
