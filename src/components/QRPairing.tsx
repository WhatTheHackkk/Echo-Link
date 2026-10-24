import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, QrCode, Infinity as InfinityIcon, Shield, RefreshCw } from 'lucide-react';
import { EchoLinkSession } from '../types/echolink';

interface QRPairingProps {
  session: EchoLinkSession | null;
  appUrl: string;
  onCreateSession: () => void;
}

export const QRPairing: React.FC<QRPairingProps> = ({
  session,
  appUrl,
  onCreateSession,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const baseUrl = (appUrl || window.location.origin).replace(/\/$/, '');
  const joinUrl = session
    ? `${baseUrl}/?join=${encodeURIComponent(session.sessionId)}&code=${encodeURIComponent(
        session.pairingCode
      )}&token=${encodeURIComponent(session.sessionToken)}`
    : '';

  const handleCopyCode = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.pairingCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // fallback ignored
    }
  };

  const handleCopyUrl = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // fallback ignored
    }
  };

  if (!session) {
    return (
      <div className="p-6 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80 flex flex-col items-center justify-center text-center min-h-[300px]">
        <div className="w-12 h-12 rounded-2xl bg-violet-950/80 border border-violet-500/40 flex items-center justify-center text-violet-300 mb-3">
          <QrCode className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-100">
          No Active Pairing Session
        </h3>
        <p className="text-xs text-slate-400 max-w-xs mt-1.5 leading-relaxed">
          Create a persistent encrypted session to generate a unique QR code and 6-character pairing code for your phone.
        </p>
        <button
          type="button"
          onClick={onCreateSession}
          className="mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-semibold tracking-wide transition-all shadow-[0_0_24px_rgba(139,92,246,0.35)] whitespace-nowrap shrink-0"
        >
          Create Audio Session
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80">
      <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            Phone QR & Code Pairing
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Scan with your phone camera or enter the 6-character code
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-300 tabular-nums shrink-0">
          <InfinityIcon className="w-3.5 h-3.5 text-cyan-400" />
          <span>Persistent · Never Expires</span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-center">
        {/* Real QR Code Box */}
        <div className="mx-auto sm:mx-0 p-3.5 rounded-2xl bg-white shadow-[0_0_30px_rgba(6,182,212,0.18)] border border-cyan-400/40 flex flex-col items-center">
          <QRCodeSVG
            value={joinUrl}
            size={156}
            bgColor="#FFFFFF"
            fgColor="#06070B"
            level="M"
            includeMargin={false}
          />
          <span className="mt-2 text-[10px] font-mono font-semibold text-slate-900 tracking-tight">
            SCAN WITH PHONE CAMERA
          </span>
        </div>

        {/* Manual Code & Session Info */}
        <div className="space-y-4">
          <div>
            <div className="text-xs text-slate-400 mb-1.5">
              Manual Pairing Code (Alternative to QR)
            </div>
            <div className="flex items-center gap-2">
              <div className="px-4 py-2.5 rounded-xl bg-slate-900/95 border border-violet-500/40 font-mono text-xl font-semibold tracking-[0.22em] text-cyan-300 tabular-nums select-all">
                {session.pairingCode}
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-1.5">Direct Session Join Link</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={joinUrl}
                className="w-full min-w-0 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-3 py-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Unboxed Security Metadata */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <Shield className="w-3.5 h-3.5 text-violet-400" />
              <span>Session {session.sessionId.slice(0, 11)}</span>
              <span aria-hidden="true">·</span>
              <span>Token Verified</span>
            </div>
            <button
              type="button"
              onClick={onCreateSession}
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Rotate Session Key</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
