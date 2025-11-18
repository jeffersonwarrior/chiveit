import { createClient } from 'redis';
import { config } from 'dotenv';

config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const XAI_API_KEY = process.env.XAI_API_KEY;
const POLL_INTERVAL = 2000; // 2 seconds

if (!XAI_API_KEY) {
  console.error('XAI_API_KEY environment variable required');
  process.exit(1);
}

const redis = createClient({ url: REDIS_URL });

redis.on('error', (err) => console.error('Redis error:', err));

await redis.connect();
console.log('Connected to Redis');

async function processJob(jobData) {
  const { jobId, imageUrl, mimeType } = jobData;

  console.log(`Processing job ${jobId}...`);

  try {
    // Fetch image from Reddit CDN
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Call X.AI API
    const apiResponse = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-4-fast',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an expert chef and knife skills instructor evaluating photos of cut chives. ' +
              'You must estimate chive thickness and cut quality and respond ONLY as JSON.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Examine this image of cut chives. ' +
                  '1) Divide the image into a 3×3 grid of regions, indexed row-major as r1c1, r1c2, r1c3, r2c1, r2c2, r2c3, r3c1, r3c2, r3c3. ' +
                  '2) For each region, detect the chive pieces that are visible in that region and estimate: ' +
                  '   regionAverageThicknessMm (average thickness of chive pieces in that region, in millimetres), ' +
                  '   regionThicknessStdDevMm (standard deviation of thickness in that region, in millimetres), and ' +
                  '   regionCutQualityLabel (one of "clean", "mixed", "ragged", or "no_chives"). Use "no_chives" whenever there are only a few stray pieces or effectively no dense cluster of chives in that region. ' +
                  '3) Using all regions together, compute overall image-level metrics: ' +
                  '   averageThicknessMm (overall average thickness across all regions that contain chives), ' +
                  '   thicknessStdDevMm (overall standard deviation of thickness), and ' +
                  '   cutQualityLabel (one of "clean", "mixed", or "ragged" for overall cut quality). ' +
                  '   When estimating millimetres, assume typical grocery-store chives and use your best judgement; do not leave fields blank just because the scale is approximate. If the entire image lacks any finely bunched group of chopped chives (for example, only a single stray chive is present), then set averageThicknessMm to 0, thicknessStdDevMm to 0, cutQualityLabel to "unknown", and explain in rawNotes that there are not enough chives to score. ' +
                  '4) Provide a short explanation of what you see about the cuts and consistency. ' +
                  'Respond ONLY as a single JSON object in valid JSON syntax (no markdown, no extra prose) with this exact shape: ' +
                  '{ "averageThicknessMm": number, "thicknessStdDevMm": number, "cutQualityLabel": "clean" | "mixed" | "ragged" | "unknown", "regions": [ { "id": "r1c1", "regionAverageThicknessMm": number, "regionThicknessStdDevMm": number, "regionCutQualityLabel": "clean" | "mixed" | "ragged" | "no_chives" } ], "rawNotes": string }. ' +
                  'The "regions" array MUST contain exactly 9 objects, one for each of: r1c1, r1c2, r1c3, r2c1, r2c2, r2c3, r3c1, r3c2, r3c3. ' +
                  'All numeric fields must be finite numbers (use approximate values if necessary, never null or undefined).',
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`X.AI API error: ${apiResponse.status} - ${errorText}`);
    }

    const data = await apiResponse.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned from X.AI API');
    }

    // Parse JSON from response
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('No JSON object found in response');
    }

    const result = JSON.parse(match[0]);

    // Store result in Redis
    await redis.set(
      `analysis:results:${jobId}`,
      JSON.stringify({
        jobId,
        status: 'completed',
        result,
        processedAt: Date.now(),
      }),
      { EX: 3600 } // Expire after 1 hour
    );

    // Update job status
    const jobKey = `analysis:jobs:${jobId}`;
    const job = JSON.parse(await redis.get(jobKey));
    job.status = 'completed';
    await redis.set(jobKey, JSON.stringify(job), { EX: 3600 });

    console.log(`✓ Job ${jobId} completed`);
  } catch (error) {
    console.error(`✗ Job ${jobId} failed:`, error.message);

    // Store error result
    await redis.set(
      `analysis:results:${jobId}`,
      JSON.stringify({
        jobId,
        status: 'failed',
        error: error.message,
        processedAt: Date.now(),
      }),
      { EX: 3600 }
    );

    // Update job status
    const jobKey = `analysis:jobs:${jobId}`;
    const job = JSON.parse(await redis.get(jobKey));
    job.status = 'failed';
    await redis.set(jobKey, JSON.stringify(job), { EX: 3600 });
  }
}

async function pollQueue() {
  while (true) {
    try {
      // BLPOP blocks until job available (5s timeout)
      const result = await redis.blPop('analysis:queue', 5);

      if (result) {
        const jobData = JSON.parse(result.element);
        await processJob(jobData);
      }
    } catch (error) {
      console.error('Queue poll error:', error);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }
}

console.log('Worker started, polling queue...');
pollQueue();
