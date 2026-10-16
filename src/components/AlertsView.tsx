import React, { useState, useEffect } from 'react';
import { Bell, Send, CheckCircle, AlertTriangle, Moon, ShieldCheck, RefreshCw, Radio, Trash2 } from 'lucide-react';
import { AlertNotification, AlertChannel } from '../types/index.js';

export const AlertsView: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Test notification panel state
  const [testChannel, setTestChannel] = useState<AlertChannel>('discord');
  const [testDestination, setTestDestination] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/alerts?limit=50');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load alert logs');
      setAlerts(data.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClearAlerts = async () => {
    try {
      setClearing(true);
      await fetch('/api/alerts', { method: 'DELETE' });
      setAlerts([]);
      setConfirmClearLogs(false);
    } catch {
      // Ignore
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testDestination.trim()) return;

    try {
      setTesting(true);
      setTestResult(null);
      const res = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: testChannel,
          destination: testDestination.trim(),
        }),
      });

      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || (data.success ? 'Test alert sent successfully!' : data.error || 'Test failed'),
      });

      if (data.success) {
        fetchAlerts();
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  const renderStatus = (status: AlertNotification['status']) => {
    switch (status) {
      case 'SENT':
        return (
          <span className="font-mono text-[0.68rem] text-[#00FF94] font-bold">
            [DELIVERED]
          </span>
        );
      case 'SUPPRESSED_QUIET_HOURS':
        return (
          <span className="font-mono text-[0.68rem] text-[#00A3FF] font-bold">
            [HELD / QUIET HOURS]
          </span>
        );
      case 'FAILED':
        return (
          <span className="font-mono text-[0.68rem] text-[#FF4D00] font-bold">
            [FAILED]
          </span>
        );
      case 'DEDUPLICATED':
        return (
          <span className="font-mono text-[0.68rem] text-white/40">
            [DEDUPLICATED]
          </span>
        );
      case 'QUEUED_FOR_DIGEST':
        return (
          <span className="font-mono text-[0.68rem] text-purple-400 font-bold">
            [QUEUED DIGEST]
          </span>
        );
      case 'SKIPPED_UNCONFIGURED':
        return (
          <span className="font-mono text-[0.68rem] text-amber-400 font-bold">
            [UNCONFIGURED]
          </span>
        );
    }
  };

  const handleSendDailyDigest = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await fetch('/api/alerts/digest', { method: 'POST' });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || 'Daily digest processed successfully.',
      });
      fetchAlerts();
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Integrations Card */}
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h3 className="text-base font-mono font-bold text-[#F8F7F4] uppercase tracking-tight">
              LIVE NOTIFICATION DISPATCHER & DAILY DIGEST
            </h3>
            <p className="text-xs text-white/50 font-mono mt-1">
              Test Discord webhooks, Telegram bot tokens, or SMTP relay delivery with persistent idempotency.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSendDailyDigest}
            disabled={testing}
            className="border border-white text-white hover:bg-white hover:text-black font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-2.5 px-4 cursor-pointer transition-colors shrink-0 disabled:opacity-50"
            title="Compile and dispatch the 24-hour change digest to all configured channels"
          >
            <span>TRIGGER DAILY DIGEST NOW</span>
          </button>
        </div>

        <form onSubmit={handleSendTest} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-3">
            <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
              CHANNEL
            </label>
            <select
              value={testChannel}
              onChange={e => setTestChannel(e.target.value as AlertChannel)}
              className="w-full px-3 py-2.5 text-xs font-mono uppercase bg-[#111113] border border-white/15 text-[#F8F7F4] focus:outline-hidden focus:border-white"
            >
              <option value="discord" className="bg-[#111113]">DISCORD WEBHOOK</option>
              <option value="telegram" className="bg-[#111113]">TELEGRAM CHAT</option>
              <option value="email" className="bg-[#111113]">EMAIL (SMTP)</option>
            </select>
          </div>

          <div className="sm:col-span-7">
            <label className="block text-[0.65rem] font-mono uppercase tracking-wider text-white/60 mb-1.5">
              DESTINATION ({testChannel === 'discord' ? 'WEBHOOK URL' : testChannel === 'telegram' ? 'CHAT ID' : 'EMAIL ADDRESS'})
            </label>
            <input
              type="text"
              required
              placeholder={
                testChannel === 'discord'
                  ? 'https://discord.com/api/webhooks/...'
                  : testChannel === 'telegram'
                  ? 'e.g. 123456789'
                  : 'alerts@yourdomain.com'
              }
              value={testDestination}
              onChange={e => setTestDestination(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs font-mono bg-[#111113] border border-white/15 text-[#F8F7F4] placeholder:text-white/30 focus:outline-hidden focus:border-white"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={testing || !testDestination.trim()}
              className="w-full bg-[#FF4D00] hover:bg-[#e04400] text-white font-mono text-[0.65rem] uppercase tracking-[0.15em] font-bold py-3 px-4 cursor-pointer transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testing ? 'SENDING...' : 'DISPATCH'}</span>
            </button>
          </div>
        </form>

        {testResult && (
          <div
            className={`p-3.5 border font-mono text-xs flex items-center gap-2.5 ${
              testResult.success
                ? 'bg-[#0a2419] border-[#00FF94] text-[#00FF94]'
                : 'bg-[#2a150c] border-[#FF4D00] text-[#FF4D00]'
            }`}
          >
            {testResult.success ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Alerts Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-[#FF4D00]" />
            <h3 className="text-xs font-mono font-bold text-[#F8F7F4] uppercase tracking-wider">
              ALERT NOTIFICATION LOGS
            </h3>
            <span className="text-[0.65rem] font-mono text-white/40">({alerts.length} RECORDS)</span>
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              !confirmClearLogs ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearLogs(true)}
                  disabled={loading || clearing}
                  className="flex items-center gap-1.5 text-[0.62rem] font-mono uppercase tracking-wider text-white/50 hover:text-[#FF4D00] px-2.5 py-1 border border-white/10 hover:border-[#FF4D00]/40 cursor-pointer transition-colors"
                  title="Clear all recorded alert logs"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>CLEAR LOGS</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.6rem] font-mono text-[#FF4D00] font-bold">CLEAR ALL?</span>
                  <button
                    type="button"
                    onClick={handleClearAlerts}
                    disabled={clearing}
                    className="px-2 py-0.5 text-[0.6rem] font-mono uppercase bg-[#FF4D00] text-white font-bold cursor-pointer hover:bg-[#e04400]"
                  >
                    {clearing ? '...' : 'YES'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearLogs(false)}
                    disabled={clearing}
                    className="px-2 py-0.5 text-[0.6rem] font-mono uppercase border border-white/20 text-white/70 hover:text-white cursor-pointer"
                  >
                    NO
                  </button>
                </div>
              )
            )}
            <button
              type="button"
              onClick={fetchAlerts}
              disabled={loading}
              className="flex items-center gap-1.5 text-[0.65rem] font-mono uppercase tracking-wider text-white/60 hover:text-white px-2.5 py-1 border border-white/10 hover:border-white/30 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>REFRESH</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-[#2a150c] border-b border-[#FF4D00] text-[#FF4D00] font-mono text-xs">
            {error}
          </div>
        )}

        {alerts.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="text-3xl font-mono text-white/20 mb-2">[NO ALERTS]</div>
            <p className="text-xs font-mono uppercase text-white/80 tracking-wider">No Dispatched Alerts Yet</p>
            <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto font-mono">
              When a monitored page changes meaningfully, notifications sent to Discord, Telegram, or Email appear here with delivery receipts and idempotency keys.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#111113] border-b border-white/10 text-white/50 font-mono uppercase tracking-wider text-[0.62rem]">
                  <th className="py-3 px-4">PAGE & TARGET</th>
                  <th className="py-3 px-4">CHANNEL</th>
                  <th className="py-3 px-4">DESTINATION</th>
                  <th className="py-3 px-4">STATUS</th>
                  <th className="py-3 px-4">CHANGE SUMMARY</th>
                  <th className="py-3 px-4">SENT AT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80 font-mono text-[0.7rem]">
                {alerts.map(alert => (
                  <tr key={alert.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#F8F7F4]">{alert.pageName}</div>
                      <div className="text-white/40 text-[0.62rem] truncate max-w-xs">{alert.pageUrl}</div>
                    </td>
                    <td className="py-3 px-4 uppercase text-[0.68rem] text-white/90">
                      {alert.channel}
                    </td>
                    <td className="py-3 px-4 text-white/50 truncate max-w-xs text-[0.65rem]">
                      {alert.destination}
                    </td>
                    <td className="py-3 px-4">
                      {renderStatus(alert.status)}
                    </td>
                    <td className="py-3 px-4 max-w-md font-sans text-xs text-white/80">
                      <div className="line-clamp-2">{alert.message}</div>
                      {alert.error && (
                        <div className="text-[#FF4D00] text-[0.62rem] font-mono mt-0.5">{alert.error}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-white/40 text-[0.65rem]">
                      {new Date(alert.sentAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
