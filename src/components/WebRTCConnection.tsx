import React from 'react';
import {
  Wifi,
  Gauge,
  Activity,
  Server,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { WebRTCTelemetry } from '../types/echolink';

interface WebRTCConnectionProps {
  telemetry: WebRTCTelemetry;
  peerDeviceName: string | null;
  connectionError: string | null;
  onRetryConnection?: () => void;
  onOpenTurnSetup?: () => void;
}

export const WebRTCConnection: React.FC<WebRTCConnectionProps> = ({
  telemetry,
  peerDeviceName,
  connectionError,
  onRetryConnection,
  onOpenTurnSetup,
}) => {
  const getStateLabel = () => {
    switch (telemetry.connectionState) {
      case 'connected':
        return { text: 'WebRTC P2P Connected', color: 'text-emerald-300' };
      case 'connecting':
        return { text: 'ICE Handshake in Progress', color: 'text-cyan-300' };
      case 'failed':
        return { text: 'NAT Traversal Failed', color: 'text-rose-300' };
      case 'disconnected':
        return { text: 'Peer Disconnected', color: 'text-amber-300' };
      default:
        return { text: 'Standby (Awaiting Peer)', color: 'text-slate-400' };
    }
  };

  const statusMeta = getStateLabel();

  return (
    <div className="p-6 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            WebRTC Transport & Link Quality
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono tabular-nums mt-0.5">
            <span className={statusMeta.color}>{statusMeta.text}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">
              {peerDeviceName ? `Peer: ${peerDeviceName}` : 'No Peer Attached'}
            </span>
          </div>
        </div>

        {onRetryConnection &&
          (telemetry.connectionState === 'failed' ||
            telemetry.connectionState === 'disconnected') && (
            <button
              type="button"
              onClick={onRetryConnection}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-violet-600 text-xs font-medium text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Renegotiate ICE</span>
            </button>
          )}
      </div>

      {/* 4-Column Tabular Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-1">
        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/90">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span>Round-Trip Latency</span>
          </div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-slate-100 tabular-nums">
            {telemetry.rttMs !== null ? `${telemetry.rttMs} ms` : '—'}
          </div>
          <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
            Jitter: {telemetry.jitterMs !== null ? `${telemetry.jitterMs} ms` : '—'}
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/90">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Activity className="w-3.5 h-3.5 text-violet-400" />
            <span>Opus Audio Bitrate</span>
          </div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-slate-100 tabular-nums">
            {telemetry.bitrateKbps !== null ? `${telemetry.bitrateKbps} kbps` : '—'}
          </div>
          <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
            48 kHz Stereo Opus
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/90">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Packets / Loss</span>
          </div>
          <div className="mt-1.5 font-mono text-lg font-semibold text-slate-100 tabular-nums">
            {telemetry.packetsSentOrReceived}
          </div>
          <div className="text-[11px] font-mono text-slate-400 tabular-nums mt-0.5">
            Lost: {telemetry.packetsLost} pkts
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/90">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Server className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>ICE Route</span>
          </div>
          <div className="mt-1.5 font-mono text-sm font-semibold text-slate-100 truncate">
            {telemetry.candidateType || 'STUN Standby'}
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
            {telemetry.usingTurnRelay ? 'TURN Relay Active' : 'Direct P2P / STUN'}
          </div>
        </div>
      </div>

      {/* Useful Error & NAT / TURN Relay Notice */}
      {connectionError && (
        <div className="p-3.5 rounded-xl bg-rose-950/75 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">WebRTC Connectivity Issue</div>
            <p className="text-rose-200/90 leading-relaxed">{connectionError}</p>
            {onOpenTurnSetup && (
              <button
                type="button"
                onClick={onOpenTurnSetup}
                className="mt-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200 underline"
              >
                Configure TURN Relay Fallback for Strict Cellular / Symmetric NATs
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
