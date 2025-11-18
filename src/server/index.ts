import express from 'express';
import type { NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import type { InitResponse, IncrementResponse, DecrementResponse, AnalyzeResponse } from '../shared/types/api';
import { redis, reddit, createServer, context, getServerPort, settings } from '@devvit/web/server';
import { createPost } from './core/post';
import { analyzeChiveImageWithGrok, getXaiApiKey } from './services/grokClient';
import { scoreChiveAnalysis } from './domain/scoring';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

router.get<{ postId: string }, InitResponse | { status: string; message: string }>(
  '/api/init',
  async (_req, res): Promise<void> => {
    const { postId } = context;

    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res.status(400).json({
        status: 'error',
        message: 'postId is required but missing from context',
      });
      return;
    }

    try {
      const [count, username] = await Promise.all([
        redis.get('count'),
        reddit.getCurrentUsername(),
      ]);

      res.json({
        type: 'init',
        postId: postId,
        count: count ? parseInt(count) : 0,
        username: username ?? 'anonymous',
      });
    } catch (error) {
      console.error(`API Init Error for post ${postId}:`, error);
      let errorMessage = 'Unknown error during initialization';
      if (error instanceof Error) {
        errorMessage = `Initialization failed: ${error.message}`;
      }
      res.status(400).json({ status: 'error', message: errorMessage });
    }
  }
);

router.post<{ postId: string }, IncrementResponse | { status: string; message: string }, unknown>(
  '/api/increment',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', 1),
      postId,
      type: 'increment',
    });
  }
);

router.post<{ postId: string }, DecrementResponse | { status: string; message: string }, unknown>(
  '/api/decrement',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', -1),
      postId,
      type: 'decrement',
    });
  }
);

// Multer in-memory storage for image uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// New async queue endpoint
router.post(
  '/api/analyze-async',
  upload.array('images'),
  async (req, res): Promise<void> => {
    try {
      const files = (req as any).files || [];
      const jobs: string[] = [];

      for (const [index, file] of files.entries()) {
        const jobId = crypto.randomUUID();

        // Upload image to Reddit media (so worker can fetch it)
        const mediaUrl = await reddit.uploadMedia({
          data: file.buffer,
          type: file.mimetype as 'image/png' | 'image/jpeg',
        }, context);

        // Queue job in Redis
        const job = {
          jobId,
          imageUrl: mediaUrl,
          mimeType: file.mimetype,
          submittedBy: context.userId || 'anonymous',
          subreddit: context.subredditName || 'unknown',
          postId: context.postId || '',
          createdAt: Date.now(),
          status: 'pending',
        };

        await redis.set(`analysis:jobs:${jobId}`, JSON.stringify(job), { expiration: new Date(Date.now() + 3600000) });
        await redis.rPush('analysis:queue', JSON.stringify(job));

        jobs.push(jobId);
      }

      res.json({ jobs });
    } catch (err) {
      const error = err as Error;
      console.error('Error queuing analysis:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get job result
router.get('/api/result/:jobId', async (req, res): Promise<void> => {
  try {
    const { jobId } = req.params;
    const resultData = await redis.get(`analysis:results:${jobId}`);

    if (!resultData) {
      // Check if job exists
      const jobData = await redis.get(`analysis:jobs:${jobId}`);
      if (!jobData) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const job = JSON.parse(jobData);
      res.json({ status: job.status });
      return;
    }

    const result = JSON.parse(resultData);

    if (result.status === 'failed') {
      res.json({ status: 'failed', error: result.error });
      return;
    }

    const scored = scoreChiveAnalysis(result.result);

    res.json({
      status: 'completed',
      result: {
        ...result.result,
        ...scored,
      },
    });
  } catch (err) {
    const error = err as Error;
    console.error('Error fetching result:', error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy sync endpoint (keep for backward compat, but will be slow/timeout)
router.post(
  '/api/analyze',
  // First middleware: resolve XAI API key while Devvit request context is intact
  async (req, res, next: NextFunction): Promise<void> => {
    try {
      const key = await getXaiApiKey();
      (req as any).xaiApiKey = key;

      // Also resolve proxy URL while context is available
      let proxyUrl = process.env.XAI_PROXY_URL;
      if (!proxyUrl || proxyUrl.length === 0) {
        const fromSettings = (await settings.get('XAI_PROXY_URL')) as string | undefined;
        if (fromSettings && fromSettings.length > 0) {
          proxyUrl = fromSettings;
        }
      }
      (req as any).xaiProxyUrl = proxyUrl;

      next();
    } catch (err) {
      const error = err as Error;
      console.error('Error resolving XAI API key', error);
      res.status(500).json({ error: 'Analysis failed', details: error.message });
    }
  },
  // Second middleware: handle multipart upload
  upload.array('images'),
  // Final handler: perform analysis using the resolved key
  async (req, res): Promise<void> => {
    try {
      const files = (req as any).files || [];
      const xaiApiKey = (req as any).xaiApiKey as string | undefined;
      const xaiProxyUrl = (req as any).xaiProxyUrl as string | undefined;
      const results: AnalyzeResponse['results'] = [];

      if (!xaiApiKey) {
        throw new Error('XAI API key missing from request context');
      }

      for (const [index, file] of files.entries()) {
        try {
          const baseMetrics = await analyzeChiveImageWithGrok(file.buffer, file.mimetype, xaiApiKey, xaiProxyUrl);
          const scored = scoreChiveAnalysis(baseMetrics);

        results.push({
          filename: file.originalname,
          bunchIndex: index,
          averageThicknessMm: baseMetrics.averageThicknessMm,
          thicknessStdDevMm: baseMetrics.thicknessStdDevMm,
          cutQualityLabel: baseMetrics.cutQualityLabel,
          rawNotes: baseMetrics.rawNotes,
          regions: baseMetrics.regions,
          thicknessConsistencyScore: scored.thicknessConsistencyScore,
          cutQualityScore: scored.cutQualityScore,
          overallScore: scored.overallScore,
          notes: scored.notes,
        });
      } catch (err) {
        const error = err as Error;
        results.push({
          filename: file.originalname,
          bunchIndex: index,
          averageThicknessMm: null,
          thicknessStdDevMm: null,
          cutQualityLabel: 'unknown',
          overallScore: null,
          thicknessConsistencyScore: null,
          cutQualityScore: null,
          notes: `Analysis failed: ${error.message}`,
          rawNotes: '',
          regions: [],
        });
      }
    }

    const payload: AnalyzeResponse = {
      analyzedCount: Array.isArray(files) ? files.length : 0,
      results,
    };

    res.json(payload);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
