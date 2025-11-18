export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};

export type RegionMetrics = {
  id: string;
  regionAverageThicknessMm?: number;
  regionThicknessStdDevMm?: number;
  regionCutQualityLabel?: 'clean' | 'mixed' | 'ragged' | 'no_chives';
};

export type AnalyzeResultItem = {
  filename: string;
  bunchIndex: number;
  averageThicknessMm: number | null;
  thicknessStdDevMm: number | null;
  cutQualityLabel: string;
  overallScore: number | null;
  thicknessConsistencyScore: number | null;
  cutQualityScore: number | null;
  notes: string;
  rawNotes?: string;
  regions?: RegionMetrics[];
};

export type AnalyzeResponse = {
  analyzedCount: number;
  results: AnalyzeResultItem[];
};
