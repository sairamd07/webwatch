import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle, AlertTriangle, Download, ArrowRight } from 'lucide-react';
import { MonitoredPage } from '../types/index.js';

interface ImportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ImportConfigModal: React.FC<ImportConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [jsonText, setJsonText] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<any[] | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      setJsonText(content);
      parsePreview(content);
    };
    reader.readAsText(file);
  };

  const parsePreview = (text: string) => {
    setError(null);
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.pages;
      if (!Array.isArray(list)) {
        setError('JSON structure must be an array of page configurations or an object with a "pages" array.');
        setParsedPreview(null);
        return;
      }
      setParsedPreview(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid JSON format');
      setParsedPreview(null);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonText(text);
    if (text.trim().length > 0) {
      parsePreview(text);
    } else {
      setParsedPreview(null);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!parsedPreview || parsedPreview.length === 0) {
      setError('Please provide valid JSON configurations to import.');
      return;
    }

    try {
      setImporting(true);
      setError(null);

      const res = await fetch('/api/pages/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: parsedPreview }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to import configurations');
      }

      onSuccess(data.message || `Successfully imported ${data.importedCount} configuration(s).`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-[#161619] border border-white/20 text-[#F8F7F4] shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-2.5">
            <Upload className="w-5 h-5 text-[#FF4D00]" />
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider">
              IMPORT MONITORING CONFIGURATIONS
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors cursor-pointer p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 bg-[#2a150c] border border-[#FF4D00] text-[#FF4D00] font-mono text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 font-mono text-xs">
          {/* File Picker */}
          <div>
            <label className="block text-[0.65rem] text-white/50 uppercase tracking-wider mb-2">
              UPLOAD CONFIGURATION JSON FILE (.JSON)
            </label>
            <div className="border border-dashed border-white/20 p-4 text-center hover:border-white/40 transition-colors bg-[#111113]">
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
                id="file-import-input"
              />
              <label
                htmlFor="file-import-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <Upload className="w-6 h-6 text-white/40" />
                <span className="text-[0.65rem] uppercase tracking-widest text-white/70">
                  CLICK TO SELECT JSON BACKUP FILE
                </span>
                <span className="text-[0.6rem] text-white/30 font-sans">
                  Accepts files generated via Export Config
                </span>
              </label>
            </div>
          </div>

          {/* Direct Textarea */}
          <div>
            <label className="block text-[0.65rem] text-white/50 uppercase tracking-wider mb-1.5">
              OR PASTE CONFIGURATION JSON DIRECTLY
            </label>
            <textarea
              rows={6}
              value={jsonText}
              onChange={handleTextChange}
              placeholder='[ { "name": "Company Pricing", "url": "https://example.com/pricing", "checkIntervalMinutes": 60, "sensitivity": "medium" } ]'
              className="w-full bg-[#111113] p-3 font-mono text-xs border border-white/15 text-[#F8F7F4] placeholder:text-white/20 focus:outline-hidden focus:border-white"
            />
          </div>

          {/* Preview Section */}
          {parsedPreview && (
            <div className="border border-white/15 bg-[#111113] p-3 space-y-2">
              <div className="flex items-center justify-between text-[0.65rem] text-[#00FF94] font-bold uppercase tracking-wider pb-1.5 border-b border-white/10">
                <span>DETECTED CONFIGURATIONS ({parsedPreview.length})</span>
                <span className="text-white/40">READY TO IMPORT</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {parsedPreview.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-[#161619] border border-white/10 flex items-center justify-between text-[0.65rem]"
                  >
                    <div className="truncate pr-2">
                      <div className="font-bold text-white truncate">{item.name || 'Untitled Target'}</div>
                      <div className="text-white/40 truncate text-[0.6rem]">{item.url}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-white/50 text-[0.6rem]">
                      <span className="border border-white/15 px-1.5 py-0.5 uppercase">
                        {item.sensitivity || 'med'}
                      </span>
                      <span>{item.checkIntervalMinutes || 60}m</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2.5 text-[0.65rem] uppercase tracking-[0.15em] border border-white/20 text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || !parsedPreview || parsedPreview.length === 0}
              className="px-5 py-2.5 bg-[#FF4D00] text-white text-[0.65rem] uppercase tracking-[0.15em] font-bold hover:bg-[#e04400] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing ? (
                <span>VALIDATING & IMPORTING...</span>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>IMPORT {parsedPreview?.length || 0} CONFIGURATION(S)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
