import React, { useState, useEffect } from 'react';
import { X, Sparkles, ExternalLink, RefreshCw, CheckCircle, AlertTriangle, ArrowRight, Play, RotateCcw, Plus } from 'lucide-react';
import { MonitoredPage } from '../types/index.js';

interface DemoSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: MonitoredPage[];
  onRefreshPages: () => void;
  onCompareVersions: (page: MonitoredPage, mode?: 'text' | 'visual' | 'side-by-side' | 'timeline') => void;
}

export const DemoSandboxModal: React.FC<DemoSandboxModalProps> = ({
  isOpen,
  onClose,
  pages,
  onRefreshPages,
  onCompareVersions,
}) => {
  const [demoState, setDemoState] = useState<any>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cycleResults, setCycleResults] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const demoUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/demo/sample-page`
    : 'http://localhost:3000/demo/sample-page';

  // Check if demo page is already registered
  const registeredDemoPage = pages.find(p => p.url.includes('/demo/sample-page') || p.id === 'demo-test-target-page');

  const fetchDemoState = async () => {
    try {
      setLoadingState(true);
      const res = await fetch('/demo/sample-page/state');
      const data = await res.json();
      if (data.success) {
        setDemoState(data.data);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingState(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDemoState();
      setCycleResults(null);
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. Register demo target
  const handleRegisterTarget = async () => {
    try {
      setActionLoading(true);
      setStatusMessage('Registering demo target in WebWatch...');
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: demoUrl,
          name: 'Apex Cloud Services [DEMO TARGET]',
          checkIntervalMinutes: 15,
          sensitivity: 'medium',
          watchedSelectors: ['#page-title', '#plan-price', '#page-announcement', '#features-list'],
          ignoredSelectors: [],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to register demo target');
      setStatusMessage('DEMO TARGET REGISTERED. Baseline check initiated.');
      onRefreshPages();
    } catch (err: unknown) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Mutate content (V1 -> V2 or custom)
  const handleMutateContent = async () => {
    try {
      setActionLoading(true);
      setStatusMessage('Modifying live content on demo target...');
      const res = await fetch('/demo/sample-page/change', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDemoState(data.state);
        setStatusMessage(`Live target updated to Version ${data.state.version}: Price is now ${data.state.price} and features were modified.`);
      }
    } catch (err: unknown) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Reset content to Version 1
  const handleResetContent = async () => {
    try {
      setActionLoading(true);
      setStatusMessage('Resetting demo target to Version 1 (Baseline)...');
      const res = await fetch('/demo/sample-page/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDemoState(data.state);
        setStatusMessage('Demo target reset to Version 1 ($49/month Starter Plan).');
      }
    } catch (err: unknown) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Trigger WebWatch check now
  const handleTriggerCheck = async () => {
    if (!registeredDemoPage) return;
    try {
      setActionLoading(true);
      setStatusMessage('WebWatch fetching target and running diff analysis...');
      const res = await fetch(`/api/pages/${registeredDemoPage.id}/check`, { method: 'POST' });
      const data = await res.json();
      setStatusMessage(data.message || 'Check completed.');
      onRefreshPages();
    } catch (err: unknown) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Run full automated cycle
  const handleRunFullCycle = async () => {
    try {
      setActionLoading(true);
      setStatusMessage('Executing automated 5-step verification cycle (Baseline -> Mutate -> Check -> Diff)...');
      setCycleResults(null);
      const res = await fetch('/demo/verify-cycle', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Verification cycle failed');
      setCycleResults(data.results);
      setStatusMessage('AUTOMATED VERIFICATION CYCLE COMPLETED SUCCESSFULLY!');
      fetchDemoState();
      onRefreshPages();
    } catch (err: unknown) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="card max-w-2xl w-full p-6 border border-white/20 my-8 shadow-2xl bg-[#161619] space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[#00A3FF]" />
            <div>
              <h2 className="text-base font-mono font-bold text-[#F8F7F4] uppercase tracking-tight">
                LIVE DEMO TARGET & CHANGE DETECTOR VERIFICATION
              </h2>
              <p className="text-xs text-white/50 font-mono">
                Verify real-time drift detection, text diffs, and alerts on a live controllable example link.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/50 hover:text-white border border-white/10 hover:border-white/30 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Example Link Box */}
        <div className="p-3.5 bg-[#111113] border border-white/15 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[0.62rem] font-mono text-white/50 uppercase tracking-widest">
              EXAMPLE TARGET LINK (CONTROLLABLE ENDPOINT):
            </span>
            <a
              href={demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.62rem] font-mono text-[#00A3FF] hover:underline flex items-center gap-1 uppercase"
            >
              <span>OPEN LIVE TARGET PAGE</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="font-mono text-xs text-white font-bold tracking-wider select-all break-all bg-black/40 p-2 border border-white/10">
            {demoUrl}
          </div>
        </div>

        {/* Current Live State Matrix */}
        {demoState && (
          <div className="p-4 bg-[#111113] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.65rem] font-mono uppercase text-white/60 tracking-wider">
                CURRENT LIVE CONTENT STATE:
              </span>
              <span className={`text-[0.65rem] font-mono font-bold px-2 py-0.5 border ${
                demoState.version === 1
                  ? 'bg-[#0a2419] text-[#00FF94] border-[#00FF94]/50'
                  : 'bg-[#0d1e2e] text-[#00A3FF] border-[#00A3FF]/50'
              }`}>
                VERSION {demoState.version} ({demoState.badge})
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono pt-1">
              <div>
                <span className="text-white/40 text-[0.6rem] uppercase block">TARGET PRICE:</span>
                <span className="text-[#38bdf8] font-bold text-sm">{demoState.price}</span> {demoState.billingCycle}
              </div>
              <div>
                <span className="text-white/40 text-[0.6rem] uppercase block">REGISTERED IN WEBWATCH:</span>
                <span className={registeredDemoPage ? 'text-[#00FF94] font-bold' : 'text-white/50'}>
                  {registeredDemoPage ? `YES (STATUS: ${registeredDemoPage.status})` : 'NOT REGISTERED YET'}
                </span>
              </div>
            </div>

            <div className="text-[0.68rem] font-mono text-white/80 border-t border-white/10 pt-2">
              <span className="text-white/40 uppercase block text-[0.6rem]">HEADLINE:</span>
              <span className="text-white/90">{demoState.title}</span>
            </div>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className="p-3 bg-[#0a2419] border border-[#00FF94] text-[#00FF94] text-xs font-mono flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Automated Verification Receipts */}
        {cycleResults && (
          <div className="p-4 bg-[#0d1e2e] border border-[#00A3FF] space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between text-[#00A3FF] font-bold">
              <span>[VERIFICATION EVIDENCE RECEIPT]</span>
              <span className="text-[#00FF94]">✓ VERIFIED PASS</span>
            </div>
            <div className="space-y-1.5 text-[0.68rem] text-white/80">
              <div className="flex items-center justify-between">
                <span>1. Baseline Check (V1):</span>
                <span className="text-[#00FF94]">Captured Version 1 ({cycleResults.step2_contentChange.previousPrice})</span>
              </div>
              <div className="flex items-center justify-between">
                <span>2. Content Mutated:</span>
                <span className="text-[#FF4D00]">{cycleResults.step2_contentChange.previousPrice} ➔ {cycleResults.step2_contentChange.newPrice}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>3. Check #2 Drift Evaluation:</span>
                <span className="text-[#00A3FF]">Version {cycleResults.step3_secondCheck.snapshotVersion} (STATUS: {cycleResults.step3_secondCheck.status})</span>
              </div>
              <div className="flex items-center justify-between">
                <span>4. Meaningful Change Reason:</span>
                <span className="text-white font-bold">{cycleResults.step3_secondCheck.changeSummary}</span>
              </div>
            </div>

            {registeredDemoPage && (
              <div className="pt-2 border-t border-white/15 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onCompareVersions(registeredDemoPage, 'text');
                  }}
                  className="bg-[#00A3FF] hover:bg-[#0092e6] text-white text-[0.65rem] uppercase font-bold py-1.5 px-3 cursor-pointer"
                >
                  OPEN DIFF VIEWER FOR DEMO TARGET →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="space-y-3 pt-2">
          <div className="text-[0.62rem] font-mono text-white/50 uppercase tracking-widest">
            STEP-BY-STEP TEST CONTROLS:
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {!registeredDemoPage ? (
              <button
                type="button"
                onClick={handleRegisterTarget}
                disabled={actionLoading}
                className="p-3 bg-[#FF4D00] hover:bg-[#e04400] text-white font-mono text-[0.65rem] uppercase tracking-wider font-bold cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>1. REGISTER DEMO TARGET</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTriggerCheck}
                disabled={actionLoading}
                className="p-3 bg-white text-black hover:bg-white/90 font-mono text-[0.65rem] uppercase tracking-wider font-bold cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>RUN WEBWATCH CHECK NOW</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleMutateContent}
              disabled={actionLoading}
              className="p-3 bg-[#00A3FF] hover:bg-[#0092e6] text-white font-mono text-[0.65rem] uppercase tracking-wider font-bold cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>2. MUTATE CONTENT (V1 ➔ V2)</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={handleResetContent}
              disabled={actionLoading}
              className="px-3 py-2 border border-white/20 text-white/70 hover:text-white font-mono text-[0.65rem] uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3 h-3" />
              <span>RESET CONTENT TO V1 ($49)</span>
            </button>

            <button
              type="button"
              onClick={handleRunFullCycle}
              disabled={actionLoading}
              className="px-4 py-2 border border-[#00FF94] text-[#00FF94] hover:bg-[#00FF94] hover:text-black font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold cursor-pointer transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              title="Runs the full 5-step verification sequence automatically"
            >
              <Play className="w-3.5 h-3.5" />
              <span>RUN 1-CLICK AUTOMATED VERIFICATION</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
