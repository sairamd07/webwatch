import React, { useState } from 'react';
import { Search, RefreshCw, Filter, ShieldCheck, Plus, AlertTriangle, Download, Upload, Sparkles } from 'lucide-react';
import { MonitoredPage, PageStatus, SensitivityLevel } from '../types/index.js';
import { PageCard } from './PageCard.js';

interface DashboardProps {
  pages: MonitoredPage[];
  loading: boolean;
  onRefresh: () => void;
  onOpenAddModal: () => void;
  onOpenImportModal: () => void;
  onOpenDemoModal: () => void;
  onExportConfigs: () => void;
  onCheckNow: (id: string) => Promise<void>;
  onTogglePause: (id: string) => Promise<void>;
  onInspectRegions: (page: MonitoredPage) => void;
  onCompareVersions: (page: MonitoredPage, mode?: 'text' | 'visual' | 'side-by-side' | 'timeline') => void;
  onEdit: (page: MonitoredPage) => void;
  onDelete: (id: string) => Promise<void>;
}

export const Dashboard: React.FC<DashboardProps> = ({
  pages,
  loading,
  onRefresh,
  onOpenAddModal,
  onOpenImportModal,
  onOpenDemoModal,
  onExportConfigs,
  onCheckNow,
  onTogglePause,
  onInspectRegions,
  onCompareVersions,
  onEdit,
  onDelete,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PageStatus>('ALL');
  const [sensitivityFilter, setSensitivityFilter] = useState<'ALL' | SensitivityLevel>('ALL');

  // Filtered pages
  const filteredPages = pages.filter(page => {
    const matchesSearch =
      page.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.url.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || page.status === statusFilter;
    const matchesSensitivity = sensitivityFilter === 'ALL' || page.sensitivity === sensitivityFilter;

    return matchesSearch && matchesStatus && matchesSensitivity;
  });

  // Calculate metrics
  const totalPages = pages.length;
  const operationalPages = pages.filter(p => p.status === 'OK').length;
  const changedPages = pages.filter(p => p.status === 'CHANGED').length;
  const errorPages = pages.filter(p => p.status === 'ERROR' || p.status === 'BLOCKED').length;

  return (
    <div className="space-y-8">
      {/* Variation 1: 4-Column Metric Counter Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        <div className="card">
          <div className="label">Pages</div>
          <div className="text-4xl lg:text-5xl font-mono font-bold text-[#F8F7F4] mt-2 leading-none">
            {totalPages}
          </div>
          <div className="text-[0.62rem] font-mono text-white/40 uppercase tracking-widest mt-2">
            Continuous Watch
          </div>
        </div>

        <div className="card">
          <div className="label">Operational</div>
          <div className="text-4xl lg:text-5xl font-mono font-bold text-[#00FF94] mt-2 leading-none">
            {operationalPages}
          </div>
          <div className="text-[0.62rem] font-mono text-white/40 uppercase tracking-widest mt-2">
            No Drift Detected
          </div>
        </div>

        <div className="card">
          <div className="label">Changes</div>
          <div className="text-4xl lg:text-5xl font-mono font-bold text-[#00A3FF] mt-2 leading-none">
            {changedPages}
          </div>
          <div className="text-[0.62rem] font-mono text-white/40 uppercase tracking-widest mt-2">
            Verified Versions
          </div>
        </div>

        <div className="card">
          <div className="label">Errors</div>
          <div className="text-4xl lg:text-5xl font-mono font-bold text-[#FF4D00] mt-2 leading-none">
            {errorPages}
          </div>
          <div className="text-[0.62rem] font-mono text-white/40 uppercase tracking-widest mt-2">
            Issues / Blocked
          </div>
        </div>
      </div>

      {/* Industrial Search & Filter Controls Bar */}
      <div className="card !p-4 border border-white/10 space-y-3.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="SEARCH BY PAGE NAME OR TARGET URL..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#111113] pl-10 pr-4 py-2.5 text-xs font-mono tracking-wider border border-white/15 text-[#F8F7F4] placeholder:text-white/30 focus:outline-hidden focus:border-white transition-colors uppercase"
            />
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Export Configurations */}
            <button
              type="button"
              onClick={onExportConfigs}
              title="Export all page monitoring configurations as JSON"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[0.65rem] font-mono uppercase tracking-[0.12em] border border-white/20 text-white/80 hover:text-white hover:border-white transition-colors cursor-pointer bg-[#111113]"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">EXPORT</span>
              <span>JSON</span>
            </button>

            {/* Import Configurations */}
            <button
              type="button"
              onClick={onOpenImportModal}
              title="Import page monitoring configurations from JSON"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[0.65rem] font-mono uppercase tracking-[0.12em] border border-white/20 text-white/80 hover:text-white hover:border-white transition-colors cursor-pointer bg-[#111113]"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden md:inline">IMPORT</span>
              <span>JSON</span>
            </button>

            {/* Test Demo Target & Live Change Simulator */}
            <button
              type="button"
              onClick={onOpenDemoModal}
              title="Test example link and simulate live content changes"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-[0.65rem] font-mono uppercase tracking-[0.12em] border border-[#00A3FF]/50 text-[#00A3FF] hover:bg-[#00A3FF] hover:text-black transition-colors cursor-pointer bg-[#111113]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>TEST DEMO TARGET</span>
            </button>

            {/* Refresh Action Button */}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-[0.65rem] font-mono uppercase tracking-[0.15em] border border-white/20 text-white/80 hover:text-white hover:border-white transition-colors cursor-pointer bg-[#111113]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#FF4D00]' : ''}`} />
              <span>{loading ? 'CHECKING...' : 'REFRESH'}</span>
            </button>
          </div>
        </div>

        {/* Filter Badges & Sensitivity */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-white/10 text-xs">
          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.62rem] font-mono text-white/40 uppercase tracking-widest mr-1">
              STATUS:
            </span>
            {(['ALL', 'OK', 'CHANGED', 'ERROR', 'BLOCKED', 'PAUSED'] as const).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-[0.62rem] font-mono uppercase tracking-wider transition-colors cursor-pointer border ${
                  statusFilter === st
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-[#111113] text-white/60 border-white/10 hover:border-white/30 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Sensitivity Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[0.62rem] font-mono text-white/40 uppercase tracking-widest mr-1">
              SENSITIVITY:
            </span>
            {(['ALL', 'low', 'medium', 'high'] as const).map(sens => (
              <button
                key={sens}
                type="button"
                onClick={() => setSensitivityFilter(sens)}
                className={`px-2 py-1 text-[0.62rem] font-mono uppercase tracking-wider transition-colors cursor-pointer border ${
                  sensitivityFilter === sens
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-[#111113] text-white/60 border-white/10 hover:border-white/30 hover:text-white'
                }`}
              >
                {sens}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pages Grid: 2-column Variation 1 layout */}
      {filteredPages.length === 0 ? (
        <div className="card text-center py-16 border-dashed border-white/20">
          <div className="text-4xl font-mono text-white/20 mb-3">[EMPTY]</div>
          <h3 className="text-sm font-mono uppercase text-white/80 tracking-wider mb-2">
            No Monitored Targets Found
          </h3>
          <p className="text-xs text-white/50 max-w-md mx-auto mb-6">
            {searchQuery || statusFilter !== 'ALL' || sensitivityFilter !== 'ALL'
              ? 'No registered targets match the active filter criteria.'
              : 'Add your first target URL to begin headless browser monitoring, visual diffing, and change detection.'}
          </p>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-2 bg-[#FF4D00] text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-3 px-6 cursor-pointer hover:bg-[#e04400] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ REGISTER NEW URL</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {filteredPages.map(page => (
            <PageCard
              key={page.id}
              page={page}
              onCheckNow={onCheckNow}
              onTogglePause={onTogglePause}
              onInspectRegions={onInspectRegions}
              onCompareVersions={onCompareVersions}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};
