/**
 * Generates a rich, musical stereo reference audio stream using Web Audio API
 * so users can test real WebRTC PC-to-Phone audio transport even if their
 * current browser or OS restricts tab/display audio capture.
 */
export interface SynthStreamController {
  stream: MediaStream;
  audioContext: AudioContext;
  stop: () => void;
}

export function createReferenceAudioStream(): SynthStreamController {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const destination = ctx.createMediaStreamDestination();

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.28;
  masterGain.connect(destination);

  // Ambient warm chord notes (C major 9th arpeggio + subtle bass pulse)
  const frequencies = [261.63, 329.63, 392.0, 493.88, 587.33];
  const oscillators: OscillatorNode[] = [];

  frequencies.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.value = freq;

    // Gentle LFO modulation so the waveform visualizer and headphones have a rhythmic pulse
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.45 + idx * 0.18;
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain);

    noteGain.gain.value = 0.12;
    lfoGain.connect(noteGain.gain);

    osc.connect(noteGain);
    noteGain.connect(masterGain);

    osc.start();
    lfo.start();
    oscillators.push(osc, lfo);
  });

  // Periodic rhythmic chime every 1.25s for latency verification
  const pulseInterval = window.setInterval(() => {
    if (ctx.state === 'closed') return;
    const now = ctx.currentTime;
    const pingOsc = ctx.createOscillator();
    const pingGain = ctx.createGain();
    pingOsc.type = 'sine';
    pingOsc.frequency.setValueAtTime(880, now);
    pingOsc.frequency.exponentialRampToValueAtTime(659.25, now + 0.18);

    pingGain.gain.setValueAtTime(0.001, now);
    pingGain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    pingOsc.connect(pingGain);
    pingGain.connect(masterGain);
    pingOsc.start(now);
    pingOsc.stop(now + 0.36);
  }, 1250);

  return {
    stream: destination.stream,
    audioContext: ctx,
    stop: () => {
      window.clearInterval(pulseInterval);
      oscillators.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      });
      masterGain.disconnect();
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    },
  };
}
