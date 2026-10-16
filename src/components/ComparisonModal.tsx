import React, { useState, useEffect } from 'react';
import { X, Layers, FileText, Image as ImageIcon, CheckCircle, RefreshCw, AlertCircle, History } from 'lucide-react';
import { MonitoredPage, PageSnapshot, DiffResult } from '../types/index.js';

interface ComparisonModalProps {
  page: MonitoredPage | null;
  isOpen: boolean;
  initialMode?: 'text' | 'visual' | 'side-by-side' | 'timeline';
  onClose: () => void;
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({ page, isOpen, initialMode = 'text', onClose }) => {
  const [snapshots, setSnapshots] = useState<PageSnapshot[]>([]);
  const [selectedV1, setSelectedV1] = useState<string>('');
  const [selectedV2, setSelectedV2] = useState<string>('');
  const [diffData, setDiffData] = useState<{
    baselineVersion: PageSnapshot;
    comparedVersion: PageSnapshot;
    diff: DiffResult;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'text' | 'visual' | 'side-by-side' | 'timeline'>(initialMode);

  // Load snapshots when modal opens
  useEffect(() => {
    if (page && isOpen) {
      if (initialMode) setViewMode(initialMode);
      loadSnapshots();
    }
  }, [page, isOpen, initialMode]);

  const loadSnapshots = async () => {
    if (!page) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/pages/${page.id}/snapshots`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch snapshots');

      const snaps: PageSnapshot[] = data.data || [];
      setSnapshots(snaps);

      if (snaps.length >= 2) {
        // Default: compare previous version with latest version
        setSelectedV1(snaps[1].id);
        setSelectedV2(snaps[0].id);
        fetchComparison(snaps[1].id, snaps[0].id);
      } else if (snaps.length === 1) {
        setSelectedV1(snaps[0].id);
        setSelectedV2(snaps[0].id);
        setDiffData(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchComparison = async (v1Id: string, v2Id: string) => {
    if (!page || !v1Id || !v2Id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/pages/${page.id}/compare?v1=${v1Id}&v2=${v2Id}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Comparison calculation failed');

      setDiffData(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !page) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div className="card max-w-5xl w-full p-6 border border-white/20 my-6 shadow-2xl bg-[#161619] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-mono font-bold text-[#F8F7F4] uppercase tracking-tight">
                SNAPSHOT DIFF & TIMELINE INSPECTOR
              </h2>
              <span className="text-xs text-white/50 font-mono tracking-wider">({page.name.toUpperCase()})</span>
            </div>
            <p className="text-[0.68rem] font-mono text-white/40 mt-0.5 uppercase tracking-wider">
              Deterministic Myers Text Diff · Pixel Delta Overlay · Chronological Audit
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/50 hover:text-white border border-white/10 hover:border-white/30 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Version selectors and View Mode */}
        <div className="py-3.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-white/50 uppercase text-[0.65rem] tracking-wider">BASELINE:</span>
              <select
                value={selectedV1}
                onChange={e => {
                  setSelectedV1(e.target.value);
                  if (selectedV2) fetchComparison(e.target.value, selectedV2);
                }}
                disabled={snapshots.length < 2}
                className="px-2.5 py-1 text-xs border border-white/15 bg-[#111113] text-[#F8F7F4] font-mono uppercase focus:outline-hidden"
              >
                {snapshots.map(s => (
                  <option key={s.id} value={s.id} className="bg-[#111113]">
                    V{s.versionNumber} ({new Date(s.checkedAt).toLocaleDateString()} {new Date(s.checkedAt).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>

            <span className="text-white/30 font-mono">→</span>

            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-white/50 uppercase text-[0.65rem] tracking-wider">COMPARED:</span>
              <select
                value={selectedV2}
                onChange={e => {
                  setSelectedV2(e.target.value);
                  if (selectedV1) fetchComparison(selectedV1, e.target.value);
                }}
                disabled={snapshots.length < 2}
                className="px-2.5 py-1 text-xs border border-white/15 bg-[#111113] text-[#F8F7F4] font-mono uppercase focus:outline-hidden"
              >
                {snapshots.map(s => (
                  <option key={s.id} value={s.id} className="bg-[#111113]">
                    V{s.versionNumber} ({new Date(s.checkedAt).toLocaleDateString()} {new Date(s.checkedAt).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* View mode toggle - Variation 1 Industrial Style */}
          <div className="flex items-center gap-1 p-0.5 bg-[#111113] border border-white/10 text-xs font-mono">
            <button
              type="button"
              onClick={() => setViewMode('text')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[0.65rem] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                viewMode === 'text' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>TEXT DIFF</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[0.65rem] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                viewMode === 'visual' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>PIXEL DIFF</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[0.65rem] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                viewMode === 'side-by-side' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>SIDE-BY-SIDE</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[0.65rem] uppercase tracking-wider font-bold transition-colors cursor-pointer ${
                viewMode === 'timeline' ? 'bg-white text-black' : 'text-white/50 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>TIMELINE ({snapshots.length})</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 py-4 space-y-4">
          {error && (
            <div className="p-3.5 bg-[#2a150c] border border-[#FF4D00] text-[#FF4D00] font-mono text-xs">
              [COMPARISON ERROR] {error}
            </div>
          )}

          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-white/50 gap-2.5 font-mono">
              <RefreshCw className="w-6 h-6 animate-spin text-[#FF4D00]" />
              <span className="text-xs tracking-wider uppercase">COMPUTING MYERS DIFF & PIXEL DELTA...</span>
            </div>
          )}

          {/* View Mode: Interactive Version Timeline */}
          {!loading && viewMode === 'timeline' && (
            <div className="py-2">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                <div>
                  <h3 className="text-xs font-mono font-bold text-[#F8F7F4] uppercase tracking-wider">
                    VERSION TIMELINE AUDIT ({snapshots.length} RECORDED VERSIONS)
                  </h3>
                  <p className="text-[0.65rem] font-mono text-white/40 mt-0.5 uppercase">
                    Chronological audit of captured snapshots, response codes, and verified content modifications.
                  </p>
                </div>
              </div>

              {snapshots.length === 0 ? (
                <div className="text-center py-12 text-xs font-mono text-white/40">
                  [EMPTY TIMELINE] No snapshots recorded yet. Run a check to capture the baseline.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-white/15">
                  {snapshots.map((snap) => (
                    <div key={snap.id} className="relative">
                      {/* Timeline node */}
                      <div className={`absolute -left-6 top-3 w-3 h-3 border-2 border-[#161619] shadow-sm ${
                        snap.versionNumber === 1
                          ? 'bg-white/50'
                          : snap.isMeaningfulChange
                          ? 'bg-[#00A3FF]'
                          : 'bg-[#00FF94]'
                      }`} />

                      <div className="card !p-4 bg-[#111113] border border-white/10 hover:border-white/30 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 font-mono">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-bold text-white">
                              V{snap.versionNumber}
                            </span>
                            <span className={`text-[0.6rem] font-bold px-2 py-0.5 border ${
                              snap.versionNumber === 1
                                ? 'bg-white/5 border-white/20 text-white/70'
                                : snap.isMeaningfulChange
                                ? 'bg-[#0d1e2e] border-[#00A3FF] text-[#00A3FF]'
                                : 'bg-[#0a2419] border-[#00FF94] text-[#00FF94]'
                            }`}>
                              {snap.versionNumber === 1 ? 'BASELINE SNAPSHOT' : snap.isMeaningfulChange ? 'DRIFT DETECTED' : 'OPERATIONAL OK'}
                            </span>
                            <span className="text-[0.65rem] text-white/40">
                              HASH #{snap.contentHash.slice(0, 8)}
                            </span>
                          </div>
                          <div className="text-[0.65rem] text-white/50">
                            {new Date(snap.checkedAt).toLocaleDateString()} {new Date(snap.checkedAt).toLocaleTimeString()}
                          </div>
                        </div>

                        <p className="text-xs text-white/80 font-mono mb-3">
                          {snap.changeSummary || 'Snapshot captured and verified.'}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-white/10 text-[0.65rem] font-mono text-white/50">
                          <div className="flex items-center gap-3">
                            <span>HTTP {snap.httpStatus}</span>
                            <span>{snap.responseTimeMs}MS</span>
                            {snap.extractedTitle && (
                              <span className="truncate max-w-xs text-white/70">TITLE: {snap.extractedTitle}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedV1(snap.id);
                                if (selectedV2 && selectedV2 !== snap.id) {
                                  fetchComparison(snap.id, selectedV2);
                                  setViewMode('text');
                                }
                              }}
                              className={`px-2.5 py-1 text-[0.62rem] uppercase tracking-wider font-bold border cursor-pointer ${
                                selectedV1 === snap.id
                                  ? 'bg-white text-black border-white'
                                  : 'bg-transparent text-white/70 border-white/20 hover:border-white'
                              }`}
                            >
                              {selectedV1 === snap.id ? 'BASELINE ✓' : 'SET BASELINE'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedV2(snap.id);
                                if (selectedV1 && selectedV1 !== snap.id) {
                                  fetchComparison(selectedV1, snap.id);
                                  setViewMode('text');
                                }
                              }}
                              className={`px-2.5 py-1 text-[0.62rem] uppercase tracking-wider font-bold border cursor-pointer ${
                                selectedV2 === snap.id
                                  ? 'bg-[#00A3FF] text-white border-[#00A3FF]'
                                  : 'bg-transparent text-white/70 border-white/20 hover:border-white'
                              }`}
                            >
                              {selectedV2 === snap.id ? 'COMPARED ✓' : 'SET COMPARED'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state when only 1 snapshot exists and viewing diff modes */}
          {!loading && viewMode !== 'timeline' && snapshots.length < 2 && (
            <div className="text-center py-14 px-4 card border-dashed border-white/20 bg-[#111113]">
              <Layers className="w-10 h-10 text-white/20 mx-auto mb-2" />
              <h3 className="text-sm font-mono uppercase font-bold text-white/80">BASELINE CAPTURED (V1)</h3>
              <p className="text-xs text-white/50 max-w-md mx-auto mt-1 font-mono">
                Only the initial baseline exists. When scheduled checks or manual checks detect verified content updates, subsequent snapshots will appear here for side-by-side Myers diffing.
              </p>
              {snapshots.length === 1 && (
                <div className="mt-4 p-3.5 max-w-xl mx-auto bg-[#161619] border border-white/10 text-left text-xs font-mono">
                  <div className="text-white/40 uppercase text-[0.62rem] mb-1">BASELINE EXTRACTED TEXT:</div>
                  <pre className="text-white/80 whitespace-pre-wrap max-h-40 overflow-y-auto text-[0.7rem]">
                    {snapshots[0].normalizedText.slice(0, 500)}...
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Comparison Output */}
          {!loading && diffData && (
            <div className="space-y-4">
              {/* Diff Stats Banner */}
              <div className="p-3.5 bg-[#111113] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div>
                  <span className="text-white/40 uppercase text-[0.65rem] tracking-wider mr-2">EVALUATION:</span>
                  <span className="text-[#F8F7F4] font-bold">{diffData.diff.summary}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#00FF94] font-bold">+{diffData.diff.textDiff.addedWords} WORDS</span>
                  <span className="text-[#FF4D00] font-bold">-{diffData.diff.textDiff.removedWords} WORDS</span>
                  <span className="text-white/80 font-bold">{diffData.diff.changePercentage}% DELTA</span>
                  {diffData.diff.visualDiff && (
                    <span className="text-[#00A3FF] font-bold">{diffData.diff.visualDiff.diffPercentage}% PIXEL DIFF</span>
                  )}
                </div>
              </div>

              {/* View Mode 1: Unified Text Diff */}
              {viewMode === 'text' && (
                <div className="border border-white/10 bg-[#111113] overflow-hidden font-mono text-xs">
                  <div className="bg-[#161619] px-4 py-2.5 border-b border-white/10 font-bold text-white/80 flex justify-between uppercase text-[0.65rem] tracking-wider">
                    <span>MYERS UNIFIED TEXT DIFF</span>
                    <span className="text-white/40">
                      V{diffData.baselineVersion.versionNumber} ({diffData.baselineVersion.contentHash.slice(0, 8)}) → V{diffData.comparedVersion.versionNumber} ({diffData.comparedVersion.contentHash.slice(0, 8)})
                    </span>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto p-2 divide-y divide-white/5 font-mono text-[0.72rem]">
                    {diffData.diff.textDiff.lines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`py-1 px-3 flex items-start gap-2.5 leading-relaxed ${
                          line.type === 'added'
                            ? 'bg-[#0a2419] text-[#00FF94] border-l-2 border-[#00FF94]'
                            : line.type === 'removed'
                            ? 'bg-[#2a150c] text-[#FF4D00] border-l-2 border-[#FF4D00] line-through'
                            : 'text-white/70'
                        }`}
                      >
                        <span className="w-5 text-right select-none opacity-40">
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                        </span>
                        <span className="break-all whitespace-pre-wrap">{line.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View Mode 2: Pixel Screenshot Diff */}
              {viewMode === 'visual' && (
                <div className="card !p-4 bg-[#111113] border border-white/10">
                  <div className="flex items-center justify-between mb-3 text-xs font-mono">
                    <span className="font-bold text-white uppercase">
                      PIXEL DIFFERENCE HEATMAP ({diffData.diff.visualDiff?.diffPercentage || 0}% PIXELS CHANGED)
                    </span>
                    <span className="text-[#FF4D00] text-[0.65rem] uppercase">CHANGED PIXELS HIGHLIGHTED IN NEON RED</span>
                  </div>

                  {diffData.diff.visualDiff?.diffImageUrl ? (
                    <div className="border border-white/10 overflow-hidden bg-black max-w-3xl mx-auto">
                      <img
                        src={diffData.diff.visualDiff.diffImageUrl}
                        alt="Pixel difference map"
                        className="w-full h-auto object-contain max-h-[500px]"
                      />
                    </div>
                  ) : (
                    <div className="text-center py-12 text-xs font-mono text-white/40">
                      Screenshot comparison data not available for this pair.
                    </div>
                  )}
                </div>
              )}

              {/* View Mode 3: Side-by-side View */}
              {viewMode === 'side-by-side' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Baseline Column */}
                  <div className="border border-white/10 bg-[#111113]">
                    <div className="bg-[#161619] px-3.5 py-2 border-b border-white/10 font-mono font-bold text-xs text-white/80 flex justify-between uppercase">
                      <span>BASELINE (V{diffData.baselineVersion.versionNumber})</span>
                      <span className="text-[0.62rem] text-white/40">
                        {new Date(diffData.baselineVersion.checkedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {diffData.baselineVersion.screenshotUrl && (
                      <div className="border-b border-white/10 p-2 bg-black">
                        <img
                          src={diffData.baselineVersion.screenshotUrl}
                          alt="Baseline screenshot"
                          className="w-full h-36 object-cover"
                        />
                      </div>
                    )}
                    <div className="p-3 max-h-[350px] overflow-y-auto text-xs font-mono text-white/80 whitespace-pre-wrap">
                      {diffData.baselineVersion.normalizedText}
                    </div>
                  </div>

                  {/* Compared Column */}
                  <div className="border border-white/10 bg-[#111113]">
                    <div className="bg-[#161619] px-3.5 py-2 border-b border-white/10 font-mono font-bold text-xs text-white/80 flex justify-between uppercase">
                      <span>COMPARED (V{diffData.comparedVersion.versionNumber})</span>
                      <span className="text-[0.62rem] text-white/40">
                        {new Date(diffData.comparedVersion.checkedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {diffData.comparedVersion.screenshotUrl && (
                      <div className="border-b border-white/10 p-2 bg-black">
                        <img
                          src={diffData.comparedVersion.screenshotUrl}
                          alt="Compared screenshot"
                          className="w-full h-36 object-cover"
                        />
                      </div>
                    )}
                    <div className="p-3 max-h-[350px] overflow-y-auto text-xs font-mono text-white/80 whitespace-pre-wrap">
                      {diffData.comparedVersion.normalizedText}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-white/40 shrink-0">
          <span className="text-[0.62rem] uppercase">WEBWATCH DETERMINISTIC DIFF & NORMALIZATION MATRIX</span>
          <button
            type="button"
            onClick={onClose}
            className="border border-white/20 text-white hover:bg-white hover:text-black font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2 px-5 cursor-pointer transition-colors bg-transparent"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
