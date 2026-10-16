import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { Dashboard } from './components/Dashboard.js';
import { AlertsView } from './components/AlertsView.js';
import { SystemHealthView } from './components/SystemHealthView.js';
import { AddPageModal } from './components/AddPageModal.js';
import { EditPageModal } from './components/EditPageModal.js';
import { ComparisonModal } from './components/ComparisonModal.js';
import { VisualPickerModal } from './components/VisualPickerModal.js';
import { ImportConfigModal } from './components/ImportConfigModal.js';
import { DemoSandboxModal } from './components/DemoSandboxModal.js';
import { MonitoredPage } from './types/index.js';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'pages' | 'alerts' | 'health'>('pages');
  const [pages, setPages] = useState<MonitoredPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<MonitoredPage | null>(null);
  const [comparingPage, setComparingPage] = useState<MonitoredPage | null>(null);
  const [comparisonMode, setComparisonMode] = useState<'text' | 'visual' | 'side-by-side' | 'timeline'>('text');
  const [inspectingPage, setInspectingPage] = useState<MonitoredPage | null>(null);

  const fetchPages = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/pages');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch monitored pages');

      const loadedPages: MonitoredPage[] = data.data || [];
      setPages(loadedPages);

      // Deep link support: If URL contains ?pageId=... and compare=true, automatically open comparison
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetPageId = urlParams.get('pageId');
        if (targetPageId) {
          const match = loadedPages.find(p => p.id === targetPageId);
          if (match) {
            setComparisonMode(urlParams.get('timeline') ? 'timeline' : 'text');
            setComparingPage(match);
          }
        }
      } catch {
        // Ignore URL parsing errors
      }

      // If database is completely empty on first launch, seed a standard public site for instant exploration
      if (loadedPages.length === 0) {
        seedInitialSample();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const seedInitialSample = async () => {
    try {
      await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          name: 'IANA Example Domain',
          checkIntervalMinutes: 60,
          sensitivity: 'medium',
          watchedSelectors: ['h1', 'p'],
          ignoredSelectors: [],
        }),
      });
      // Re-fetch
      const res = await fetch('/api/pages');
      const data = await res.json();
      if (data.data) {
        setPages(data.data);
      }
    } catch {
      // Ignore initial seed failure
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const showNotification = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => {
      setNotificationMsg(null);
    }, 4000);
  };

  const handleCheckNow = async (id: string) => {
    try {
      const res = await fetch(`/api/pages/${id}/check`, { method: 'POST' });
      const data = await res.json();
      showNotification(data.message || 'Check completed.');
      fetchPages();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTogglePause = async (id: string) => {
    try {
      const res = await fetch(`/api/pages/${id}/toggle-pause`, { method: 'POST' });
      const data = await res.json();
      showNotification(data.message || 'Monitoring status updated.');
      fetchPages();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const pageToDelete = pages.find(p => p.id === id);
      const targetName = pageToDelete?.name || 'Target';

      // Immediate optimistic update
      setPages(prev => prev.filter(p => p.id !== id));
      if (editingPage?.id === id) setEditingPage(null);
      if (comparingPage?.id === id) setComparingPage(null);
      if (inspectingPage?.id === id) setInspectingPage(null);

      const res = await fetch(`/api/pages/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Revert on error
        await fetchPages();
        throw new Error(data.error || 'Failed to delete page');
      }
      showNotification(`TARGET "${targetName.toUpperCase()}" AND ALL HISTORY DELETED.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExportConfigs = async () => {
    try {
      const res = await fetch('/api/pages/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webwatch-configurations-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('MONITORING CONFIGURATIONS EXPORTED TO JSON.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen bg-[#111113] text-[#F8F7F4] p-4 sm:p-6 lg:p-10 font-sans selection:bg-[#FF4D00] selection:text-white">
      <div className="max-w-[1360px] mx-auto flex flex-col lg:grid lg:grid-cols-[250px_1fr] gap-8 lg:gap-10">
        {/* Left Column: Variation 1 Sidebar Header */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenAddModal={() => setIsAddOpen(true)}
          totalPagesCount={pages.length}
        />

        {/* Right Column: Main Content */}
        <main className="min-w-0">
          {error && (
            <div className="mb-6 p-4 bg-[#2a150c] border border-[#FF4D00] text-[#FF4D00] font-mono text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>[SYSTEM ERROR] {error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-[0.65rem] font-bold uppercase tracking-wider text-white hover:underline cursor-pointer ml-3"
              >
                DISMISS
              </button>
            </div>
          )}

          {activeTab === 'pages' && (
            <Dashboard
              pages={pages}
              loading={loading}
              onRefresh={fetchPages}
              onOpenAddModal={() => setIsAddOpen(true)}
              onOpenImportModal={() => setIsImportOpen(true)}
              onOpenDemoModal={() => setIsDemoOpen(true)}
              onExportConfigs={handleExportConfigs}
              onCheckNow={handleCheckNow}
              onTogglePause={handleTogglePause}
              onInspectRegions={page => setInspectingPage(page)}
              onCompareVersions={(page, mode) => {
                setComparisonMode(mode || 'text');
                setComparingPage(page);
              }}
              onEdit={page => setEditingPage(page)}
              onDelete={handleDelete}
            />
          )}

          {activeTab === 'alerts' && <AlertsView />}

          {activeTab === 'health' && <SystemHealthView />}
        </main>
      </div>

      {/* Floating Industrial Notification Toast */}
      {notificationMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161619] text-[#F8F7F4] font-mono text-xs px-4 py-3 border border-white/20 shadow-2xl flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[#00FF94] animate-pulse shrink-0" />
          <span className="tracking-wide uppercase">{notificationMsg}</span>
        </div>
      )}

      {/* Modals */}
      <AddPageModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={() => {
          showNotification('PAGE REGISTERED. BASELINE FETCH DISPATCHED.');
          fetchPages();
        }}
      />

      <EditPageModal
        page={editingPage}
        isOpen={Boolean(editingPage)}
        onClose={() => setEditingPage(null)}
        onDelete={handleDelete}
        onSuccess={() => {
          showNotification('PAGE CONFIGURATION UPDATED.');
          fetchPages();
        }}
      />

      <ComparisonModal
        page={comparingPage}
        isOpen={Boolean(comparingPage)}
        initialMode={comparisonMode}
        onClose={() => setComparingPage(null)}
      />

      <VisualPickerModal
        page={inspectingPage}
        isOpen={Boolean(inspectingPage)}
        onClose={() => setInspectingPage(null)}
        onSuccess={() => {
          showNotification('REGION SELECTORS UPDATED SUCCESSFULLY.');
          fetchPages();
        }}
      />

      <ImportConfigModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={(msg) => {
          showNotification(msg);
          fetchPages();
        }}
      />

      <DemoSandboxModal
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        pages={pages}
        onRefreshPages={fetchPages}
        onCompareVersions={(page, mode) => {
          setComparisonMode(mode || 'text');
          setComparingPage(page);
        }}
      />
    </div>
  );
}
