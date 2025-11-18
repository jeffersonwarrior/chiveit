/**
 * X.AI API Proxy Server
 *
 * This proxy server forwards requests from your Devvit app to the X.AI API.
 * Deploy this to a service that IS allowlisted by Reddit (like your own domain).
 *
 * Deploy options:
 * - Vercel, Netlify, Railway, Render, etc.
 * - Your own VPS/server
 * - Cloud Run, Lambda, etc.
 *
 * Usage:
 *   1. Deploy this file
 *   2. Set PROXY_URL environment variable in your Devvit app to point to this server
 *   3. Set XAI_API_KEY environment variable here (not in Devvit)
 */

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your Reddit Devvit app
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/grok/vision', async (req, res) => {
  try {
    const XAI_API_KEY = process.env.XAI_API_KEY;

    if (!XAI_API_KEY) {
      return res.status(500).json({
        error: 'XAI_API_KEY not configured on proxy server'
      });
    }

    const { model, temperature, response_format, messages } = req.body;

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'grok-4-fast',
        temperature: temperature || 0.2,
        response_format: response_format || { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'X.AI API request failed',
        details: errorText,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Proxy server error',
      details: error.message,
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`X.AI Proxy Server running on port ${PORT}`);
});
