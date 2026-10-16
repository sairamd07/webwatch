import React, { useState, useEffect } from 'react';
import { X, Globe, Shield, Bell, Moon, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { MonitoredPage, SensitivityLevel } from '../types/index.js';

interface EditPageModalProps {
  page: MonitoredPage | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onDelete?: (id: string) => Promise<void>;
}

export const EditPageModal: React.FC<EditPageModalProps> = ({ page, isOpen, onClose, onSuccess, onDelete }) => {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [interval, setInterval] = useState<number>(60);
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('medium');
  const [watchedSelectors, setWatchedSelectors] = useState('');
  const [ignoredSelectors, setIgnoredSelectors] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyDiscordWebhook, setNotifyDiscordWebhook] = useState('');
  const [notifyTelegramChatId, setNotifyTelegramChatId] = useState('');
  const [quietHoursStart, setQuietHoursStart] = useState('');
  const [quietHoursEnd, setQuietHoursEnd] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteTarget = async () => {
    if (!page || !onDelete) return;
    try {
      setIsDeleting(true);
      await onDelete(page.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    if (page) {
      setUrl(page.url);
      setName(page.name);
      setInterval(page.checkIntervalMinutes);
      setSensitivity(page.sensitivity);
      setWatchedSelectors(page.watchedSelectors?.join(', ') || '');
      setIgnoredSelectors(page.ignoredSelectors?.join(', ') || '');
      setNotifyEmail(page.notifyEmail || '');
      setNotifyDiscordWebhook(page.notifyDiscordWebhook || '');
      setNotifyTelegramChatId(page.notifyTelegramChatId || '');
      setQuietHoursStart(page.quietHoursStart || '');
      setQuietHoursEnd(page.quietHoursEnd || '');
      setError(null);
    }
  }, [page]);

  if (!isOpen || !page) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const watched = watchedSelectors
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const ignored = ignoredSelectors
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/pages/${page.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          checkIntervalMinutes: interval,
          sensitivity,
          watchedSelectors: watched,
          ignoredSelectors: ignored,
          notifyEmail: notifyEmail.trim() || null,
          notifyDiscordWebhook: notifyDiscordWebhook.trim() || null,
          notifyTelegramChatId: notifyTelegramChatId.trim() || null,
          quietHoursStart: quietHoursStart.trim() || null,
          quietHoursEnd: quietHoursEnd.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update page settings');
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="card max-w-xl w-full p-6 border border-white/20 my-8 shadow-2xl bg-[#161619]">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-mono font-bold text-[#F8F7F4] uppercase tracking-tight">
              EDIT MONITORING CONFIGURATION
            </h2>
            <p className="text-[0.68rem] font-mono text-white/40 mt-0.5 uppercase tracking-wider truncate max-w-md">
              {page.url}
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

        {error && (
          <div className="mt-4 p-3.5 bg-[#2a150c] border border-[#FF4D00] text-[#FF4D00] font-mono text-xs">
            [UPDATE FAILED] {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Target URL (Read-only for audit integrity) */}
          <div>
            <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
              TARGET URL
            </label>
            <input
              type="text"
              disabled
              value={url}
              className="w-full px-3 py-2.5 text-xs font-mono bg-[#111113]/50 border border-white/10 text-white/40 cursor-not-allowed"
            />
          </div>

          {/* Friendly Name */}
          <div>
            <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
              DISPLAY NAME *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
            />
          </div>

          {/* Check Interval & Sensitivity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
                CHECK INTERVAL
              </label>
              <select
                value={interval}
                onChange={e => setInterval(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-xs font-mono uppercase bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
              >
                <option value={15} className="bg-[#111113]">EVERY 15 MINUTES (HIGH FREQUENCY)</option>
                <option value={30} className="bg-[#111113]">EVERY 30 MINUTES</option>
                <option value={60} className="bg-[#111113]">EVERY 1 HOUR (DEFAULT)</option>
                <option value={120} className="bg-[#111113]">EVERY 2 HOURS</option>
                <option value={360} className="bg-[#111113]">EVERY 6 HOURS</option>
                <option value={720} className="bg-[#111113]">EVERY 12 HOURS</option>
                <option value={1440} className="bg-[#111113]">EVERY 24 HOURS</option>
              </select>
            </div>

            <div>
              <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
                SENSITIVITY THRESHOLD
              </label>
              <select
                value={sensitivity}
                onChange={e => setSensitivity(e.target.value as SensitivityLevel)}
                className="w-full px-3 py-2.5 text-xs font-mono uppercase bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
              >
                <option value="medium" className="bg-[#111113]">MEDIUM (BALANCED NOISE FILTER)</option>
                <option value="high" className="bg-[#111113]">HIGH (ANY WORD CHANGE)</option>
                <option value="low" className="bg-[#111113]">LOW (SIGNIFICANT REDESIGN ONLY)</option>
              </select>
            </div>
          </div>

          {/* Selective Region Selectors */}
          <div className="pt-3 border-t border-white/10 space-y-3">
            <h4 className="text-[0.65rem] font-mono uppercase font-bold text-white/80 flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-[#FF4D00]" />
              <span>DOM SELECTOR MASKS</span>
            </h4>
            <div>
              <label className="block text-[0.62rem] font-mono uppercase tracking-wider text-white/50 mb-1">
                WATCHED REGIONS (COMMA-SEPARATED CSS SELECTORS)
              </label>
              <input
                type="text"
                placeholder="#pricing-table, .main-article"
                value={watchedSelectors}
                onChange={e => setWatchedSelectors(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
              />
            </div>

            <div>
              <label className="block text-[0.62rem] font-mono uppercase tracking-wider text-white/50 mb-1">
                IGNORED NOISE REGIONS (COMMA-SEPARATED CSS SELECTORS)
              </label>
              <input
                type="text"
                placeholder=".advertisement, #timestamp, .visitor-counter"
                value={ignoredSelectors}
                onChange={e => setIgnoredSelectors(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
              />
            </div>
          </div>

          {/* Notifications Channels */}
          <div className="pt-3 border-t border-white/10 space-y-3">
            <h4 className="text-[0.65rem] font-mono uppercase font-bold text-white/80 flex items-center gap-1.5">
              <Bell className="w-3 h-3 text-[#00A3FF]" />
              <span>ALERT DISPATCH DESTINATIONS</span>
            </h4>

            <div>
              <label className="block text-[0.62rem] font-mono uppercase tracking-wider text-white/50 mb-1">
                DISCORD WEBHOOK URL
              </label>
              <input
                type="text"
                placeholder="https://discord.com/api/webhooks/..."
                value={notifyDiscordWebhook}
                onChange={e => setNotifyDiscordWebhook(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[0.62rem] font-mono uppercase tracking-wider text-white/50 mb-1">
                  EMAIL RECIPIENT
                </label>
                <input
                  type="email"
                  placeholder="alerts@domain.com"
                  value={notifyEmail}
                  onChange={e => setNotifyEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
                />
              </div>

              <div>
                <label className="block text-[0.62rem] font-mono uppercase tracking-wider text-white/50 mb-1">
                  TELEGRAM CHAT ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 123456789"
                  value={notifyTelegramChatId}
                  onChange={e => setNotifyTelegramChatId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[0.62rem] font-mono uppercase tracking-wider text-white/50 mb-1 flex items-center gap-1">
                  <Moon className="w-3 h-3" />
                  <span>QUIET HOURS START</span>
                </label>
                <input
                  type="text"
                  placeholder="22:00"
                  value={quietHoursStart}
                  onChange={e => setQuietHoursStart(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
                />
              </div>

              <div>
                <label className="block text-[0.62rem] font-mono uppercase tracking-wider text-white/50 mb-1 flex items-center gap-1">
                  <Moon className="w-3 h-3" />
                  <span>QUIET HOURS END</span>
                </label>
                <input
                  type="text"
                  placeholder="08:00"
                  value={quietHoursEnd}
                  onChange={e => setQuietHoursEnd(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {onDelete ? (
              <div>
                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={loading || isDeleting}
                    className="flex items-center gap-1.5 px-3 py-2 text-[0.65rem] font-mono uppercase tracking-[0.12em] text-[#FF4D00] border border-[#FF4D00]/40 hover:bg-[#2a150c] hover:border-[#FF4D00] transition-colors cursor-pointer bg-transparent disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>DELETE TARGET</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[0.62rem] font-mono text-[#FF4D00] font-bold">CONFIRM DELETE?</span>
                    <button
                      type="button"
                      onClick={handleDeleteTarget}
                      disabled={isDeleting}
                      className="px-2.5 py-1.5 text-[0.62rem] font-mono uppercase tracking-wider bg-[#FF4D00] text-white font-bold cursor-pointer hover:bg-[#e04400] transition-colors flex items-center gap-1"
                    >
                      {isDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                      <span>YES, DELETE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      className="px-2 py-1.5 text-[0.62rem] font-mono uppercase tracking-wider border border-white/20 text-white/70 hover:text-white cursor-pointer"
                    >
                      CANCEL
                    </button>
                  </div>
                )}
              </div>
            ) : <div />}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="border border-white/20 text-white/70 hover:border-white hover:text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-4 cursor-pointer transition-colors bg-transparent"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={loading || isDeleting}
                className="bg-[#00A3FF] hover:bg-[#0092e6] text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-6 cursor-pointer transition-colors disabled:opacity-50"
              >
                {loading ? 'SAVING...' : 'UPDATE CONFIGURATION'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
