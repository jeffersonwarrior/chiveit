import axios from 'axios';
import { settings } from '@devvit/web/server';
import type { BaseChiveMetrics, RegionMetrics } from '../domain/scoring';

// Exported so we can resolve the key *before* certain middleware
// (e.g. multer) potentially interferes with Devvit's request context.
export async function getXaiApiKey(): Promise<string> {
  const fromEnv = process.env.XAI_API_KEY ?? process.env.XAIAPIKEY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  const fromSettingsPrimary = (await settings.get('XAIAPIKEY')) as string | undefined;
  if (fromSettingsPrimary && fromSettingsPrimary.length > 0) return fromSettingsPrimary;

  const fromSettingsAlt = (await settings.get('XAI_API_KEY')) as string | undefined;
  if (fromSettingsAlt && fromSettingsAlt.length > 0) return fromSettingsAlt;

  throw new Error('XAI API key is not configured');
}

export async function analyzeChiveImageWithGrok(
  buffer: Buffer,
  mimeType: string,
  XAI_API_KEY: string
): Promise<BaseChiveMetrics> {
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await axios.post(
    'https://api.x.ai/v1/chat/completions',
    {
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
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    }
  );

  const content = (response as any)?.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from Grok');
  }

  let jsonText: string;
  if (typeof content === 'string') {
    jsonText = content;
  } else if (Array.isArray(content)) {
    jsonText = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null) {
          return (part as any).text || (part as any).content || '';
        }
        return '';
      })
      .join('\n');
  } else if (typeof content === 'object' && content !== null) {
    jsonText = (content as any).text || (content as any).content || JSON.stringify(content);
  } else {
    throw new Error('Unsupported Grok content format');
  }

  const match = jsonText.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found in Grok response');
  }

  const parsed = JSON.parse(match[0]) as {
    averageThicknessMm?: number;
    thicknessStdDevMm?: number;
    cutQualityLabel?: string;
    rawNotes?: string;
    regions?: RegionMetrics[];
  };

  const base: BaseChiveMetrics = {
    averageThicknessMm: parsed.averageThicknessMm ?? null,
    thicknessStdDevMm: parsed.thicknessStdDevMm ?? null,
    cutQualityLabel: (parsed.cutQualityLabel as BaseChiveMetrics['cutQualityLabel']) ?? 'unknown',
    rawNotes: parsed.rawNotes || '',
    regions: Array.isArray(parsed.regions) ? parsed.regions : [],
  };

  return base;
}
