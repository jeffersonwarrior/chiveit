import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/', async (req, res) => {
  try {
    const apiKey = process.env.XAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'XAI_API_KEY not configured' });
    }

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.text();

    res.status(response.status)
      .header('Content-Type', 'application/json')
      .send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`X.AI Proxy running on port ${PORT}`);
});
