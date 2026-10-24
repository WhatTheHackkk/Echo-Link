import React, { useState } from 'react';
import {
  Monitor,
  Smartphone,
  Edit3,
  Check,
  ArrowUpRight,
  Link2,
  Volume2,
  ShieldCheck,
} from 'lucide-react';
import { EchoLinkDevice } from '../types/echolink';

interface DeviceListProps {
  localDevice: EchoLinkDevice;
  devices: EchoLinkDevice[];
  activeSessionId: string | null;
  connectedPeerIds: string[];
  onRenameLocalDevice: (newName: string) => void;
  onSelectDevice: (device: EchoLinkDevice) => void;
}

export const DeviceList: React.FC<DeviceListProps> = ({
  localDevice,
  devices,
  activeSessionId,
  connectedPeerIds,
  onRenameLocalDevice,
  onSelectDevice,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(localDevice.deviceName);
  const [roleFilter, setRoleFilter] = useState<'all' | 'pc-transmitter' | 'mobile-receiver'>('all');

  const otherDevices = devices.filter((d) => {
    if (d.deviceId === localDevice.deviceId) return false;
    if (roleFilter === 'all') return true;
    return d.role === roleFilter;
  });

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (trimmed) {
      onRenameLocalDevice(trimmed);
    }
    setIsEditingName(false);
  };

  const getStatusLabel = (device: EchoLinkDevice) => {
    const isLinked =
      connectedPeerIds.includes(device.deviceId) ||
      (activeSessionId !== null && device.sessionId === activeSessionId);

    if (device.isStreamingAudio) return { text: 'Streaming Audio', color: 'text-cyan-300' };
    if (isLinked) return { text: 'Connected to Session', color: 'text-emerald-300' };
    if (device.status === 'pairing') return { text: 'Pairing Requested', color: 'text-fuchsia-300' };
    if (device.status === 'disconnected') return { text: 'Disconnected', color: 'text-slate-500' };
    return { text: 'Online', color: 'text-slate-300' };
  };

  return (
    <div className="p-6 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80 flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100 tracking-tight">
              Discovered EchoLink Sessions & Devices
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any active session node to request pairing or inspect link state
            </p>
          </div>

          {/* Interactive Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-slate-900/90 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === 'all'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({devices.length - 1 >= 0 ? devices.length - 1 : 0})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('pc-transmitter')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === 'pc-transmitter'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              PC Hosts
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('mobile-receiver')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === 'mobile-receiver'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Phones
            </button>
          </div>
        </div>

        {/* Local Device Identity Row */}
        <div className="py-3.5 border-b border-slate-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-violet-950/80 border border-violet-500/40 flex items-center justify-center text-violet-300 shrink-0">
              {localDevice.role === 'pc-transmitter' ? (
                <Monitor className="w-4 h-4" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              {isEditingName ? (
                <form onSubmit={handleSaveName} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={36}
                    autoFocus
                    className="px-2.5 py-1 text-xs bg-slate-900 border border-violet-500/60 rounded-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                  <button
                    type="submit"
                    className="p-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                    title="Save Device Name"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-100 truncate">
                    {localDevice.deviceName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(localDevice.deviceName);
                      setIsEditingName(true);
                    }}
                    className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                    title="Edit your device name"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
                <span>This Device</span>
                <span aria-hidden="true">·</span>
                <span>{localDevice.platform}</span>
                <span aria-hidden="true">·</span>
                <span>ID {localDevice.deviceId.slice(-6)}</span>
              </div>
            </div>
          </div>

          <div className="text-xs font-mono text-cyan-300 shrink-0 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Announced</span>
          </div>
        </div>

        {/* Peer Devices Table / List */}
        <div className="divide-y divide-slate-800/60 max-h-[260px] overflow-y-auto">
          {otherDevices.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-300 font-medium">
                No other EchoLink browsers detected yet
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Scan the session QR code on your phone or open this URL in another browser window to see live presence discovery.
              </p>
            </div>
          ) : (
            otherDevices.map((peer) => {
              const statusMeta = getStatusLabel(peer);
              const isLinked =
                connectedPeerIds.includes(peer.deviceId) ||
                (activeSessionId !== null && peer.sessionId === activeSessionId);

              return (
                <div
                  key={peer.deviceId}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-slate-900/40 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                        isLinked
                          ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-900 border-slate-700/80 text-slate-300'
                      }`}
                    >
                      {peer.role === 'mobile-receiver' ? (
                        <Smartphone className="w-4 h-4" />
                      ) : (
                        <Monitor className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">
                        {peer.deviceName}
                      </div>
                      {/* Zero-Pill Unboxed Metadata */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 font-mono tabular-nums">
                        <span className={statusMeta.color}>{statusMeta.text}</span>
                        <span aria-hidden="true">·</span>
                        <span>{peer.platform}</span>
                        {peer.pairingCode && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-violet-300">Code {peer.pairingCode}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectDevice(peer)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isLinked
                        ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/40'
                        : 'bg-slate-800/90 hover:bg-violet-600 text-slate-200 hover:text-white'
                    }`}
                  >
                    {peer.isStreamingAudio ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Listen</span>
                      </>
                    ) : isLinked ? (
                      <>
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Paired</span>
                      </>
                    ) : (
                      <>
                        <span>Pair Device</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
