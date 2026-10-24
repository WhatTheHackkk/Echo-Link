import React, { useMemo } from 'react';
import { Monitor, Smartphone, Radio, Volume2, Link2 } from 'lucide-react';
import { EchoLinkDevice } from '../types/echolink';

interface DeviceRadarProps {
  localDevice: EchoLinkDevice;
  devices: EchoLinkDevice[];
  activeSessionId: string | null;
  connectedPeerIds: string[];
  isStreaming: boolean;
  onSelectDevice: (device: EchoLinkDevice) => void;
}

// Deterministic polar coordinate hash per deviceId so nodes stay stable on the radar
function computePolarPosition(deviceId: string, index: number, total: number) {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = (hash << 5) - hash + deviceId.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  // Distribute angles cleanly around the circle
  const baseAngle = (index / Math.max(total, 1)) * 360;
  const jitterAngle = (absHash % 36) - 18;
  const angleDeg = (baseAngle + jitterAngle + 360) % 360;
  const angleRad = (angleDeg * Math.PI) / 180;

  // Radius between 28% and 42% of container width
  const radiusPct = 28 + (absHash % 14);
  const xPct = 50 + radiusPct * Math.cos(angleRad);
  const yPct = 50 + radiusPct * Math.sin(angleRad);

  return { xPct, yPct, angleDeg, radiusPct };
}

export const DeviceRadar: React.FC<DeviceRadarProps> = ({
  localDevice,
  devices,
  activeSessionId,
  connectedPeerIds,
  isStreaming,
  onSelectDevice,
}) => {
  const peerDevices = useMemo(
    () => devices.filter((d) => d.deviceId !== localDevice.deviceId),
    [devices, localDevice.deviceId]
  );

  const positionedPeers = useMemo(
    () =>
      peerDevices.map((device, idx) => ({
        device,
        ...computePolarPosition(device.deviceId, idx, peerDevices.length),
      })),
    [peerDevices]
  );

  return (
    <div className="relative flex flex-col items-center justify-center p-6 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80 overflow-hidden">
      {/* Subtle Ambient Glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: isStreaming
            ? 'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.22), rgba(139, 92, 246, 0.1) 55%, transparent 75%)'
            : 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.16), rgba(6, 182, 212, 0.06) 55%, transparent 75%)',
        }}
      />

      {/* Header bar inside radar panel */}
      <div className="relative z-10 w-full flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            EchoLink Acoustic Radar
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Active participants announced in the current EchoLink signaling lobby
          </p>
        </div>
        <div className="text-right font-mono text-xs text-slate-400 tabular-nums shrink-0">
          <span>{peerDevices.length}</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span>{peerDevices.length === 1 ? 'Peer Visible' : 'Peers Visible'}</span>
        </div>
      </div>

      {/* Circular Radar Viewport */}
      <div className="relative w-full max-w-[340px] aspect-square my-2 flex items-center justify-center select-none">
        {/* Concentric rings */}
        <div className="absolute inset-0 rounded-full border border-slate-800/90" />
        <div className="absolute inset-[16%] rounded-full border border-slate-800/75 border-dashed" />
        <div className="absolute inset-[32%] rounded-full border border-slate-800/80" />
        <div className="absolute inset-[48%] rounded-full border border-violet-500/20" />

        {/* Crosshair axes */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-slate-800/90 to-transparent" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-slate-800/90 to-transparent" />

        {/* Rotating Radar Sweep */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full animate-radar-sweep"
          style={{
            background:
              'conic-gradient(from 0deg at 50% 50%, rgba(6, 182, 212, 0.24) 0deg, rgba(139, 92, 246, 0.08) 45deg, transparent 95deg, transparent 360deg)',
          }}
        />

        {/* Active Streaming Sonar Ripple */}
        {isStreaming && (
          <div className="pointer-events-none absolute inset-[12%] rounded-full border border-cyan-400/40 animate-sonar-ripple" />
        )}

        {/* SVG Connection Vector Lines from Center Host to Connected Peers */}
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="echolink-beam" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          {positionedPeers.map(({ device, xPct, yPct }) => {
            const isPeerConnected =
              connectedPeerIds.includes(device.deviceId) ||
              (activeSessionId && device.sessionId === activeSessionId);
            if (!isPeerConnected) return null;
            return (
              <g key={`beam-${device.deviceId}`}>
                <line
                  x1="50"
                  y1="50"
                  x2={xPct}
                  y2={yPct}
                  stroke="url(#echolink-beam)"
                  strokeWidth={isStreaming ? '0.9' : '0.55'}
                  strokeDasharray={isStreaming ? 'none' : '2 1.5'}
                />
              </g>
            );
          })}
        </svg>

        {/* Center Node: Local Device */}
        <div className="relative z-20 flex flex-col items-center">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-150 border ${
              isStreaming
                ? 'bg-cyan-950/90 border-cyan-400 text-cyan-300 shadow-[0_0_30px_rgba(6,182,212,0.45)]'
                : 'bg-violet-950/90 border-violet-400/80 text-violet-200 shadow-[0_0_24px_rgba(139,92,246,0.35)]'
            }`}
          >
            {localDevice.role === 'pc-transmitter' ? (
              <Monitor className="w-6 h-6" />
            ) : (
              <Smartphone className="w-6 h-6" />
            )}
          </div>
          <span className="mt-1.5 text-xs font-medium text-slate-200 max-w-[120px] truncate">
            {localDevice.deviceName} (You)
          </span>
        </div>

        {/* Discovered Peer Nodes */}
        {positionedPeers.map(({ device, xPct, yPct }) => {
          const isConnectedPeer =
            connectedPeerIds.includes(device.deviceId) ||
            (activeSessionId !== null && device.sessionId === activeSessionId);
          const isPairing = device.status === 'pairing';
          const isPeerStreaming = Boolean(device.isStreamingAudio);

          return (
            <button
              key={device.deviceId}
              type="button"
              onClick={() => onSelectDevice(device)}
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="group absolute z-20 flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-xl p-1 transition-transform duration-150 hover:scale-105"
              title={`${device.deviceName} · ${device.platform} · ${device.status}`}
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${
                  isPeerStreaming || (isConnectedPeer && isStreaming)
                    ? 'bg-cyan-950/95 border-cyan-400 text-cyan-200 shadow-[0_0_20px_rgba(6,182,212,0.5)]'
                    : isConnectedPeer
                    ? 'bg-emerald-950/90 border-emerald-400/90 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.35)]'
                    : isPairing
                    ? 'bg-fuchsia-950/90 border-fuchsia-400 text-fuchsia-200'
                    : 'bg-slate-900/95 border-slate-600 text-slate-200 group-hover:border-violet-400'
                }`}
              >
                {device.role === 'mobile-receiver' ? (
                  <Smartphone className="w-5 h-5" />
                ) : (
                  <Monitor className="w-5 h-5" />
                )}
              </div>
              <div className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/90 text-[11px] font-medium text-slate-200 whitespace-nowrap max-w-[110px] truncate">
                {device.deviceName}
              </div>
              <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                {isPeerStreaming ? (
                  <span className="text-cyan-300 flex items-center gap-0.5">
                    <Volume2 className="w-3 h-3" /> Live Audio
                  </span>
                ) : isConnectedPeer ? (
                  <span className="text-emerald-300 flex items-center gap-0.5">
                    <Link2 className="w-3 h-3" /> Linked
                  </span>
                ) : device.pairingCode ? (
                  <span className="text-violet-300">Code {device.pairingCode}</span>
                ) : (
                  <span>{device.status}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Legend & Discovery Clarification */}
      <div className="relative z-10 w-full pt-3 mt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>
            Shows browsers currently open to EchoLink. Open this URL on your phone to appear on radar.
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
          <span>Online</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span className="text-fuchsia-300">Pairing</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span className="text-emerald-300">Connected</span>
          <span className="mx-1.5 text-slate-600">·</span>
          <span className="text-cyan-300">Streaming</span>
        </div>
      </div>
    </div>
  );
};
