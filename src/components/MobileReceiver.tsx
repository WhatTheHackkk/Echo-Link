import React, { useEffect, useRef, useState } from 'react';
import {
  Headphones,
  Volume2,
  VolumeX,
  QrCode,
  Camera,
  X,
  Play,
  PowerOff,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  ArrowRight,
  Radio,
} from 'lucide-react';
import { EchoLinkDevice, WebRTCTelemetry } from '../types/echolink';
import { AudioVisualizer } from './AudioVisualizer';

interface MobileReceiverProps {
  localDevice: EchoLinkDevice;
  discoveredHosts: EchoLinkDevice[];
  initialCode: string;
  connectionStatus: 'idle' | 'pairing' | 'connected' | 'streaming' | 'error';
  connectedHostName: string | null;
  remoteStream: MediaStream | null;
  telemetry: WebRTCTelemetry;
  errorMessage: string | null;
  onJoinByCode: (code: string) => void;
  onJoinHostDevice: (host: EchoLinkDevice) => void;
  onDisconnect: () => void;
}

export const MobileReceiver: React.FC<MobileReceiverProps> = ({
  localDevice,
  discoveredHosts,
  initialCode,
  connectionStatus,
  connectedHostName,
  remoteStream,
  telemetry,
  errorMessage,
  onJoinByCode,
  onJoinHostDevice,
  onDisconnect,
}) => {
  const [pairingCodeInput, setPairingCodeInput] = useState(initialCode || '');
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [needsUserPlayGesture, setNeedsUserPlayGesture] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Camera QR Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerNotice, setScannerNotice] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (initialCode) {
      setPairingCodeInput(initialCode.toUpperCase());
    }
  }, [initialCode]);

  // Attach incoming WebRTC MediaStream to HTMLAudioElement
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      audioEl.srcObject = remoteStream;
      audioEl.volume = volume;
      audioEl.muted = isMuted;

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setNeedsUserPlayGesture(false);
            setIsPlayingAudio(true);
          })
          .catch(() => {
            // Mobile Safari / Chrome autoplay policy blocked unmuted playback without tap
            setNeedsUserPlayGesture(true);
            setIsPlayingAudio(false);
          });
      }
    } else {
      audioEl.srcObject = null;
      setIsPlayingAudio(false);
      setNeedsUserPlayGesture(false);
    }
  }, [remoteStream]);

  const handleManualPlayTap = async () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    try {
      audioEl.muted = false;
      setIsMuted(false);
      await audioEl.play();
      setNeedsUserPlayGesture(false);
      setIsPlayingAudio(true);
    } catch (err) {
      console.error('Audio play gesture failed:', err);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  // Camera QR Scanner Effect using BarcodeDetector where supported
  useEffect(() => {
    if (!scannerOpen) return;
    let stream: MediaStream | null = null;
    let rafId: number;
    let active = true;

    const startCamera = async () => {
      setScannerNotice(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        if (!BarcodeDetectorClass) {
          setScannerNotice(
            'Camera preview active. Your browser does not expose native BarcodeDetector—use your phone’s native Camera app to scan the QR code or enter the 6-character code below.'
          );
          return;
        }

        const detector = new BarcodeDetectorClass({ formats: ['qr_code'] });

        const scanLoop = async () => {
          if (!active || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const rawValue = String(barcodes[0].rawValue || '');
              try {
                const parsedUrl = new URL(rawValue);
                const codeParam = parsedUrl.searchParams.get('code');
                if (codeParam) {
                  setScannerOpen(false);
                  setPairingCodeInput(codeParam.toUpperCase());
                  onJoinByCode(codeParam.toUpperCase());
                  return;
                }
              } catch {
                // If raw QR is a 6-char code directly
                const clean = rawValue.trim().toUpperCase();
                if (clean.length === 6) {
                  setScannerOpen(false);
                  setPairingCodeInput(clean);
                  onJoinByCode(clean);
                  return;
                }
              }
            }
          } catch {
            // continue scanning
          }
          rafId = requestAnimationFrame(scanLoop);
        };

        rafId = requestAnimationFrame(scanLoop);
      } catch (err: any) {
        setScannerNotice(
          err?.message ||
            'Could not access camera. Enter the 6-character pairing code shown on your PC.'
        );
      }
    };

    startCamera();

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [scannerOpen, onJoinByCode]);

  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pairingCodeInput.trim().toUpperCase();
    if (!cleaned) return;
    onJoinByCode(cleaned);
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Hidden / Managed HTML Audio Element for Headphone / AirPods Output */}
      <audio ref={audioRef} playsInline autoPlay className="hidden" />

      {/* Receiver Status Card */}
      <div className="p-6 rounded-3xl bg-[#0B0E17]/95 border border-slate-800/90 shadow-[0_0_40px_rgba(6,182,212,0.08)] space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                connectionStatus === 'streaming'
                  ? 'bg-cyan-950/90 border-cyan-400 text-cyan-300 shadow-[0_0_24px_rgba(6,182,212,0.4)]'
                  : connectionStatus === 'connected'
                  ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                  : 'bg-violet-950/90 border-violet-500/50 text-violet-300'
              }`}
            >
              <Headphones className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">
                Mobile Headphone Receiver
              </h1>
              <div className="text-xs font-mono text-slate-400 tabular-nums">
                {localDevice.deviceName} · AirPods & Bluetooth Ready
              </div>
            </div>
          </div>

          {(connectionStatus === 'connected' ||
            connectionStatus === 'streaming' ||
            connectionStatus === 'pairing') && (
            <button
              type="button"
              onClick={onDisconnect}
              className="min-h-[44px] px-4 rounded-xl bg-rose-950/90 hover:bg-rose-900 border border-rose-500/40 text-xs font-semibold text-rose-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <PowerOff className="w-4 h-4" />
              <span>Disconnect</span>
            </button>
          )}
        </div>

        {/* Autoplay Unblock Prompt for Mobile Safari / iOS / Android */}
        {needsUserPlayGesture && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/90 to-violet-950/90 border border-cyan-400/60 space-y-3">
            <div className="text-xs text-cyan-100 font-medium">
              Incoming PC audio stream is ready. Mobile browsers require a single tap to unlock headphone audio output:
            </div>
            <button
              type="button"
              onClick={handleManualPlayTap}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.5)] active:scale-[0.99] transition-transform"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Tap to Start Listening</span>
            </button>
          </div>
        )}

        {/* Error Display */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-950/75 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Pairing or Connection Notice</div>
              <p className="mt-0.5 text-rose-200/90">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Connected / Streaming Playback View */}
        {connectionStatus === 'connected' || connectionStatus === 'streaming' ? (
          <div className="space-y-5 pt-2">
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    Linked to {connectedHostName || 'PC Host'}
                  </div>
                  <div className="text-xs font-mono text-slate-400 tabular-nums">
                    {remoteStream && isPlayingAudio
                      ? 'Playing live WebRTC audio to your phone output'
                      : 'Waiting for PC host to click "Start Audio Capture"...'}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono text-xs text-cyan-300 tabular-nums">
                {telemetry.rttMs !== null ? `${telemetry.rttMs} ms` : 'Live'}
              </div>
            </div>

            {/* Live Incoming Audio Visualizer */}
            <AudioVisualizer
              stream={remoteStream}
              isStreaming={Boolean(remoteStream && remoteStream.getAudioTracks().length > 0)}
              label="Incoming Headphone Stream"
            />

            {/* Volume & Output Controls */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Stream Gain & Mute Control
                </span>
                <span className="text-xs font-mono text-cyan-300 tabular-nums">
                  {isMuted ? 'Muted' : `${Math.round(volume * 100)}%`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-200 transition-colors shrink-0"
                  title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-cyan-400" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    if (isMuted) setIsMuted(false);
                    handleVolumeChange(parseFloat(e.target.value));
                  }}
                  className="w-full accent-cyan-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Note: iOS hardware volume buttons control master AirPods level; this slider adjusts the WebRTC stream gain.
              </p>
            </div>
          </div>
        ) : (
          /* Pairing Form & QR Scanner */
          <div className="space-y-5 pt-1">
            <form onSubmit={handleSubmitCode} className="space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                Enter 6-Character PC Session Code
              </label>
              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={pairingCodeInput}
                  onChange={(e) => setPairingCodeInput(e.target.value.toUpperCase())}
                  placeholder="E.G. 7K9X2M"
                  maxLength={8}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-slate-900 border border-slate-700/90 font-mono text-lg font-semibold tracking-[0.22em] text-cyan-300 uppercase placeholder:text-slate-600 placeholder:tracking-normal focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={connectionStatus === 'pairing' || !pairingCodeInput.trim()}
                  className="min-h-[48px] px-6 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white text-sm font-semibold flex items-center gap-2 transition-all shadow-[0_0_24px_rgba(139,92,246,0.35)] whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <span>
                    {connectionStatus === 'pairing' ? 'Connecting...' : 'Connect'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Scan QR Code Camera Trigger */}
            <div className="pt-1">
              {!scannerOpen ? (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-colors"
                >
                  <QrCode className="w-4 h-4 text-cyan-400" />
                  <span>Scan PC QR Code with Camera</span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-900 border border-cyan-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                      <Camera className="w-4 h-4" />
                      <span>Point Camera at PC EchoLink QR Code</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScannerOpen(false)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {scannerNotice && (
                    <p className="text-xs text-slate-400 leading-relaxed">{scannerNotice}</p>
                  )}
                </div>
              )}
            </div>

            {/* Discovered Active PC Sessions in Lobby */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">
                  Active PC Sessions Discovered
                </span>
                <span className="font-mono tabular-nums">
                  {discoveredHosts.length} Online
                </span>
              </div>

              {discoveredHosts.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/70 text-xs text-slate-400 flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-violet-400 shrink-0" />
                  <span>
                    Open EchoLink on your PC and click "Create Audio Session" to see it appear here automatically.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {discoveredHosts.map((host) => (
                    <button
                      key={host.deviceId}
                      type="button"
                      onClick={() => onJoinHostDevice(host)}
                      className="w-full min-h-[56px] p-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 flex items-center justify-between gap-3 text-left transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-violet-950/90 border border-violet-500/40 flex items-center justify-center text-violet-300 shrink-0">
                          <Monitor className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-100 truncate">
                            {host.deviceName}
                          </div>
                          <div className="text-xs font-mono text-slate-400 tabular-nums">
                            {host.pairingCode
                              ? `Session Code ${host.pairingCode}`
                              : 'Online · Tap to pair'}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-cyan-300 whitespace-nowrap shrink-0 flex items-center gap-1">
                        <span>Join</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
