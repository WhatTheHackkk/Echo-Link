import React, { useState } from 'react';
import {
  Volume2,
  Square,
  MonitorSpeaker,
  Music,
  Mic,
  AlertTriangle,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { AudioCaptureSourceType } from '../types/echolink';

interface AudioCaptureProps {
  isStreaming: boolean;
  activeSourceType: AudioCaptureSourceType;
  activeSourceLabel: string;
  captureError: string | null;
  onStartCapture: (sourceType: AudioCaptureSourceType) => Promise<void>;
  onStopCapture: () => void;
}

export const AudioCapture: React.FC<AudioCaptureProps> = ({
  isStreaming,
  activeSourceType,
  activeSourceLabel,
  captureError,
  onStartCapture,
  onStopCapture,
}) => {
  const [selectedSource, setSelectedSource] =
    useState<AudioCaptureSourceType>('display-media');
  const [isRequesting, setIsRequesting] = useState(false);

  const handleStart = async () => {
    setIsRequesting(true);
    try {
      await onStartCapture(selectedSource);
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            PC Audio Capture & Source Routing
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Capture tab, window, or system loopback audio and stream directly over WebRTC
          </p>
        </div>

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 shrink-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>LIVE CAPTURE ACTIVE</span>
          </div>
        )}
      </div>

      {/* Source Mode Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          disabled={isStreaming}
          onClick={() => setSelectedSource('display-media')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            selectedSource === 'display-media'
              ? 'bg-violet-950/60 border-violet-400/70 text-slate-100'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          } ${isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-100">
            <MonitorSpeaker className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Tab or System Audio</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
            Uses browser Screen/Tab Share API with "Also share audio" enabled.
          </p>
        </button>

        <button
          type="button"
          disabled={isStreaming}
          onClick={() => setSelectedSource('synth-test-tone')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            selectedSource === 'synth-test-tone'
              ? 'bg-violet-950/60 border-violet-400/70 text-slate-100'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          } ${isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-100">
            <Music className="w-4 h-4 text-violet-400 shrink-0" />
            <span>Studio Reference Synth</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
            Generates a real-time Web Audio harmonic test stream to verify headphone latency.
          </p>
        </button>

        <button
          type="button"
          disabled={isStreaming}
          onClick={() => setSelectedSource('microphone-explicit')}
          className={`p-3.5 rounded-xl border text-left transition-all ${
            selectedSource === 'microphone-explicit'
              ? 'bg-violet-950/60 border-violet-400/70 text-slate-100'
              : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
          } ${isStreaming ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center gap-2 font-semibold text-xs text-slate-100">
            <Mic className="w-4 h-4 text-fuchsia-400 shrink-0" />
            <span>Aux / Line-In / Mic</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-snug">
            Explicit opt-in audio input capture for virtual audio cables or line-in feeds.
          </p>
        </button>
      </div>

      {/* Browser & OS Audio Capture Capability Notice */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1.5">
        <div className="flex items-center gap-2 font-medium text-slate-200">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Browser & Operating System Audio Capture Capabilities</span>
        </div>
        <p className="text-slate-400 leading-relaxed">
          Web browsers enforce strict sandboxing for audio capture:
          {' '}
          <strong className="text-slate-200">Chrome / Edge on Windows & ChromeOS</strong> support both browser tab audio and full system audio when sharing your entire screen with <em>"Also share system audio"</em> checked.
          {' '}
          <strong className="text-slate-200">Chrome / Edge on macOS & Linux</strong> provide high-quality browser tab audio capture. Always check the <em>"Also share tab audio"</em> toggle in the browser prompt.
        </p>
      </div>

      {/* Error Notice */}
      {captureError && (
        <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Audio Capture Could Not Start</div>
            <p className="mt-0.5 text-rose-200/90 leading-relaxed">{captureError}</p>
          </div>
        </div>
      )}

      {/* Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div className="text-xs text-slate-400 font-mono tabular-nums flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          {isStreaming ? (
            <span className="text-cyan-300">
              Streaming: {activeSourceLabel} ({activeSourceType})
            </span>
          ) : (
            <span>Zero server recording · Direct peer-to-peer WebRTC transport</span>
          )}
        </div>

        {!isStreaming ? (
          <button
            type="button"
            disabled={isRequesting}
            onClick={handleStart}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-[0_0_24px_rgba(6,182,212,0.35)] whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Volume2 className="w-4 h-4" />
            <span>{isRequesting ? 'Requesting Permission...' : 'Start Audio Capture'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStopCapture}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-[0_0_20px_rgba(225,29,72,0.4)] whitespace-nowrap shrink-0"
          >
            <Square className="w-4 h-4" />
            <span>Stop Streaming</span>
          </button>
        )}
      </div>
    </div>
  );
};
