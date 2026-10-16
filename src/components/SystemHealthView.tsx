import React, { useState, useEffect } from 'react';
import { Activity, Database, HardDrive, Cpu, ShieldCheck, CheckCircle, RefreshCw, Info, AlertCircle, Terminal } from 'lucide-react';
import { SystemHealthStatus } from '../types/index.js';

export const SystemHealthView: React.FC = () => {
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const isLocalDev = health?.environmentMode === 'local_development';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-mono font-bold text-[#F8F7F4] uppercase tracking-tight">
              SYSTEM ARCHITECTURE & DIAGNOSTICS
            </h2>
            <span className={`text-[0.62rem] font-mono px-2 py-0.5 uppercase tracking-wider font-bold border ${
              isLocalDev
                ? 'bg-[#0d1e2e] text-[#00A3FF] border-[#00A3FF]'
                : 'bg-[#0a2419] text-[#00FF94] border-[#00FF94]'
            }`}>
              {isLocalDev ? 'LOCAL SQLITE ENGINE' : 'ENTERPRISE POSTGRES & REDIS'}
            </span>
          </div>
          <p className="text-xs text-white/50 font-mono mt-1">
            Real-time status of persistent storage, scheduler queue, browser automation, and alert integrations.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchHealth}
          disabled={loading}
          className="border border-white/20 text-white/80 hover:border-white hover:text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-4 cursor-pointer transition-colors bg-[#111113] flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#FF4D00]' : ''}`} />
          <span>REFRESH METRICS</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-[#2a150c] border border-[#FF4D00] text-[#FF4D00] font-mono text-xs">
          [DIAGNOSTICS ERROR] {error}
        </div>
      )}

      {/* Operational Environment Notice */}
      <div className="card !p-4 bg-[#111113] border border-white/10 flex items-start gap-3">
        <Terminal className="w-5 h-5 text-[#FF4D00] shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 font-mono">
          <div className="font-bold text-[#F8F7F4] uppercase tracking-wider">
            {isLocalDev
              ? 'ZERO-CONFIG LOCAL ENVIRONMENT ACTIVE'
              : 'PRODUCTION MULTI-CONTAINER PIPELINE'}
          </div>
          <p className="text-white/60 leading-relaxed font-sans text-xs">
            {health?.queue.modeDescription}
          </p>
          {isLocalDev && (
            <p className="text-white/40 pt-1 text-[0.65rem] font-mono">
              STORAGE LOCATION: storage/webwatch.db · ISOLATED CHROMIUM INSTANCE · SSFR-SHIELD ACTIVE
            </p>
          )}
        </div>
      </div>

      {/* Grid of Key Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database */}
        <div className="card">
          <div className="label">Database</div>
          <div className="text-xl font-mono font-bold text-[#F8F7F4] mt-2">
            {health?.database.type === 'postgres' ? 'POSTGRESQL 16' : 'SQLITE 3'}
          </div>
          <div className="text-[0.65rem] font-mono text-white/50 mt-2 space-y-0.5">
            <div>{health?.database.pagesCount ?? 0} MONITORED PAGES</div>
            <div>{health?.database.snapshotsCount ?? 0} PERSISTED SNAPSHOTS</div>
            {health?.database.path && (
              <div className="text-white/30 truncate text-[0.6rem] mt-1">{health.database.path}</div>
            )}
          </div>
        </div>

        {/* Queue & Scheduler */}
        <div className="card">
          <div className="label">Scheduler Queue</div>
          <div className="text-xl font-mono font-bold text-[#00FF94] mt-2">
            {health?.queue.type === 'bullmq_redis' ? 'BULLMQ (REDIS)' : 'PRIORITY QUEUE'}
          </div>
          <div className="text-[0.65rem] font-mono text-white/50 mt-2 space-y-0.5">
            <div>{health?.queue.activeJobs ?? 0} IN-FLIGHT CHECKS</div>
            <div>{health?.queue.waitingJobs ?? 0} QUEUED RUNS</div>
            <div className="text-white/40">RATE LIMIT: 4S DOMAIN COOLDOWN</div>
          </div>
        </div>

        {/* Screenshot Storage */}
        <div className="card">
          <div className="label">Storage Volume</div>
          <div className="text-xl font-mono font-bold text-[#00A3FF] mt-2">
            {health?.storage.screenshotsCount ?? 0} CAPTURES
          </div>
          <div className="text-[0.65rem] font-mono text-white/50 mt-2 space-y-0.5">
            <div>USAGE: {((health?.storage.diskUsageBytes ?? 0) / 1024).toFixed(1)} KB</div>
            <div className="text-white/30 text-[0.6rem]">./storage/screenshots</div>
          </div>
        </div>

        {/* Browser Engine */}
        <div className="card">
          <div className="label">Browser Runtime</div>
          <div className="text-xl font-mono font-bold text-[#FF4D00] mt-2">
            PLAYWRIGHT
          </div>
          <div className="text-[0.65rem] font-mono text-white/50 mt-2 space-y-0.5">
            <div>CHROMIUM HEADLESS</div>
            <div className="text-[#00FF94] font-bold">ANTI-BOT FILTER ON</div>
          </div>
        </div>
      </div>

      {/* Integration Channels Matrix */}
      <div className="card space-y-4">
        <h3 className="text-xs font-mono font-bold text-[#F8F7F4] uppercase tracking-wider">
          NOTIFICATION CHANNELS READINESS
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Discord */}
          <div className="p-3.5 bg-[#111113] border border-white/10">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-white uppercase">DISCORD WEBHOOKS</span>
              <span className="text-[#00FF94] font-bold">[READY]</span>
            </div>
            <p className="text-white/50 text-[0.68rem] font-mono mt-2">
              No server credentials required. Paste any Discord channel webhook URL into page settings.
            </p>
          </div>

          {/* Telegram */}
          <div className="p-3.5 bg-[#111113] border border-white/10">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-white uppercase">TELEGRAM BOT API</span>
              <span className={health?.integrations.telegramConfigured ? 'text-[#00FF94] font-bold' : 'text-white/40'}>
                {health?.integrations.telegramConfigured ? '[CONFIGURED]' : '[OPTIONAL]'}
              </span>
            </div>
            <p className="text-white/50 text-[0.68rem] font-mono mt-2">
              Set TELEGRAM_BOT_TOKEN in .env to enable direct dispatch to Telegram chat IDs.
            </p>
          </div>

          {/* Email */}
          <div className="p-3.5 bg-[#111113] border border-white/10">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-white uppercase">EMAIL (SMTP)</span>
              <span className={health?.integrations.smtpConfigured ? 'text-[#00FF94] font-bold' : 'text-white/40'}>
                {health?.integrations.smtpConfigured ? '[CONFIGURED]' : '[OPTIONAL]'}
              </span>
            </div>
            <p className="text-white/50 text-[0.68rem] font-mono mt-2">
              Configure SMTP credentials in .env to dispatch HTML alerts and daily digests.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Backup & Portability */}
      <div className="card space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-mono font-bold text-[#F8F7F4] uppercase tracking-wider">
              CONFIGURATION BACKUP & PORTABILITY
            </h3>
            <p className="text-white/50 text-xs font-sans mt-0.5">
              Export all registered target URLs, selectors, intervals, sensitivities, and alert destinations into an offline JSON backup or transfer across deployments.
            </p>
          </div>
          <a
            href="/api/pages/export"
            download="webwatch-configurations.json"
            className="border border-white/20 text-white hover:border-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-4 cursor-pointer transition-colors bg-[#111113] flex items-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <span>EXPORT CONFIGURATIONS (.JSON)</span>
          </a>
        </div>
      </div>
    </div>
  );
};
