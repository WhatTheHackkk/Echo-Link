import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Monitor,
  Smartphone,
  Volume2,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import {
  AudioCaptureSourceType,
  DeviceRole,
  EchoLinkDevice,
  EchoLinkSession,
  PairingRequest,
  RuntimeConfig,
  SignalingEnvelope,
  WebRTCTelemetry,
} from './types/echolink';
import { EchoLinkSignalingService } from './services/signalingService';
import { createReferenceAudioStream, SynthStreamController } from './services/audioSynth';
import { DeviceRadar } from './components/DeviceRadar';
import { DeviceList } from './components/DeviceList';
import { QRPairing } from './components/QRPairing';
import { SessionManager } from './components/SessionManager';
import { AudioCapture } from './components/AudioCapture';
import { WebRTCConnection } from './components/WebRTCConnection';
import { AudioVisualizer } from './components/AudioVisualizer';
import { MobileReceiver } from './components/MobileReceiver';
import { SetupGuideModal } from './components/SetupGuideModal';

function detectPlatform(): { platform: string; isMobile: boolean; defaultName: string } {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || window.innerWidth < 768;

  if (isIOS) return { platform: 'iOS Safari', isMobile: true, defaultName: 'iPhone AirPods Receiver' };
  if (isAndroid) return { platform: 'Android Chrome', isMobile: true, defaultName: 'Android Audio Receiver' };
  if (/Mac/i.test(ua)) return { platform: 'macOS Desktop', isMobile: false, defaultName: 'Mac Studio Host' };
  if (/Win/i.test(ua)) return { platform: 'Windows PC', isMobile: false, defaultName: 'Windows Audio Host' };
  if (/Linux/i.test(ua)) return { platform: 'Linux Workstation', isMobile: false, defaultName: 'Linux Audio Host' };
  return {
    platform: isMobile ? 'Mobile Browser' : 'Desktop Browser',
    isMobile,
    defaultName: isMobile ? 'Phone Receiver' : 'PC Audio Host',
  };
}

function getOrCreateDeviceId(): string {
  const key = 'echolink_device_id_v1';
  const stored = sessionStorage.getItem(key);
  if (stored) return stored;
  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(5)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const newId = `dev_${randomHex}`;
  sessionStorage.setItem(key, newId);
  return newId;
}

const INITIAL_TELEMETRY: WebRTCTelemetry = {
  connectionState: 'new',
  iceConnectionState: 'new',
  rttMs: null,
  jitterMs: null,
  bitrateKbps: null,
  packetsLost: 0,
  packetsSentOrReceived: 0,
  candidateType: 'STUN Standby',
  usingTurnRelay: false,
  updatedAt: Date.now(),
};

export default function App() {
  const platformInfo = useMemo(() => detectPlatform(), []);
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const urlJoinSessionId = urlParams.get('join') || '';
  const urlPairingCode = (urlParams.get('code') || '').toUpperCase();
  const urlSessionToken = urlParams.get('token') || '';

  const initialRole: DeviceRole =
    urlJoinSessionId || urlPairingCode || platformInfo.isMobile
      ? 'mobile-receiver'
      : 'pc-transmitter';

  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [deviceName, setDeviceName] = useState<string>(() => {
    return localStorage.getItem('echolink_device_name') || platformInfo.defaultName;
  });
  const [role, setRole] = useState<DeviceRole>(initialRole);

  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>({
    appUrl: window.location.origin,
    supabaseConfigured: false,
    turnConfigured: false,
  });

  const [transportStatus, setTransportStatus] = useState({
    wsConnected: false,
    supabaseConnected: false,
    activeTransport: 'Connecting...',
  });

  const [devices, setDevices] = useState<EchoLinkDevice[]>([]);
  const [session, setSession] = useState<EchoLinkSession | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PairingRequest[]>([]);
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([]);
  const [connectedPeerName, setConnectedPeerName] = useState<string | null>(null);

  // Audio capture & streaming states (PC Host)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSourceType, setActiveSourceType] =
    useState<AudioCaptureSourceType>('display-media');
  const [activeSourceLabel, setActiveSourceLabel] = useState<string>('None');
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Mobile Receiver states
  const [mobileStatus, setMobileStatus] = useState<
    'idle' | 'pairing' | 'connected' | 'streaming' | 'error'
  >('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // WebRTC Telemetry & Modals
  const [telemetry, setTelemetry] = useState<WebRTCTelemetry>(INITIAL_TELEMETRY);
  const [setupModalOpen, setSetupModalOpen] = useState(false);

  // Refs for WebRTC & Signaling
  const signalingRef = useRef<EchoLinkSignalingService | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const synthControllerRef = useRef<SynthStreamController | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<EchoLinkSession | null>(null);
  const prevBytesRef = useRef<{ bytes: number; timestamp: number }>({
    bytes: 0,
    timestamp: Date.now(),
  });
  const autoJoinedUrlRef = useRef(false);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const buildIceServers = useCallback((): RTCIceServer[] => {
    const servers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    const turnUrl =
      localStorage.getItem('echolink_turn_url') ||
      runtimeConfig.turnUrl ||
      import.meta.env.VITE_TURN_URL ||
      '';
    const turnUsername =
      localStorage.getItem('echolink_turn_username') ||
      runtimeConfig.turnUsername ||
      import.meta.env.VITE_TURN_USERNAME ||
      '';
    const turnCredential =
      localStorage.getItem('echolink_turn_credential') ||
      runtimeConfig.turnCredential ||
      import.meta.env.VITE_TURN_CREDENTIAL ||
      '';

    if (turnUrl) {
      servers.push({
        urls: turnUrl,
        ...(turnUsername ? { username: turnUsername } : {}),
        ...(turnCredential ? { credential: turnCredential } : {}),
      });
    }
    return servers;
  }, [runtimeConfig]);

  const closeAllPeerConnections = useCallback(() => {
    for (const pc of peerConnectionsRef.current.values()) {
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    setTelemetry(INITIAL_TELEMETRY);
  }, []);

  const stopLocalAudioCapture = useCallback(() => {
    if (synthControllerRef.current) {
      synthControllerRef.current.stop();
      synthControllerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setIsStreaming(false);
    setActiveSourceLabel('Stopped');

    if (signalingRef.current) {
      signalingRef.current.updateIdentity({
        isStreamingAudio: false,
        status: connectedPeerIds.length > 0 ? 'connected' : 'online',
      });
      if (sessionRef.current) {
        signalingRef.current.send({
          type: 'stream:state',
          sessionId: sessionRef.current.sessionId,
          fromDeviceId: deviceId,
          payload: { isStreaming: false, audioSourceLabel: '' },
          timestamp: Date.now(),
        });
      }
    }
  }, [connectedPeerIds.length, deviceId]);

  const createOrGetPeerConnection = useCallback(
    (peerDeviceId: string, activeSessionId: string): RTCPeerConnection => {
      const existing = peerConnectionsRef.current.get(peerDeviceId);
      if (existing && existing.signalingState !== 'closed') {
        return existing;
      }

      const pc = new RTCPeerConnection({
        iceServers: buildIceServers(),
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && signalingRef.current) {
          signalingRef.current.send({
            type: 'webrtc:ice-candidate',
            sessionId: activeSessionId,
            fromDeviceId: deviceId,
            targetDeviceId: peerDeviceId,
            payload: { candidate: event.candidate.toJSON() },
            timestamp: Date.now(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setTelemetry((prev) => ({
          ...prev,
          connectionState: state,
          updatedAt: Date.now(),
        }));
        if (state === 'connected') {
          setConnectionError(null);
        } else if (state === 'failed') {
          setConnectionError(
            'Direct WebRTC peer-to-peer connection failed across NAT/firewall boundaries. If PC and phone are on separate networks (e.g., cellular 5G vs corporate Wi-Fi), configure a TURN relay server in Setup Guide.'
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        setTelemetry((prev) => ({
          ...prev,
          iceConnectionState: pc.iceConnectionState,
          updatedAt: Date.now(),
        }));
      };

      pc.ontrack = (event) => {
        const [incomingStream] = event.streams;
        if (incomingStream) {
          setRemoteStream(incomingStream);
          setMobileStatus('streaming');
        } else if (event.track) {
          const fallbackStream = new MediaStream([event.track]);
          setRemoteStream(fallbackStream);
          setMobileStatus('streaming');
        }
      };

      peerConnectionsRef.current.set(peerDeviceId, pc);
      return pc;
    },
    [buildIceServers, deviceId]
  );

  const initiateWebRTCOfferToPeer = useCallback(
    async (peerDeviceId: string, activeSessionId: string, streamToAttach: MediaStream | null) => {
      try {
        const pc = createOrGetPeerConnection(peerDeviceId, activeSessionId);

        if (streamToAttach) {
          const existingSenders = pc.getSenders();
          const audioTracks = streamToAttach.getAudioTracks();
          for (const track of audioTracks) {
            const alreadySending = existingSenders.some((s) => s.track?.id === track.id);
            if (!alreadySending) {
              pc.addTrack(track, streamToAttach);
            }
          }
        } else {
          // Ensure audio transceiver exists even before capture starts so connection is established
          if (pc.getTransceivers().length === 0) {
            pc.addTransceiver('audio', { direction: 'sendonly' });
          }
        }

        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        signalingRef.current?.send({
          type: 'webrtc:offer',
          sessionId: activeSessionId,
          fromDeviceId: deviceId,
          targetDeviceId: peerDeviceId,
          payload: { sdp: pc.localDescription },
          timestamp: Date.now(),
        });
      } catch (err: any) {
        console.error('Failed to create WebRTC offer:', err);
        setConnectionError(err?.message || 'Failed to initiate WebRTC offer.');
      }
    },
    [createOrGetPeerConnection, deviceId]
  );

  // Initialize signaling service & fetch server runtime config
  useEffect(() => {
    let mounted = true;
    const svc = new EchoLinkSignalingService(
      deviceId,
      deviceName,
      role,
      platformInfo.platform
    );
    signalingRef.current = svc;

    const unsubPresence = svc.onPresence((list) => {
      if (!mounted) return;
      setDevices(list);
    });

    const unsubStatus = svc.onStatus((st) => {
      if (!mounted) return;
      setTransportStatus(st);
    });

    const unsubMessage = svc.onMessage(async (msg: SignalingEnvelope) => {
      if (!mounted) return;

      if (msg.type === 'session:created' && msg.payload) {
        const created: EchoLinkSession = msg.payload;
        setSession(created);
        svc.updateIdentity({
          sessionId: created.sessionId,
          pairingCode: created.pairingCode,
          status: 'online',
        });
        return;
      }

      if (msg.type === 'session:updated' && msg.payload) {
        setSession(msg.payload);
        return;
      }

      if (msg.type === 'pair:request' && msg.payload) {
        const req: PairingRequest = msg.payload;
        setPendingRequests((prev) => {
          if (prev.some((r) => r.fromDeviceId === req.fromDeviceId)) return prev;
          return [...prev, req];
        });
        return;
      }

      if (msg.type === 'pair:accept') {
        const acceptedSession: EchoLinkSession | undefined = msg.payload?.session;
        if (acceptedSession) {
          setSession(acceptedSession);
        }
        setConnectionError(null);

        if (role === 'mobile-receiver' || msg.targetDeviceId === deviceId) {
          // If we are the mobile receiver getting accepted, or host getting notified of auto-approved QR scan
          if (msg.payload?.peerDeviceId && msg.payload.peerDeviceId !== deviceId) {
            // Host side of auto-approved QR token scan
            const peerId = msg.payload.peerDeviceId;
            setConnectedPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));
            setConnectedPeerName(msg.payload.peerDeviceName || 'Phone Receiver');
            if (acceptedSession) {
              await initiateWebRTCOfferToPeer(
                peerId,
                acceptedSession.sessionId,
                localStreamRef.current
              );
            }
          } else {
            // Mobile receiver side
            setMobileStatus('connected');
            setConnectedPeerName(msg.payload?.hostDeviceName || 'PC Audio Host');
            setConnectedPeerIds([msg.fromDeviceId]);
          }
        }
        return;
      }

      if (msg.type === 'pair:reject') {
        setMobileStatus('error');
        setConnectionError(msg.payload?.reason || 'Pairing request was declined by the host PC.');
        return;
      }

      if (msg.type === 'webrtc:offer' && msg.sessionId && msg.payload?.sdp) {
        const peerId = msg.fromDeviceId;
        const pc = createOrGetPeerConnection(peerId, msg.sessionId);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
          // Flush any queued ICE candidates
          const queued = pendingIceCandidatesRef.current.get(peerId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          pendingIceCandidatesRef.current.delete(peerId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          svc.send({
            type: 'webrtc:answer',
            sessionId: msg.sessionId,
            fromDeviceId: deviceId,
            targetDeviceId: peerId,
            payload: { sdp: pc.localDescription },
            timestamp: Date.now(),
          });
        } catch (err: any) {
          console.error('Error handling WebRTC offer:', err);
          setConnectionError(err?.message || 'Failed to negotiate incoming WebRTC audio offer.');
        }
        return;
      }

      if (msg.type === 'webrtc:answer' && msg.payload?.sdp) {
        const peerId = msg.fromDeviceId;
        const pc = peerConnectionsRef.current.get(peerId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
            const queued = pendingIceCandidatesRef.current.get(peerId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            pendingIceCandidatesRef.current.delete(peerId);
          } catch (err) {
            console.error('Error setting WebRTC answer:', err);
          }
        }
        return;
      }

      if (msg.type === 'webrtc:ice-candidate' && msg.payload?.candidate) {
        const peerId = msg.fromDeviceId;
        const pc = peerConnectionsRef.current.get(peerId);
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate));
          } catch (err) {
            console.warn('ICE candidate add warning:', err);
          }
        } else {
          const list = pendingIceCandidatesRef.current.get(peerId) || [];
          list.push(msg.payload.candidate);
          pendingIceCandidatesRef.current.set(peerId, list);
        }
        return;
      }

      if (msg.type === 'stream:state') {
        const peerStreaming = Boolean(msg.payload?.isStreaming);
        if (!peerStreaming) {
          setRemoteStream(null);
          setMobileStatus((prev) => (prev === 'streaming' ? 'connected' : prev));
        } else {
          setMobileStatus('streaming');
        }
        return;
      }

      if (
        msg.type === 'session:ended' ||
        msg.type === 'session:expired' ||
        msg.type === 'device:leave'
      ) {
        if (msg.type === 'device:leave') {
          const departedId = msg.fromDeviceId;
          const pc = peerConnectionsRef.current.get(departedId);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(departedId);
          }
          setConnectedPeerIds((prev) => prev.filter((id) => id !== departedId));
          return;
        }
        stopLocalAudioCapture();
        closeAllPeerConnections();
        setSession(null);
        setConnectedPeerIds([]);
        setConnectedPeerName(null);
        setRemoteStream(null);
        setMobileStatus('idle');
        if (msg.payload?.reason) {
          setConnectionError(msg.payload.reason);
        }
        return;
      }

      if (msg.type === 'error:notice' && msg.payload?.message) {
        setConnectionError(msg.payload.message);
        setMobileStatus((prev) => (prev === 'pairing' ? 'error' : prev));
      }
    });

    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: RuntimeConfig) => {
        if (!mounted) return;
        setRuntimeConfig(cfg);
        svc.connect(cfg);
      })
      .catch(() => {
        svc.connect();
      });

    return () => {
      mounted = false;
      unsubPresence();
      unsubStatus();
      unsubMessage();
      svc.disconnect();
    };
  }, [
    closeAllPeerConnections,
    createOrGetPeerConnection,
    deviceId,
     initiateWebRTCOfferToPeer,
    platformInfo.platform,
    stopLocalAudioCapture,
  ]);

  // Automatically create a session on PC Transmitter startup, or auto-join on Mobile QR URL scan
  useEffect(() => {
    if (!transportStatus.wsConnected && !transportStatus.supabaseConnected) return;
    if (autoJoinedUrlRef.current) return;

    if (urlJoinSessionId || urlPairingCode) {
      autoJoinedUrlRef.current = true;
      setRole('mobile-receiver');
      setMobileStatus('pairing');
      signalingRef.current?.send({
        type: 'pair:request',
        sessionId: urlJoinSessionId || undefined,
        pairingCode: urlPairingCode || undefined,
        sessionToken: urlSessionToken || undefined,
        fromDeviceId: deviceId,
        payload: {
          sessionId: urlJoinSessionId,
          pairingCode: urlPairingCode,
          deviceName,
          platform: platformInfo.platform,
        },
        timestamp: Date.now(),
      });
    } else if (role === 'pc-transmitter' && !session) {
      autoJoinedUrlRef.current = true;
      signalingRef.current?.send({
        type: 'session:created',
        fromDeviceId: deviceId,
        payload: { hostDeviceName: deviceName },
        timestamp: Date.now(),
      });
    }
  }, [
    deviceId,
    deviceName,
    platformInfo.platform,
    role,
    session,
    transportStatus.supabaseConnected,
    transportStatus.wsConnected,
    urlJoinSessionId,
    urlPairingCode,
    urlSessionToken,
  ]);

  // Poll RTCPeerConnection getStats() for real latency, jitter, bitrate, and candidate type
  useEffect(() => {
    const interval = window.setInterval(async () => {
      const pcs = Array.from(peerConnectionsRef.current.values());
      if (pcs.length === 0) return;
      const pc = pcs[0];
      if (pc.connectionState === 'closed') return;

      try {
        const stats = await pc.getStats();
        let rttMs: number | null = null;
        let jitterMs: number | null = null;
        let packetsLost = 0;
        let packetsCount = 0;
        let totalBytes = 0;
        let candidateType = 'Direct P2P';
        let usingTurnRelay = false;

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (typeof report.currentRoundTripTime === 'number') {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }
            const localCand = stats.get(report.localCandidateId);
            const remoteCand = stats.get(report.remoteCandidateId);
            const candType = localCand?.candidateType || remoteCand?.candidateType;
            if (candType) {
              candidateType = String(candType).toUpperCase();
              usingTurnRelay = candType === 'relay';
            }
          }
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            totalBytes += report.bytesSent || 0;
            packetsCount += report.packetsSent || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            totalBytes += report.bytesReceived || 0;
            packetsCount += report.packetsReceived || 0;
            packetsLost += report.packetsLost || 0;
            if (typeof report.jitter === 'number') {
              jitterMs = Math.round(report.jitter * 1000);
            }
          }
          if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
            packetsLost += report.packetsLost || 0;
            if (typeof report.jitter === 'number') {
              jitterMs = Math.round(report.jitter * 1000);
            }
            if (rttMs === null && typeof report.roundTripTime === 'number') {
              rttMs = Math.round(report.roundTripTime * 1000);
            }
          }
        });

        const now = Date.now();
        const elapsedSec = Math.max(0.5, (now - prevBytesRef.current.timestamp) / 1000);
        const deltaBytes = Math.max(0, totalBytes - prevBytesRef.current.bytes);
        const bitrateKbps =
          totalBytes > 0 ? Math.round((deltaBytes * 8) / 1000 / elapsedSec) : null;
        prevBytesRef.current = { bytes: totalBytes, timestamp: now };

        setTelemetry({
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          rttMs,
          jitterMs,
          bitrateKbps,
          packetsLost,
          packetsSentOrReceived: packetsCount,
          candidateType,
          usingTurnRelay,
          updatedAt: now,
        });
      } catch {
        // ignore transient stats error
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, []);

  const handleCreateSession = () => {
    setConnectionError(null);
    signalingRef.current?.send({
      type: 'session:created',
      fromDeviceId: deviceId,
      payload: { hostDeviceName: deviceName },
      timestamp: Date.now(),
    });
  };

  const handleEndSession = () => {
    stopLocalAudioCapture();
    closeAllPeerConnections();
    if (session) {
      signalingRef.current?.send({
        type: 'session:ended',
        sessionId: session.sessionId,
        fromDeviceId: deviceId,
        payload: { reason: 'Host ended the audio session.' },
        timestamp: Date.now(),
      });
    }
    setSession(null);
    setConnectedPeerIds([]);
    setConnectedPeerName(null);
    setPendingRequests([]);
    setRemoteStream(null);
    setMobileStatus('idle');
  };

  const handleAcceptPairing = async (req: PairingRequest) => {
    setPendingRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
    setConnectedPeerIds((prev) =>
      prev.includes(req.fromDeviceId) ? prev : [...prev, req.fromDeviceId]
    );
    setConnectedPeerName(req.fromDeviceName);

    signalingRef.current?.send({
      type: 'pair:accept',
      sessionId: req.sessionId,
      pairingCode: req.pairingCode,
      fromDeviceId: deviceId,
      targetDeviceId: req.fromDeviceId,
      payload: { hostDeviceName: deviceName },
      timestamp: Date.now(),
    });

    await initiateWebRTCOfferToPeer(
      req.fromDeviceId,
      req.sessionId,
      localStreamRef.current
    );
  };

  const handleRejectPairing = (req: PairingRequest) => {
    setPendingRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
    signalingRef.current?.send({
      type: 'pair:reject',
      sessionId: req.sessionId,
      fromDeviceId: deviceId,
      targetDeviceId: req.fromDeviceId,
      payload: { reason: 'Connection declined by host PC.' },
      timestamp: Date.now(),
    });
  };

  const handleStartAudioCapture = async (sourceType: AudioCaptureSourceType) => {
    setCaptureError(null);
    stopLocalAudioCapture();

    try {
      let capturedStream: MediaStream;
      let label = 'PC Audio Stream';

      if (sourceType === 'display-media') {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          throw new Error(
            'Your current browser does not support getDisplayMedia screen/tab audio capture. Switch to Chrome/Edge on Desktop, or select "Studio Reference Synth" above to test WebRTC streaming.'
          );
        }

        capturedStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as MediaTrackConstraints,
        });

        const audioTracks = capturedStream.getAudioTracks();
        // Stop the video track immediately if we only need audio so we save bandwidth & privacy
        capturedStream.getVideoTracks().forEach((vt) => {
          vt.stop();
          capturedStream.removeTrack(vt);
        });

        if (audioTracks.length === 0) {
          throw new Error(
            'No audio track was shared. Please click "Start Audio Capture" again and make sure "Also share tab audio" or "Also share system audio" is toggled ON in the browser dialog.'
          );
        }

        label = audioTracks[0].label || 'Tab / System Loopback Audio';
        audioTracks[0].onended = () => {
          stopLocalAudioCapture();
        };
      } else if (sourceType === 'synth-test-tone') {
        const synth = createReferenceAudioStream();
        synthControllerRef.current = synth;
        capturedStream = synth.stream;
        label = 'Web Audio Stereo Reference Synth';
      } else {
        capturedStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
        const audioTracks = capturedStream.getAudioTracks();
        label = audioTracks[0]?.label || 'Aux / Line-In Input';
      }

      setLocalStream(capturedStream);
      localStreamRef.current = capturedStream;
      setActiveSourceType(sourceType);
      setActiveSourceLabel(label);
      setIsStreaming(true);

      signalingRef.current?.updateIdentity({
        isStreamingAudio: true,
        status: 'streaming',
      });

      if (session) {
        signalingRef.current?.send({
          type: 'stream:state',
          sessionId: session.sessionId,
          fromDeviceId: deviceId,
          payload: { isStreaming: true, audioSourceLabel: label },
          timestamp: Date.now(),
        });

        // Attach audio track & renegotiate WebRTC offer with all connected peers
        for (const peerId of connectedPeerIds) {
          await initiateWebRTCOfferToPeer(peerId, session.sessionId, capturedStream);
        }
      }
    } catch (err: any) {
      console.error('Audio capture error:', err);
      setCaptureError(
        err?.message ||
          'Permission was denied or no audio track was selected. Make sure to check "Share audio" in the browser picker.'
      );
    }
  };

  const handleRenameLocalDevice = (newName: string) => {
    setDeviceName(newName);
    localStorage.setItem('echolink_device_name', newName);
    signalingRef.current?.updateIdentity({ deviceName: newName });
  };

  const handleJoinByCode = (code: string) => {
    setConnectionError(null);
    setMobileStatus('pairing');
    signalingRef.current?.send({
      type: 'pair:request',
      pairingCode: code.trim().toUpperCase(),
      fromDeviceId: deviceId,
      payload: {
        pairingCode: code.trim().toUpperCase(),
        deviceName,
        platform: platformInfo.platform,
      },
      timestamp: Date.now(),
    });
  };

  const handleSelectDevice = (target: EchoLinkDevice) => {
    if (target.deviceId === deviceId) return;
    if (role === 'mobile-receiver') {
      if (target.pairingCode) {
        handleJoinByCode(target.pairingCode);
      } else if (target.sessionId) {
        setConnectionError(null);
        setMobileStatus('pairing');
        signalingRef.current?.send({
          type: 'pair:request',
          sessionId: target.sessionId,
          fromDeviceId: deviceId,
          payload: {
            sessionId: target.sessionId,
            deviceName,
            platform: platformInfo.platform,
          },
          timestamp: Date.now(),
        });
      }
    } else if (session) {
      // Host initiates direct pairing with a discovered phone in the lobby
      setConnectedPeerIds((prev) =>
        prev.includes(target.deviceId) ? prev : [...prev, target.deviceId]
      );
      setConnectedPeerName(target.deviceName);
      signalingRef.current?.send({
        type: 'pair:accept',
        sessionId: session.sessionId,
        pairingCode: session.pairingCode,
        fromDeviceId: deviceId,
        targetDeviceId: target.deviceId,
        payload: {
          session,
          hostDeviceName: deviceName,
        },
        timestamp: Date.now(),
      });
      initiateWebRTCOfferToPeer(target.deviceId, session.sessionId, localStreamRef.current);
    }
  };

  const localDeviceObj: EchoLinkDevice = {
    deviceId,
    deviceName,
    role,
    platform: platformInfo.platform,
    status: isStreaming
      ? 'streaming'
      : connectedPeerIds.length > 0
      ? 'connected'
      : 'online',
    sessionId: session?.sessionId || null,
    pairingCode: session?.pairingCode || null,
    lastSeenAt: Date.now(),
    isStreamingAudio: isStreaming,
  };

  const discoveredHosts = useMemo(
    () =>
      devices.filter(
        (d) =>
          d.deviceId !== deviceId &&
          (d.role === 'pc-transmitter' || Boolean(d.pairingCode))
      ),
    [deviceId, devices]
  );

  return (
    <div className="min-h-screen bg-[#06070B] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-4 bg-[#06070B]/90 backdrop-blur-md border-b border-slate-800/80">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          className="text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 font-display"
        >
          EchoLink
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <a
            href="#radar-section"
            className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            Acoustic Radar
          </a>
          <a
            href="#pairing-section"
            className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            QR Pairing
          </a>
          <a
            href="#capture-section"
            className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            Audio Capture
          </a>
          <a
            href="#telemetry-section"
            className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            WebRTC Telemetry
          </a>
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSetupModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Signaling & TURN Setup
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1380px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Workspace Role Bar & Live Signaling Status */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 tracking-tight text-balance">
              Wireless PC-to-Phone WebRTC Audio Bridge
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400 tabular-nums mt-1">
              <span
                className={
                  transportStatus.wsConnected || transportStatus.supabaseConnected
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }
              >
                {transportStatus.activeTransport}
              </span>
              <span aria-hidden="true">·</span>
              <span>Opus Low-Latency P2P</span>
              <span aria-hidden="true">·</span>
              <span>Zero Server Recording</span>
            </div>
          </div>

          {/* Interactive Mode Switcher (PC Transmitter vs Phone Receiver View) */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0B0E17] border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setRole('pc-transmitter');
                signalingRef.current?.updateIdentity({ role: 'pc-transmitter' });
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                role === 'pc-transmitter'
                  ? 'bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>PC Transmitter Dashboard</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRole('mobile-receiver');
                signalingRef.current?.updateIdentity({ role: 'mobile-receiver' });
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                role === 'mobile-receiver'
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone Receiver Mode</span>
            </button>
          </div>
        </div>

        {/* Active Audio Capture Privacy & Security Banner */}
        {isStreaming && (
          <div className="p-3.5 rounded-xl bg-cyan-950/60 border border-cyan-400/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-cyan-100">
              <Volume2 className="w-4 h-4 text-cyan-300 shrink-0" />
              <span className="font-semibold">Live Audio Capture Active:</span>
              <span className="font-mono">{activeSourceLabel}</span>
              <span className="text-cyan-300/80 hidden sm:inline">
                · Streaming directly over encrypted WebRTC DTLS-SRTP
              </span>
            </div>
            <button
              type="button"
              onClick={stopLocalAudioCapture}
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Stop Audio Capture
            </button>
          </div>
        )}

        {role === 'mobile-receiver' ? (
          /* Mobile Headphone Receiver Layout */
          <div className="space-y-6">
            <MobileReceiver
              localDevice={localDeviceObj}
              discoveredHosts={discoveredHosts}
              initialCode={urlPairingCode}
              connectionStatus={mobileStatus}
              connectedHostName={connectedPeerName}
              remoteStream={remoteStream}
              telemetry={telemetry}
              errorMessage={connectionError}
              onJoinByCode={handleJoinByCode}
              onJoinHostDevice={handleSelectDevice}
              onDisconnect={handleEndSession}
            />

            <div id="telemetry-section" className="max-w-xl mx-auto">
              <WebRTCConnection
                telemetry={telemetry}
                peerDeviceName={connectedPeerName}
                connectionError={connectionError}
                onOpenTurnSetup={() => setSetupModalOpen(true)}
              />
            </div>
          </div>
        ) : (
          /* Desktop PC Transmitter Dashboard Layout */
          <div className="space-y-6">
            {/* Session Manager Bar */}
            <SessionManager
              session={session}
              pendingRequests={pendingRequests}
              connectedPeerCount={connectedPeerIds.length}
              isStreaming={isStreaming}
              onCreateSession={handleCreateSession}
              onEndSession={handleEndSession}
              onAcceptPairing={handleAcceptPairing}
              onRejectPairing={handleRejectPairing}
            />

            {/* Primary 2-Column Split: Left = Radar + Discovered Devices, Right = QR Pairing + Audio Capture + Visualizer */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (5 cols on lg): Animated Device Radar & Device List */}
              <div id="radar-section" className="lg:col-span-5 space-y-6">
                <DeviceRadar
                  localDevice={localDeviceObj}
                  devices={devices}
                  activeSessionId={session?.sessionId || null}
                  connectedPeerIds={connectedPeerIds}
                  isStreaming={isStreaming}
                  onSelectDevice={handleSelectDevice}
                />

                <DeviceList
                  localDevice={localDeviceObj}
                  devices={devices}
                  activeSessionId={session?.sessionId || null}
                  connectedPeerIds={connectedPeerIds}
                  onRenameLocalDevice={handleRenameLocalDevice}
                  onSelectDevice={handleSelectDevice}
                />
              </div>

              {/* Right Column (7 cols on lg): QR Pairing, Audio Capture, Live Visualizer & WebRTC Telemetry */}
              <div className="lg:col-span-7 space-y-6">
                <div id="pairing-section">
                  <QRPairing
                    session={session}
                    appUrl={runtimeConfig.appUrl}
                    onCreateSession={handleCreateSession}
                  />
                </div>

                <div id="capture-section">
                  <AudioCapture
                    isStreaming={isStreaming}
                    activeSourceType={activeSourceType}
                    activeSourceLabel={activeSourceLabel}
                    captureError={captureError}
                    onStartCapture={handleStartAudioCapture}
                    onStopCapture={stopLocalAudioCapture}
                  />
                </div>

                <AudioVisualizer
                  stream={localStream}
                  isStreaming={isStreaming}
                  label="PC Outgoing WebRTC Audio Spectrum"
                />

                <div id="telemetry-section">
                  <WebRTCConnection
                    telemetry={telemetry}
                    peerDeviceName={connectedPeerName}
                    connectionError={connectionError}
                    onRetryConnection={() => {
                      if (session && connectedPeerIds[0]) {
                        initiateWebRTCOfferToPeer(
                          connectedPeerIds[0],
                          session.sessionId,
                          localStreamRef.current
                        );
                      }
                    }}
                    onOpenTurnSetup={() => setSetupModalOpen(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Footer with Security & Architecture Actions */}
      <footer className="mt-12 border-t border-slate-800/80 py-6 px-6 text-xs text-slate-400">
        <div className="max-w-[1380px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>
              EchoLink streams ephemeral WebRTC audio directly between peers. Audio is never recorded or stored.
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSetupModalOpen(true)}
              className="text-slate-300 hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Supabase & TURN Configuration Guide</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Setup & Infrastructure Modal */}
      <SetupGuideModal
        isOpen={setupModalOpen}
        config={runtimeConfig}
        activeTransport={transportStatus.activeTransport}
        onClose={() => setSetupModalOpen(false)}
        onSaveCustomConfig={(custom) => {
          if (custom.supabaseUrl && custom.supabaseAnonKey) {
            signalingRef.current?.connectSupabase(
              custom.supabaseUrl,
              custom.supabaseAnonKey
            );
          }
        }}
      />
    </div>
  );
}
