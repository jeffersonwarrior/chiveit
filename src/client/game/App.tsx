import { useState } from 'react';
import type { AnalyzeResponse, AnalyzeResultItem } from '../../shared/types/api';

type Preview = {
  index: number;
  url: string;
  name: string;
};

export const App = () => {
  const [files, setFiles] = useState<FileList | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<AnalyzeResultItem[] | null>(null);
  const [rawJson, setRawJson] = useState<string>('No analysis yet.');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    setFiles(fileList);
    setError(null);
    setResults(null);

    if (!fileList || fileList.length === 0) {
      setPreviews([]);
      return;
    }

    const nextPreviews: Preview[] = [];
    for (let index = 0; index < fileList.length; index += 1) {
      const file = fileList[index];
      const url = URL.createObjectURL(file);
      nextPreviews.push({ index, url, name: file.name });
    }
    setPreviews(nextPreviews);
  };

  const pollResults = async (jobIds: string[]): Promise<AnalyzeResultItem[]> => {
    const results: AnalyzeResultItem[] = [];
    const maxAttempts = 60; // 60 attempts * 2s = 2 minutes max

    for (const jobId of jobIds) {
      let attempts = 0;

      while (attempts < maxAttempts) {
        const response = await fetch(`/api/result/${jobId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          const result = data.result;
          results.push({
            filename: `Job ${jobId.slice(0, 8)}`,
            bunchIndex: results.length,
            averageThicknessMm: result.averageThicknessMm,
            thicknessStdDevMm: result.thicknessStdDevMm,
            cutQualityLabel: result.cutQualityLabel,
            rawNotes: result.rawNotes,
            regions: result.regions,
            thicknessConsistencyScore: result.thicknessConsistencyScore,
            cutQualityScore: result.cutQualityScore,
            overallScore: result.overallScore,
            notes: result.notes,
          });
          break;
        } else if (data.status === 'failed') {
          results.push({
            filename: `Job ${jobId.slice(0, 8)}`,
            bunchIndex: results.length,
            averageThicknessMm: null,
            thicknessStdDevMm: null,
            cutQualityLabel: 'unknown',
            overallScore: null,
            thicknessConsistencyScore: null,
            cutQualityScore: null,
            notes: `Analysis failed: ${data.error}`,
            rawNotes: '',
            regions: [],
          });
          break;
        }

        // Still processing, wait and retry
        setStatus(`Processing job ${results.length + 1}/${jobIds.length}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        results.push({
          filename: `Job ${jobId.slice(0, 8)}`,
          bunchIndex: results.length,
          averageThicknessMm: null,
          thicknessStdDevMm: null,
          cutQualityLabel: 'unknown',
          overallScore: null,
          thicknessConsistencyScore: null,
          cutQualityScore: null,
          notes: 'Analysis timed out',
          rawNotes: '',
          regions: [],
        });
      }
    }

    return results;
  };

  const handleAnalyze = async () => {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      formData.append('images', file);
    }

    setLoading(true);
    setStatus('Uploading images...');
    setError(null);
    setResults(null);

    try {
      // Submit jobs to queue
      const response = await fetch('/api/analyze-async', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data: { jobs: string[] } = await response.json();
      setStatus('Images queued, waiting for processing...');
      setRawJson(JSON.stringify({ queuedJobs: data.jobs }, null, 2));

      // Poll for results
      const results = await pollResults(data.jobs);

      setStatus(`Analyzed ${results.length} image(s).`);
      setResults(results);
      setRawJson(JSON.stringify({ analyzedCount: results.length, results }, null, 2));
    } catch (err) {
      const e = err as Error;
      setError(e.message);
      setStatus('Analysis failed.');
      setRawJson(e.message);
    } finally {
      setLoading(false);
    }
  };

  const scoreTag = (score: number | null | undefined) => {
    if (score == null) return null;
    const s = Math.round(score);
    if (s >= 95) return <span className="ml-1 rounded-full bg-green-500/30 px-2 py-0.5 text-xs uppercase tracking-wide text-green-100">Perfect!</span>;
    if (s >= 90) return <span className="ml-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-green-100">Great!</span>;
    if (s >= 85) return <span className="ml-1 rounded-full bg-green-500/18 px-2 py-0.5 text-xs uppercase tracking-wide text-green-100">Very good</span>;
    if (s >= 80) return <span className="ml-1 rounded-full bg-green-500/18 px-2 py-0.5 text-xs uppercase tracking-wide text-green-100">Good</span>;
    if (s >= 75) return <span className="ml-1 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-yellow-200">Fair</span>;
    return <span className="ml-1 rounded-full bg-red-400/20 px-2 py-0.5 text-xs uppercase tracking-wide text-red-200">Poor</span>;
  };

  const renderRegionGrid = (item: AnalyzeResultItem) => {
    if (!previews.length || !item.regions || item.regions.length === 0) return null;

    const preview = previews.find((p) => p.index === item.bunchIndex);
    if (!preview) return null;

    const regionIds = ['r1c1', 'r1c2', 'r1c3', 'r2c1', 'r2c2', 'r2c3', 'r3c1', 'r3c2', 'r3c3'];

    return (
      <div className="mt-1">
        <div className="mb-1 text-xs text-gray-400">3×3 grid analysis (per region):</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {regionIds.map((id) => {
            const r = item.regions?.find((region) => region.id === id);
            const avg =
              typeof r?.regionAverageThicknessMm === 'number'
                ? `${r.regionAverageThicknessMm.toFixed(1)} mm`
                : 'n/a';
            const sd =
              typeof r?.regionThicknessStdDevMm === 'number'
                ? `${r.regionThicknessStdDevMm.toFixed(2)} mm`
                : 'n/a';
            const label = r?.regionCutQualityLabel ?? 'no_chives';

            const row = parseInt(id.charAt(1), 10) - 1;
            const col = parseInt(id.charAt(3), 10) - 1;
            const posX = col === 0 ? '0%' : col === 1 ? '50%' : '100%';
            const posY = row === 0 ? '0%' : row === 1 ? '50%' : '100%';

            return (
              <div key={id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950 p-1.5">
                <div
                  className="h-16 w-16 rounded bg-cover bg-no-repeat"
                  style={{
                    backgroundImage: `url(${preview.url})`,
                    backgroundPosition: `${posX} ${posY}`,
                    backgroundSize: '300% 300%',
                  }}
                />
                <div className="space-y-0.5">
                  <div className="font-semibold">{id} · {label}</div>
                  <div className="text-gray-400">avg {avg}</div>
                  <div className="text-gray-400">σ {sd}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderResultCard = (item: AnalyzeResultItem) => {
    const thickness =
      item.averageThicknessMm != null ? `${item.averageThicknessMm.toFixed(1)} mm` : 'n/a';
    const consistencyPct =
      item.thicknessConsistencyScore != null
        ? `${Math.round(item.thicknessConsistencyScore * 100)}%`
        : 'n/a';
    const cutQualityPct =
      item.cutQualityScore != null ? `${Math.round(item.cutQualityScore * 100)}%` : 'n/a';
    const overall = item.overallScore != null ? `${Math.round(item.overallScore)}/100` : 'n/a';

    const preview = previews.find((p) => p.index === item.bunchIndex);
    const modelNotes = item.rawNotes && item.rawNotes.trim().length ? item.rawNotes : null;

    return (
      <div key={`${item.filename}-${item.bunchIndex}`} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
        {preview ? (
          <div className="mb-2">
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-52 w-full rounded-md object-cover"
            />
          </div>
        ) : null}
        <div className="mb-1 flex items-center justify-between">
          <div className="font-semibold">{item.filename || `Image ${item.bunchIndex}`}</div>
          <div className="text-sm font-bold">
            {overall}
            {scoreTag(item.overallScore ?? null)}
          </div>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Avg thickness</span>
            <span className="font-mono">{thickness}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Thickness consistency</span>
            <span className="font-mono">{consistencyPct}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Cut quality</span>
            <span className="font-mono">{cutQualityPct}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Quality label</span>
            <span className="font-mono">{item.cutQualityLabel || 'n/a'}</span>
          </div>
        </div>
        <div className="mt-2 space-y-1 text-xs text-gray-300">
          <div>
            <strong>Why this score:</strong>
          </div>
          <div>
            Overall score balances thickness consistency ({consistencyPct}) and cut quality ({cutQualityPct}).
          </div>
          {renderRegionGrid(item)}
          {modelNotes ? <div>Model notes: {modelNotes}</div> : null}
          <div>{item.notes}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-50">
      <div className="mx-auto max-w-4xl rounded-xl bg-slate-900/80 p-4 shadow-lg shadow-black/40">
        <h1 className="text-xl font-bold">Chive Cut Analyzer</h1>
        <p className="mt-1 text-sm text-slate-300">
          Upload one or more images of cut chives. The server will send them to an image analysis model
          to estimate chive thickness and cut quality, then score each bunch from 0–100.
        </p>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-emerald-950 hover:file:bg-emerald-400"
          />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!files || files.length === 0 || loading}
            className="inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {loading ? 'Analyzing…' : 'Analyze chives'}
          </button>
        </div>

        {status ? <p className="mt-2 text-sm text-slate-300">{status}</p> : null}
        {error ? <p className="mt-1 text-sm text-red-400">{error}</p> : null}

        <div className="mt-4">
          <h2 className="text-lg font-semibold">Scores</h2>
          {results && results.length > 0 ? (
            <div className="mt-2 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {results.map((item) => renderResultCard(item))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No analysis yet.</p>
          )}
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-200">Raw API response</h3>
          <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[11px] leading-snug text-slate-100">
            {rawJson}
          </pre>
        </div>
      </div>
    </div>
  );
};
