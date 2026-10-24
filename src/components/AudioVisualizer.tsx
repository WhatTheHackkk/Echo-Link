import React, { useEffect, useRef, useState } from 'react';
import { Activity, Waves } from 'lucide-react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  isStreaming: boolean;
  label?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  stream,
  isStreaming,
  label = 'Real-Time PCM Audio Spectrum',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'bars' | 'waveform'>('bars');
  const [peakDb, setPeakDb] = useState<number>(-60);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    if (stream && isStreaming && stream.getAudioTracks().length > 0) {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AudioContextClass();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.82;

        sourceNode = audioCtx.createMediaStreamSource(stream);
        sourceNode.connect(analyser);
      } catch (err) {
        console.warn('Web Audio visualizer attach notice:', err);
      }
    }

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);
    const timeArray = new Uint8Array(bufferLength);

    let frameCounter = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Subtle background grid lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 1;
      for (let y = height * 0.25; y < height; y += height * 0.25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (analyser && isStreaming) {
        analyser.getByteFrequencyData(dataArray);
        analyser.getByteTimeDomainData(timeArray);

        // Compute RMS dB every 8 frames
        frameCounter++;
        if (frameCounter % 8 === 0) {
          let sumSquares = 0;
          for (let i = 0; i < timeArray.length; i++) {
            const normalized = (timeArray[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / timeArray.length);
          const db = rms > 0.0001 ? Math.max(-60, Math.round(20 * Math.log10(rms))) : -60;
          setPeakDb(db);
        }

        if (mode === 'bars') {
          const barCount = 48;
          const gap = 3;
          const barWidth = (width - gap * (barCount - 1)) / barCount;

          for (let i = 0; i < barCount; i++) {
            const value = dataArray[i] || 4;
            const percent = Math.max(0.04, value / 255);
            const barHeight = percent * (height - 16);
            const x = i * (barWidth + gap);
            const y = height - barHeight;

            const grad = ctx.createLinearGradient(0, height, 0, 0);
            grad.addColorStop(0, '#8B5CF6');
            grad.addColorStop(0.6, '#06B6D4');
            grad.addColorStop(1, '#EC4899');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
          }
        } else {
          // Oscilloscope Waveform Mode
          ctx.lineWidth = 2.2;
          const grad = ctx.createLinearGradient(0, 0, width, 0);
          grad.addColorStop(0, '#8B5CF6');
          grad.addColorStop(0.5, '#06B6D4');
          grad.addColorStop(1, '#EC4899');
          ctx.strokeStyle = grad;

          ctx.beginPath();
          const sliceWidth = width / (bufferLength - 1);
          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeArray[i] / 128.0;
            const y = (v * height) / 2;
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }
          ctx.stroke();
        }
      } else {
        // Idle standby horizon line
        setPeakDb(-60);
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch {
          // ignore
        }
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };
  }, [stream, isStreaming, mode]);

  return (
    <div className="p-5 rounded-2xl bg-[#0B0E17]/90 border border-slate-800/80">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${isStreaming ? 'text-cyan-400' : 'text-slate-500'}`} />
          <span className="text-sm font-semibold text-slate-100">{label}</span>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            · {isStreaming ? `${peakDb} dBFS` : 'Standby'}
          </span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('bars')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'bars'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Frequency Bars
          </button>
          <button
            type="button"
            onClick={() => setMode('waveform')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
              mode === 'waveform'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Waves className="w-3 h-3" />
            <span>Waveform</span>
          </button>
        </div>
      </div>

      <div className="relative h-32 w-full rounded-xl bg-[#06080F] border border-slate-800/90 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={640}
          height={140}
          className="w-full h-full block"
        />
        {!isStreaming && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-mono text-slate-500">
              Awaiting active WebRTC audio stream...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
