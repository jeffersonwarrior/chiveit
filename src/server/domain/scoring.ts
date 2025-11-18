/**
 * Chive-cut scoring rubric (TypeScript port).
 */

export type RegionMetrics = {
  id: string;
  regionAverageThicknessMm?: number;
  regionThicknessStdDevMm?: number;
  regionCutQualityLabel?: 'clean' | 'mixed' | 'ragged' | 'no_chives';
};

export type BaseChiveMetrics = {
  averageThicknessMm: number | null;
  thicknessStdDevMm: number | null;
  cutQualityLabel: 'clean' | 'mixed' | 'ragged' | 'unknown' | string;
  rawNotes?: string;
  regions?: RegionMetrics[];
};

export type ScoredChiveMetrics = {
  thicknessConsistencyScore: number | null;
  cutQualityScore: number | null;
  overallScore: number | null;
  notes: string;
};

export function scoreChiveAnalysis(base: BaseChiveMetrics): ScoredChiveMetrics {
  const { averageThicknessMm, thicknessStdDevMm, cutQualityLabel, rawNotes, regions } = base;

  const regionList = Array.isArray(regions) ? regions : [];
  const regionsWithChives = regionList.filter(
    (r) => r && typeof r.regionCutQualityLabel === 'string' && r.regionCutQualityLabel !== 'no_chives'
  );

  // Anti-cheat 1: no chives anywhere -> no score.
  if (regionsWithChives.length === 0) {
    return {
      thicknessConsistencyScore: null,
      cutQualityScore: null,
      overallScore: null,
      notes:
        rawNotes && rawNotes.trim().length
          ? `${rawNotes} (No regions with chives detected; score not computed.)`
          : 'No regions with chives detected; score not computed.',
    };
  }

  // Anti-cheat 2: only one small region with chives -> treat as insufficient coverage.
  if (regionsWithChives.length === 1) {
    return {
      thicknessConsistencyScore: null,
      cutQualityScore: null,
      overallScore: null,
      notes: 'Insufficient chive coverage (only one region contains chives); score not computed.',
    };
  }

  // Anti-cheat 3: sanity-check global thickness range against typical chive size.
  if (typeof averageThicknessMm === 'number' && (averageThicknessMm <= 0 || averageThicknessMm > 5)) {
    return {
      thicknessConsistencyScore: null,
      cutQualityScore: null,
      overallScore: null,
      notes: 'Model reported an implausible average thickness for chives; score not computed.',
    };
  }

  // Thickness consistency: ideal is very low std dev (uniform cuts).
  // 0 mm std dev -> 1.0, 1.5 mm+ std dev -> ~0.
  let thicknessConsistencyScore: number | null = null;
  if (typeof thicknessStdDevMm === 'number' && Number.isFinite(thicknessStdDevMm)) {
    const normalized = Math.max(0, 1 - thicknessStdDevMm / 1.5);
    thicknessConsistencyScore = Number(normalized.toFixed(2));
  }

  // Cut quality: map label to score.
  let cutQualityScore: number | null = null;
  if (typeof cutQualityLabel === 'string') {
    const label = cutQualityLabel.toLowerCase();
    if (label === 'clean') cutQualityScore = 1.0;
    else if (label === 'mixed') cutQualityScore = 0.7;
    else if (label === 'ragged') cutQualityScore = 0.35;
    else cutQualityScore = 0.5; // unknown/other
  }

  // Combine into overall score. Weight consistency slightly higher than raw cut label.
  const consistency = thicknessConsistencyScore ?? 0.5;
  const quality = cutQualityScore ?? 0.5;
  const overallScore = Math.round((consistency * 0.6 + quality * 0.4) * 100);

  const notes =
    rawNotes && rawNotes.trim().length
      ? rawNotes
      : 'Scored based on thickness uniformity and cleanliness of cuts.';

  return {
    thicknessConsistencyScore,
    cutQualityScore,
    overallScore,
    notes,
  };
}
