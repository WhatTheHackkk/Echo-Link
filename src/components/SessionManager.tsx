import React from 'react';
import {
  Radio,
  PlusCircle,
  PowerOff,
  CheckCircle2,
  XCircle,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';
import { EchoLinkSession, PairingRequest } from '../types/echolink';

interface SessionManagerProps {
  session: EchoLinkSession | null;
  pendingRequests: PairingRequest[];
  connectedPeerCount: number;
  isStreaming: boolean;
  onCreateSession: () => void;
  onEndSession: () => void;
  onAcceptPairing: (req: PairingRequest) => void;
  onRejectPairing: (req: PairingRequest) => void;
}

export const SessionManager: React.FC<SessionManagerProps> = ({
  session,
  pendingRequests,
  connectedPeerCount,
  isStreaming,
  onCreateSession,
  onEndSession,
  onAcceptPairing,
  onRejectPairing,
}) => {
  return (
    <div className="p-5 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              isStreaming
                ? 'bg-cyan-950/90 border-cyan-400 text-cyan-300'
                : session
                ? 'bg-violet-950/90 border-violet-500/50 text-violet-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100 tracking-tight">
              {session ? 'Active Audio Session' : 'Session Control Center'}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums mt-0.5">
              {session ? (
                <>
                  <span className="text-emerald-300">Session Ready</span>
                  <span aria-hidden="true">·</span>
                  <span>Code {session.pairingCode}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {connectedPeerCount} {connectedPeerCount === 1 ? 'Phone Connected' : 'Phones Connected'}
                  </span>
                </>
              ) : (
                <span>No active session · Create one to pair your phone</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {!session ? (
            <button
              type="button"
              onClick={onCreateSession}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Audio Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onEndSession}
              className="px-4 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <PowerOff className="w-3.5 h-3.5" />
              <span>Disconnect & End Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Incoming Pairing Approval Banner */}
      {pendingRequests.length > 0 && (
        <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-300">
            <ShieldAlert className="w-4 h-4" />
            <span>Incoming Phone Pairing Request</span>
          </div>
          {pendingRequests.map((req) => (
            <div
              key={req.requestId}
              className="p-3.5 rounded-xl bg-slate-900/95 border border-fuchsia-500/40 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-950/90 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-300">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    {req.fromDeviceName}
                  </div>
                  <div className="text-xs font-mono text-slate-400 tabular-nums">
                    {req.fromPlatform} · Code {req.pairingCode}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAcceptPairing(req)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Accept Connection</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRejectPairing(req)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-200 text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Decline</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
