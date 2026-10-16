import React, { useState } from 'react';
import {
  ExternalLink,
  Play,
  Pause,
  RefreshCw,
  Sliders,
  History,
  Trash2,
  Crosshair,
  GitCompare,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { MonitoredPage } from '../types/index.js';

interface PageCardProps {
  page: MonitoredPage;
  onCheckNow: (id: string) => Promise<void>;
  onTogglePause: (id: string) => Promise<void>;
  onInspectRegions: (page: MonitoredPage) => void;
  onCompareVersions: (page: MonitoredPage, mode?: 'text' | 'visual' | 'side-by-side' | 'timeline') => void;
  onEdit: (page: MonitoredPage) => void;
  onDelete: (id: string) => Promise<void>;
}

export const PageCard: React.FC<PageCardProps> = ({
  page,
  onCheckNow,
  onTogglePause,
  onInspectRegions,
  onCompareVersions,
  onEdit,
  onDelete,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleCheck = async () => {
    try {
      setIsChecking(true);
      await onCheckNow(page.id);
    } finally {
      setIsChecking(false);
    }
  };

  const confirmDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(page.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatRelativeTime = (isoString?: string | null) => {
    if (!isoString) return 'NEVER';
    const deltaSeconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (deltaSeconds < 60) return 'JUST NOW';
    if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}M AGO`;
    if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}H AGO`;
    return `${Math.floor(deltaSeconds / 86400)}D AGO`;
  };

  const formatFutureTime = (isoString?: string | null) => {
    if (!isoString) return 'PENDING';
    const deltaSeconds = Math.floor((new Date(isoString).getTime() - Date.now()) / 1000);
    if (deltaSeconds <= 0) return 'DUE NOW';
    if (deltaSeconds < 60) return `IN ${deltaSeconds}S`;
    if (deltaSeconds < 3600) return `IN ${Math.floor(deltaSeconds / 60)}M`;
    return `IN ${Math.floor(deltaSeconds / 3600)}H ${Math.floor((deltaSeconds % 3600) / 60)}M`;
  };

  // Status Banner formatting strictly adhering to Variation 1
  const renderStatusBanner = () => {
    switch (page.status) {
      case 'ERROR':
        return (
          <div className="bg-[#2a150c] p-4 border border-[#FF4D00] mb-5">
            <div className="font-mono text-xs text-[#FF4D00] font-bold tracking-wider flex items-center justify-between">
              <span>[ERROR] {page.lastError ? page.lastError.toUpperCase() : 'HTTP 404 / CONNECTION FAILED'}</span>
              <span className="text-[0.62rem] opacity-70">PREVIOUS SNAPSHOT PRESERVED</span>
            </div>
          </div>
        );
      case 'BLOCKED':
        return (
          <div className="bg-[#2a150c] p-4 border border-[#FF4D00] mb-5">
            <div className="font-mono text-xs text-[#FF4D00] font-bold tracking-wider flex items-center justify-between">
              <span>[BLOCKED] 403 / CLOUDFLARE CAPTCHA (ZERO FALSE DRIFT)</span>
              <span className="text-[0.62rem] opacity-70">PREVIOUS SNAPSHOT PRESERVED</span>
            </div>
          </div>
        );
      case 'PAUSED':
        return (
          <div className="bg-[#1a1a1a] p-4 border border-white/30 mb-5">
            <div className="font-mono text-xs text-white font-bold tracking-wider flex items-center justify-between">
              <span>[PAUSED] MONITORING SUSPENDED</span>
              <span className="text-[0.62rem] opacity-60">CRON TIMER IDLE</span>
            </div>
          </div>
        );
      case 'CHANGED':
        return (
          <div className="bg-[#0d1e2e] p-4 border border-[#00A3FF] mb-5">
            <div className="font-mono text-xs text-[#00A3FF] font-bold tracking-wider flex items-center justify-between">
              <span>[CHANGED] MEANINGFUL CONTENT DRIFT DETECTED</span>
              <span className="text-[0.62rem] opacity-80">DIFF READY</span>
            </div>
          </div>
        );
      case 'OK':
      default:
        return (
          <div className="bg-[#0a2419] p-4 border border-[#00FF94] mb-5">
            <div className="font-mono text-xs text-[#00FF94] font-bold tracking-wider flex items-center justify-between">
              <span>[OK] OPERATIONAL · NO DRIFT DETECTED</span>
              <span className="text-[0.62rem] opacity-80">STABLE</span>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="card flex flex-col justify-between hover:border-white/25 transition-colors">
      <div>
        {/* Title and URL */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-lg font-mono font-bold text-[#F8F7F4] uppercase tracking-tight truncate">
            {page.name}
          </h3>
          <span className="text-[0.6rem] font-mono tracking-widest px-2 py-0.5 border border-white/15 text-white/60 uppercase">
            {page.sensitivity} SENSITIVITY
          </span>
        </div>

        <div className="font-mono text-[0.7rem] text-white/50 tracking-wider mb-5 flex items-center gap-1.5 truncate">
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors flex items-center gap-1 truncate"
          >
            <span className="truncate">{page.url.toUpperCase()}</span>
            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
          </a>
        </div>

        {/* Variation 1: Status Banner */}
        {renderStatusBanner()}

        {/* Industrial Metadata Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-3 px-3.5 bg-[#111113] border border-white/10 mb-5 text-[0.65rem] font-mono">
          <div>
            <div className="text-white/40 uppercase tracking-wider text-[0.58rem]">INTERVAL</div>
            <div className="text-white/90 font-bold mt-0.5">{page.checkIntervalMinutes} MIN</div>
          </div>
          <div>
            <div className="text-white/40 uppercase tracking-wider text-[0.58rem]">LAST CHECK</div>
            <div className="text-white/90 font-bold mt-0.5">{formatRelativeTime(page.lastCheckedAt)}</div>
          </div>
          <div>
            <div className="text-white/40 uppercase tracking-wider text-[0.58rem]">NEXT RUN</div>
            <div className="text-white/90 font-bold mt-0.5">
              {page.status === 'PAUSED' ? 'SUSPENDED' : formatFutureTime(page.nextCheckAt)}
            </div>
          </div>
          <div>
            <div className="text-white/40 uppercase tracking-wider text-[0.58rem]">REGIONS</div>
            <div className="text-white/90 font-bold mt-0.5">
              {page.watchedSelectors?.length || 0}W · {page.ignoredSelectors?.length || 0}I
            </div>
          </div>
        </div>
      </div>

      {/* Variation 1 Actions Row */}
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Main Action: CHECK NOW or RESUME */}
          {page.status === 'PAUSED' ? (
            <button
              type="button"
              onClick={() => onTogglePause(page.id)}
              className="bg-[#00A3FF] hover:bg-[#0092e6] text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-3 px-5 cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>RESUME</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCheck}
              disabled={isChecking}
              className="bg-[#FF4D00] hover:bg-[#e04400] text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-3 px-5 cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'CHECKING...' : 'CHECK NOW'}</span>
            </button>
          )}

          {/* TIMELINE button strictly matching design */}
          <button
            type="button"
            onClick={() => onCompareVersions(page, 'timeline')}
            className="border border-white text-white hover:bg-white hover:text-black font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-3 px-5 cursor-pointer transition-colors bg-transparent flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            <span>TIMELINE</span>
          </button>

          {/* DIFF / COMPARE */}
          <button
            type="button"
            onClick={() => onCompareVersions(page, 'text')}
            className="border border-white/20 text-white/80 hover:border-white hover:text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-3 px-3.5 cursor-pointer transition-colors bg-transparent flex items-center gap-1.5"
            title="Inspect text and visual diff"
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>DIFF</span>
          </button>

          {/* VISUAL REGIONS */}
          <button
            type="button"
            onClick={() => onInspectRegions(page)}
            className="border border-white/20 text-white/80 hover:border-white hover:text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-3 px-3.5 cursor-pointer transition-colors bg-transparent flex items-center gap-1.5"
            title="Select visual regions to watch or ignore"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>REGIONS</span>
          </button>

          {/* More Controls: Pause/Edit/Delete */}
          <div className="ml-auto flex items-center gap-1">
            {page.status !== 'PAUSED' && (
              <button
                type="button"
                onClick={() => onTogglePause(page.id)}
                className="p-3 text-white/60 hover:text-white border border-white/10 hover:border-white/30 cursor-pointer transition-colors"
                title="Pause monitoring"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onEdit(page)}
              className="p-3 text-white/60 hover:text-white border border-white/10 hover:border-white/30 cursor-pointer transition-colors"
              title="Edit configuration"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(prev => !prev)}
              disabled={isDeleting}
              className={`p-3 border cursor-pointer transition-colors ${
                showDeleteConfirm
                  ? 'bg-[#FF4D00] text-white border-[#FF4D00]'
                  : 'text-white/60 hover:text-[#FF4D00] border-white/10 hover:border-[#FF4D00]/50'
              } disabled:opacity-50`}
              title="Delete target and all history"
              aria-label={`Delete ${page.name}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Inline Deletion Confirmation Panel (No window.confirm) */}
        {showDeleteConfirm && (
          <div className="mt-3 p-3.5 bg-[#2a150c] border border-[#FF4D00] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-xs text-[#FF4D00] font-bold flex items-center gap-1.5 uppercase tracking-wider">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>CONFIRM DELETION OF TARGET?</span>
              </div>
              <div className="text-[0.6rem] font-mono text-white/50 uppercase tracking-widest">
                IRREVERSIBLE
              </div>
            </div>
            <p className="text-[0.68rem] font-mono text-white/70 leading-relaxed">
              Permanently stop monitoring <span className="text-white font-bold">"{page.name}"</span> and delete all captured snapshots, diffs, and alert history.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-[0.62rem] font-mono uppercase tracking-[0.12em] border border-white/20 text-white/80 hover:text-white hover:border-white transition-colors cursor-pointer bg-transparent"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-1.5 text-[0.62rem] font-mono uppercase tracking-[0.12em] bg-[#FF4D00] hover:bg-[#e04400] text-white font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>DELETING...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3 h-3" />
                    <span>YES, DELETE PERMANENTLY</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
