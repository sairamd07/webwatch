import React from 'react';
import { Plus, Bell, Activity, Layers, Radio } from 'lucide-react';

interface NavbarProps {
  activeTab: 'pages' | 'alerts' | 'health';
  setActiveTab: (tab: 'pages' | 'alerts' | 'health') => void;
  onOpenAddModal: () => void;
  totalPagesCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onOpenAddModal,
  totalPagesCount,
}) => {
  return (
    <header className="w-full lg:w-[250px] flex flex-col justify-between shrink-0">
      <div>
        {/* Brand Logo - Variation 1 Typography */}
        <div className="mb-6 lg:mb-8">
          <h1 className="text-4xl lg:text-[2.75rem] font-bold font-mono tracking-tight leading-[0.88] text-[#F8F7F4] uppercase">
            WEB<br />WATCH
          </h1>
          <div className="mt-2 text-[0.65rem] font-mono tracking-widest text-[#F8F7F4]/40 uppercase flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF94] animate-pulse"></span>
            <span>DOM DIFF & INTEGRITY ENGINE</span>
          </div>
        </div>

        {/* Action Button: Monitor URL */}
        <div className="mb-6">
          <button
            type="button"
            onClick={onOpenAddModal}
            className="w-full bg-[#FF4D00] hover:bg-[#e04400] text-white font-mono text-[0.7rem] uppercase tracking-[0.15em] font-bold py-3.5 px-4 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#FF4D00]/20"
          >
            <Plus className="w-4 h-4" />
            <span>+ MONITOR URL</span>
          </button>
        </div>

        {/* Navigation - Variation 1 Vertical Stack */}
        <nav className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            className={`w-full py-3 px-3.5 text-left font-mono text-[0.7rem] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-between cursor-pointer border ${
              activeTab === 'pages'
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-transparent text-white/50 border-transparent hover:border-white/20 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-3.5 h-3.5" />
              <span>MONITORED PAGES</span>
            </div>
            <span className={`text-[0.65rem] px-1.5 py-0.5 font-mono ${
              activeTab === 'pages' ? 'bg-black text-white' : 'bg-white/10 text-white/60'
            }`}>
              {totalPagesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`w-full py-3 px-3.5 text-left font-mono text-[0.7rem] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-between cursor-pointer border ${
              activeTab === 'alerts'
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-transparent text-white/50 border-transparent hover:border-white/20 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Bell className="w-3.5 h-3.5" />
              <span>ALERTS & LOGS</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('health')}
            className={`w-full py-3 px-3.5 text-left font-mono text-[0.7rem] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-between cursor-pointer border ${
              activeTab === 'health'
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-transparent text-white/50 border-transparent hover:border-white/20 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Activity className="w-3.5 h-3.5" />
              <span>DIAGNOSTICS</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Industrial Footer Status */}
      <div className="mt-8 pt-6 border-t border-white/10 hidden lg:block">
        <div className="flex items-center justify-between text-[0.62rem] font-mono uppercase tracking-wider text-white/40 mb-1.5">
          <span>SCHEDULER</span>
          <span className="text-[#00FF94] flex items-center gap-1 font-bold">
            <Radio className="w-2.5 h-2.5 animate-pulse" /> RUNNING
          </span>
        </div>
        <div className="text-[0.62rem] font-mono text-white/30 truncate">
          INTERVAL: 15M - 24H · JITTER ON
        </div>
      </div>
    </header>
  );
};
