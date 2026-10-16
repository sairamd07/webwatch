import React, { useState } from 'react';
import { X, Globe, Shield, Bell, Moon } from 'lucide-react';
import { SensitivityLevel } from '../types/index.js';

interface AddPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddPageModal: React.FC<AddPageModalProps> = ({ isOpen, onClose, onSuccess }) => {
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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    try {
      const watched = watchedSelectors
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const ignored = ignoredSelectors
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          name: name.trim() || cleanUrl,
          checkIntervalMinutes: interval,
          sensitivity,
          watchedSelectors: watched,
          ignoredSelectors: ignored,
          notifyEmail: notifyEmail.trim() || undefined,
          notifyDiscordWebhook: notifyDiscordWebhook.trim() || undefined,
          notifyTelegramChatId: notifyTelegramChatId.trim() || undefined,
          quietHoursStart: quietHoursStart.trim() || undefined,
          quietHoursEnd: quietHoursEnd.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to register monitored page');
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
              REGISTER NEW TARGET URL
            </h2>
            <p className="text-[0.68rem] font-mono text-white/40 mt-0.5 uppercase tracking-wider">
              Headless Chromium · Dynamic Noise Normalization · SSRF Filter
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
            [REGISTRATION FAILED] {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Target URL */}
          <div>
            <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
              TARGET URL *
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-white/40 absolute left-3 top-3" />
              <input
                type="text"
                required
                placeholder="https://example.com/pricing"
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  if (!name && e.target.value) {
                    try {
                      setName(new URL(e.target.value.startsWith('http') ? e.target.value : `https://${e.target.value}`).hostname);
                    } catch {
                      // Ignore
                    }
                  }
                }}
                className="w-full pl-9 pr-3 py-2.5 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
              />
            </div>
            <p className="text-[0.62rem] font-mono text-white/40 mt-1 uppercase">
              SSRF SHIELD ACTIVE: Localhost, 127.0.0.1, and private subnet ranges are rejected.
            </p>
          </div>

          {/* Friendly Name */}
          <div>
            <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
              DISPLAY NAME *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Stripe Pricing Tier"
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
              <span>DOM SELECTOR MASKS (OPTIONAL)</span>
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
              <span className="text-[0.58rem] font-mono text-white/40 uppercase mt-0.5 block">
                Leave blank to monitor full page DOM. Can also pick visually with the Region Inspector.
              </span>
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
              <span className="text-[0.58rem] font-mono text-white/40 uppercase mt-0.5 block">
                Elements matching these selectors will be stripped from comparison hash.
              </span>
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
          <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="border border-white/20 text-white/70 hover:border-white hover:text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-4 cursor-pointer transition-colors bg-transparent"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[#FF4D00] hover:bg-[#e04400] text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-6 cursor-pointer transition-colors disabled:opacity-50"
            >
              {loading ? 'INITIALIZING BASELINE...' : '+ START MONITORING'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
