import React, { useState, useEffect } from 'react';
import { X, Crosshair, Check, Plus, Trash2, Eye, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import { MonitoredPage } from '../types/index.js';

interface VisualPickerModalProps {
  page: MonitoredPage | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const VisualPickerModal: React.FC<VisualPickerModalProps> = ({
  page,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState('');
  const [elements, setElements] = useState<Array<{
    selector: string;
    tag: string;
    id?: string;
    className?: string;
    previewText: string;
    elementCount: number;
  }>>([]);

  const [watchedList, setWatchedList] = useState<string[]>([]);
  const [ignoredList, setIgnoredList] = useState<string[]>([]);

  // Custom selector tester
  const [customSelector, setCustomSelector] = useState('');
  const [testResult, setTestResult] = useState<{
    valid: boolean;
    matchesCount: number;
    previews?: string[];
    error?: string;
  } | null>(null);
  const [testingSelector, setTestingSelector] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (page && isOpen) {
      setWatchedList([...(page.watchedSelectors || [])]);
      setIgnoredList([...(page.ignoredSelectors || [])]);
      inspectPage();
    }
  }, [page, isOpen]);

  const inspectPage = async () => {
    if (!page) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: page.url }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to inspect target page DOM');
      }

      setPageTitle(data.data.title);
      setElements(data.data.elements || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const testCustomSelector = async (selectorToTest: string) => {
    if (!page || !selectorToTest.trim()) return;
    try {
      setTestingSelector(true);
      const res = await fetch('/api/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: page.url,
          testSelector: selectorToTest.trim(),
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setTestResult(data.data);
      }
    } catch {
      setTestResult({ valid: false, matchesCount: 0, error: 'Network validation error' });
    } finally {
      setTestingSelector(false);
    }
  };

  const addWatched = (sel: string) => {
    if (!watchedList.includes(sel)) {
      setWatchedList([...watchedList, sel]);
    }
  };

  const removeWatched = (sel: string) => {
    setWatchedList(watchedList.filter(s => s !== sel));
  };

  const addIgnored = (sel: string) => {
    if (!ignoredList.includes(sel)) {
      setIgnoredList([...ignoredList, sel]);
    }
  };

  const removeIgnored = (sel: string) => {
    setIgnoredList(ignoredList.filter(s => s !== sel));
  };

  const handleSave = async () => {
    if (!page) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/pages/${page.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: page.url,
          name: page.name,
          checkIntervalMinutes: page.checkIntervalMinutes,
          sensitivity: page.sensitivity,
          watchedSelectors: watchedList,
          ignoredSelectors: ignoredList,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update selectors');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !page) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div className="card max-w-4xl w-full p-6 border border-white/20 my-6 shadow-2xl bg-[#161619] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <Crosshair className="w-4 h-4 text-[#FF4D00]" />
              <h2 className="text-base font-mono font-bold text-[#F8F7F4] uppercase tracking-tight">
                VISUAL DOM REGION INSPECTOR
              </h2>
            </div>
            <p className="text-[0.68rem] font-mono text-white/40 mt-0.5 uppercase tracking-wider">
              {pageTitle ? `Target: ${pageTitle} · ` : ''}Selective CSS Extraction & Dynamic Noise Ignore Mask
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

        {/* Selected Summary Pill-free list */}
        <div className="py-3 border-b border-white/10 shrink-0 bg-[#111113] p-3 my-2 border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            {/* Watched List */}
            <div>
              <span className="text-[0.62rem] font-mono uppercase tracking-wider text-[#00FF94] font-bold block mb-1">
                WATCHED SELECTORS ({watchedList.length}):
              </span>
              {watchedList.length === 0 ? (
                <span className="text-white/40 text-[0.68rem]">[FULL PAGE MONITORED]</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {watchedList.map(sel => (
                    <span
                      key={sel}
                      className="inline-flex items-center gap-1.5 bg-[#0a2419] border border-[#00FF94]/60 px-2 py-0.5 text-[0.65rem] text-[#00FF94]"
                    >
                      <span>{sel}</span>
                      <button
                        type="button"
                        onClick={() => removeWatched(sel)}
                        className="text-white/60 hover:text-white cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Ignored List */}
            <div>
              <span className="text-[0.62rem] font-mono uppercase tracking-wider text-[#FF4D00] font-bold block mb-1">
                IGNORED NOISE MASKS ({ignoredList.length}):
              </span>
              {ignoredList.length === 0 ? (
                <span className="text-white/40 text-[0.68rem]">[DEFAULT FILTERS ONLY]</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ignoredList.map(sel => (
                    <span
                      key={sel}
                      className="inline-flex items-center gap-1.5 bg-[#2a150c] border border-[#FF4D00]/60 px-2 py-0.5 text-[0.65rem] text-[#FF4D00]"
                    >
                      <span>{sel}</span>
                      <button
                        type="button"
                        onClick={() => removeIgnored(sel)}
                        className="text-white/60 hover:text-white cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Custom Selector Tester Input */}
        <div className="py-2 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="TEST CUSTOM CSS SELECTOR (e.g. #pricing, div.product-card, h2.title)"
              value={customSelector}
              onChange={e => {
                setCustomSelector(e.target.value);
                setTestResult(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  testCustomSelector(customSelector);
                }
              }}
              className="flex-1 px-3 py-2 text-xs font-mono uppercase bg-[#111113] border border-white/15 text-[#F8F7F4] placeholder:text-white/30 focus:outline-hidden focus:border-white"
            />
            <button
              type="button"
              disabled={testingSelector || !customSelector.trim()}
              onClick={() => testCustomSelector(customSelector)}
              className="border border-white/20 text-white hover:border-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-4 cursor-pointer transition-colors disabled:opacity-50 bg-[#111113]"
            >
              {testingSelector ? 'TESTING...' : 'TEST'}
            </button>
          </div>

          {/* Test Feedback */}
          {testResult && (
            <div className={`mt-2 p-2.5 border font-mono text-xs flex items-center justify-between ${
              testResult.valid && testResult.matchesCount > 0
                ? 'bg-[#0a2419] border-[#00FF94] text-[#00FF94]'
                : 'bg-[#2a150c] border-[#FF4D00] text-[#FF4D00]'
            }`}>
              <div>
                <span className="font-bold">{customSelector}: </span>
                {testResult.valid ? (
                  <span>
                    MATCHED {testResult.matchesCount} ELEMENT(S). PREVIEW: "{testResult.previews?.[0] || 'EMPTY TEXT'}"
                  </span>
                ) : (
                  <span>INVALID SELECTOR: {testResult.error}</span>
                )}
              </div>
              {testResult.valid && testResult.matchesCount > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => addWatched(customSelector.trim())}
                    className="bg-[#00FF94] text-black font-mono text-[0.62rem] uppercase font-bold px-2 py-1 cursor-pointer"
                  >
                    + WATCH
                  </button>
                  <button
                    type="button"
                    onClick={() => addIgnored(customSelector.trim())}
                    className="bg-[#FF4D00] text-white font-mono text-[0.62rem] uppercase font-bold px-2 py-1 cursor-pointer"
                  >
                    + IGNORE
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* DOM Elements List */}
        <div className="overflow-y-auto flex-1 py-2 space-y-2">
          {error && (
            <div className="p-3 bg-[#2a150c] border border-[#FF4D00] text-[#FF4D00] font-mono text-xs">
              [DOM INSPECTOR ERROR] {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-white/50 gap-2 font-mono">
              <RefreshCw className="w-6 h-6 animate-spin text-[#FF4D00]" />
              <span className="text-xs uppercase tracking-wider">EXTRACTING LIVE DOM HIERARCHY...</span>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {elements.map((el, idx) => {
                const isWatched = watchedList.includes(el.selector);
                const isIgnored = ignoredList.includes(el.selector);

                return (
                  <div
                    key={idx}
                    className="py-3 px-3 hover:bg-white/[0.02] flex items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div className="overflow-hidden flex-1">
                      <div className="flex items-center gap-2 mb-1 font-mono">
                        <span className="font-bold text-white bg-[#111113] border border-white/10 px-2 py-0.5 text-[0.68rem]">
                          {el.selector}
                        </span>
                        <span className="text-[0.62rem] text-white/40 uppercase">
                          &lt;{el.tag}&gt; ({el.elementCount} on page)
                        </span>
                      </div>
                      <p className="text-white/60 text-[0.68rem] font-mono truncate">{el.previewText}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-mono">
                      {isWatched ? (
                        <button
                          type="button"
                          onClick={() => removeWatched(el.selector)}
                          className="px-2.5 py-1 text-[0.62rem] font-bold bg-[#00FF94] text-black cursor-pointer uppercase"
                        >
                          WATCHING ✓
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addWatched(el.selector)}
                          className="px-2.5 py-1 text-[0.62rem] font-bold border border-white/20 text-white hover:border-[#00FF94] hover:text-[#00FF94] cursor-pointer uppercase transition-colors"
                        >
                          + WATCH
                        </button>
                      )}

                      {isIgnored ? (
                        <button
                          type="button"
                          onClick={() => removeIgnored(el.selector)}
                          className="px-2.5 py-1 text-[0.62rem] font-bold bg-[#FF4D00] text-white cursor-pointer uppercase"
                        >
                          IGNORED ✓
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addIgnored(el.selector)}
                          className="px-2.5 py-1 text-[0.62rem] font-bold border border-white/20 text-white/60 hover:border-[#FF4D00] hover:text-[#FF4D00] cursor-pointer uppercase transition-colors"
                        >
                          + IGNORE
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-white/40 shrink-0">
          <span className="text-[0.62rem] uppercase">SELECTORS SAVED TO PAGE DATABASE RECORD</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-white/20 text-white/70 hover:border-white hover:text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2 px-4 cursor-pointer transition-colors bg-transparent"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-[#00A3FF] hover:bg-[#0092e6] text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2 px-5 cursor-pointer transition-colors disabled:opacity-50"
            >
              {saving ? 'SAVING...' : 'APPLY SELECTORS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
