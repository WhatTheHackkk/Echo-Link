export type DeviceRole = 'pc-transmitter' | 'mobile-receiver';

export type DeviceConnectionState =
  | 'online'
  | 'pairing'
  | 'connected'
  | 'streaming'
  | 'disconnected';

export interface EchoLinkDevice {
  deviceId: string;
  deviceName: string;
  role: DeviceRole;
  platform: string;
  status: DeviceConnectionState;
  sessionId: string | null;
  pairingCode: string | null;
  lastSeenAt: number;
  isStreamingAudio?: boolean;
}

export interface EchoLinkSession {
  sessionId: string;
  pairingCode: string;
  sessionToken: string;
  hostDeviceId: string;
  hostDeviceName: string;
  createdAt: number;
  connectedPeerIds: string[];
  isStreaming: boolean;
  audioSourceLabel?: string;
}

export interface PairingRequest {
  requestId: string;
  sessionId: string;
  pairingCode: string;
  fromDeviceId: string;
  fromDeviceName: string;
  fromPlatform: string;
  timestamp: number;
}

export interface WebRTCTelemetry {
  connectionState: RTCPeerConnectionState | 'new' | 'closed';
  iceConnectionState: RTCIceConnectionState | 'new' | 'closed';
  rttMs: number | null;
  jitterMs: number | null;
  bitrateKbps: number | null;
  packetsLost: number;
  packetsSentOrReceived: number;
  candidateType: string;
  usingTurnRelay: boolean;
  updatedAt: number;
}

export type AudioCaptureSourceType = 'display-media' | 'synth-test-tone' | 'microphone-explicit';

export type SignalingMessageType =
  | 'presence:sync'
  | 'device:announce'
  | 'device:update'
  | 'device:leave'
  | 'session:created'
  | 'session:updated'
  | 'session:expired'
  | 'session:ended'
  | 'pair:request'
  | 'pair:accept'
  | 'pair:reject'
  | 'webrtc:offer'
  | 'webrtc:answer'
  | 'webrtc:ice-candidate'
  | 'stream:state'
  | 'error:notice';

export interface SignalingEnvelope {
  type: SignalingMessageType;
  sessionId?: string;
  sessionToken?: string;
  pairingCode?: string;
  fromDeviceId: string;
  targetDeviceId?: string;
  payload?: any;
  timestamp: number;
}

export interface RuntimeConfig {
  appUrl: string;
  supabaseConfigured: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  turnConfigured: boolean;
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
}
