import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  DeviceConnectionState,
  DeviceRole,
  EchoLinkDevice,
  RuntimeConfig,
  SignalingEnvelope,
} from '../types/echolink';

type MessageListener = (msg: SignalingEnvelope) => void;
type PresenceListener = (devices: EchoLinkDevice[]) => void;
type StatusListener = (status: {
  wsConnected: boolean;
  supabaseConnected: boolean;
  activeTransport: string;
}) => void;

export class EchoLinkSignalingService {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private supabase: SupabaseClient | null = null;
  private supabaseChannel: RealtimeChannel | null = null;

  private deviceId: string;
  private deviceName: string;
  private role: DeviceRole;
  private platform: string;
  private status: DeviceConnectionState = 'online';
  private sessionId: string | null = null;
  private pairingCode: string | null = null;
  private isStreamingAudio = false;

  private wsDevices = new Map<string, EchoLinkDevice>();
  private sbDevices = new Map<string, EchoLinkDevice>();

  private messageListeners = new Set<MessageListener>();
  private presenceListeners = new Set<PresenceListener>();
  private statusListeners = new Set<StatusListener>();

  private wsConnected = false;
  private supabaseConnected = false;

  constructor(deviceId: string, deviceName: string, role: DeviceRole, platform: string) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.role = role;
    this.platform = platform;
  }

  public connect(config?: Partial<RuntimeConfig>) {
    this.connectWebSocket();

    const sbUrl =
      config?.supabaseUrl ||
      import.meta.env.VITE_SUPABASE_URL ||
      localStorage.getItem('echolink_supabase_url') ||
      '';
    const sbKey =
      config?.supabaseAnonKey ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      localStorage.getItem('echolink_supabase_anon_key') ||
      '';

    if (sbUrl && sbKey) {
      this.connectSupabase(sbUrl, sbKey);
    }
  }

  private connectWebSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.emitTransportStatus();
        this.announcePresence();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: SignalingEnvelope = JSON.parse(event.data);
          if (msg.type === 'presence:sync' && Array.isArray(msg.payload?.devices)) {
            this.wsDevices.clear();
            for (const d of msg.payload.devices as EchoLinkDevice[]) {
              this.wsDevices.set(d.deviceId, d);
            }
            this.emitMergedPresence();
            return;
          }
          this.notifyMessage(msg);
        } catch (err) {
          console.error('Failed to parse signaling message:', err);
        }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this.emitTransportStatus();
        if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => this.connectWebSocket(), 2500);
      };

      this.ws.onerror = () => {
        this.wsConnected = false;
        this.emitTransportStatus();
      };
    } catch (e) {
      console.error('WebSocket connection error:', e);
    }
  }

  public connectSupabase(url: string, anonKey: string) {
    try {
      if (this.supabaseChannel) {
        this.supabaseChannel.unsubscribe();
      }
      this.supabase = createClient(url, anonKey, {
        realtime: { params: { eventsPerSecond: 20 } },
      });

      this.supabaseChannel = this.supabase.channel('echolink:global', {
        config: {
          presence: { key: this.deviceId },
          broadcast: { self: false },
        },
      });

      this.supabaseChannel
        .on('presence', { event: 'sync' }, () => {
          if (!this.supabaseChannel) return;
          const state = this.supabaseChannel.presenceState();
          this.sbDevices.clear();
          Object.entries(state).forEach(([key, presences]) => {
            const latest = (presences as any[])[0];
            if (latest && latest.deviceId) {
              this.sbDevices.set(key, {
                deviceId: latest.deviceId,
                deviceName: latest.deviceName || 'EchoLink Device',
                role: latest.role || 'pc-transmitter',
                platform: latest.platform || 'Browser',
                status: latest.status || 'online',
                sessionId: latest.sessionId || null,
                pairingCode: latest.pairingCode || null,
                lastSeenAt: latest.lastSeenAt || Date.now(),
                isStreamingAudio: Boolean(latest.isStreamingAudio),
              });
            }
          });
          this.emitMergedPresence();
        })
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          if (!payload) return;
          const msg = payload as SignalingEnvelope;
          if (msg.targetDeviceId && msg.targetDeviceId !== this.deviceId) {
            return;
          }
          // Avoid duplicate handling if WS already processes server-created events
          if (!this.wsConnected || msg.fromDeviceId !== this.deviceId) {
            this.notifyMessage(msg);
          }
        })
        .subscribe(async (status) => {
          this.supabaseConnected = status === 'SUBSCRIBED';
          this.emitTransportStatus();
          if (this.supabaseConnected) {
            await this.trackSupabasePresence();
          }
        });
    } catch (err) {
      console.error('Supabase Realtime setup error:', err);
      this.supabaseConnected = false;
      this.emitTransportStatus();
    }
  }

  private async trackSupabasePresence() {
    if (!this.supabaseChannel || !this.supabaseConnected) return;
    try {
      await this.supabaseChannel.track({
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        role: this.role,
        platform: this.platform,
        status: this.status,
        sessionId: this.sessionId,
        pairingCode: this.pairingCode,
        lastSeenAt: Date.now(),
        isStreamingAudio: this.isStreamingAudio,
      });
    } catch (err) {
      console.error('Failed to track Supabase presence:', err);
    }
  }

  public announcePresence() {
    this.send({
      type: 'device:announce',
      fromDeviceId: this.deviceId,
      payload: {
        deviceName: this.deviceName,
        role: this.role,
        platform: this.platform,
        status: this.status,
      },
      timestamp: Date.now(),
    });
    this.trackSupabasePresence();
  }

  public updateIdentity(updates: {
    deviceName?: string;
    role?: DeviceRole;
    status?: DeviceConnectionState;
    sessionId?: string | null;
    pairingCode?: string | null;
    isStreamingAudio?: boolean;
  }) {
    if (updates.deviceName !== undefined) this.deviceName = updates.deviceName;
    if (updates.role !== undefined) this.role = updates.role;
    if (updates.status !== undefined) this.status = updates.status;
    if (updates.sessionId !== undefined) this.sessionId = updates.sessionId;
    if (updates.pairingCode !== undefined) this.pairingCode = updates.pairingCode;
    if (updates.isStreamingAudio !== undefined) this.isStreamingAudio = updates.isStreamingAudio;

    this.send({
      type: 'device:update',
      fromDeviceId: this.deviceId,
      payload: {
        deviceName: this.deviceName,
        role: this.role,
        status: this.status,
        isStreamingAudio: this.isStreamingAudio,
      },
      timestamp: Date.now(),
    });
    this.trackSupabasePresence();
  }

  public send(envelope: SignalingEnvelope) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
    if (
      this.supabaseChannel &&
      this.supabaseConnected &&
      envelope.type !== 'device:announce' &&
      envelope.type !== 'device:update'
    ) {
      this.supabaseChannel.send({
        type: 'broadcast',
        event: 'signal',
        payload: envelope,
      });
    }
  }

  private emitMergedPresence() {
    const merged = new Map<string, EchoLinkDevice>();
    for (const [id, dev] of this.sbDevices.entries()) {
      merged.set(id, dev);
    }
    for (const [id, dev] of this.wsDevices.entries()) {
      merged.set(id, dev);
    }
    const list = Array.from(merged.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    for (const cb of this.presenceListeners) {
      cb(list);
    }
  }

  private notifyMessage(msg: SignalingEnvelope) {
    for (const cb of this.messageListeners) {
      cb(msg);
    }
  }

  private emitTransportStatus() {
    const activeTransport =
      this.supabaseConnected && this.wsConnected
        ? 'Supabase Realtime + WebSocket Relay'
        : this.supabaseConnected
        ? 'Supabase Realtime'
        : this.wsConnected
        ? 'EchoLink Realtime WebSocket'
        : 'Reconnecting...';

    for (const cb of this.statusListeners) {
      cb({
        wsConnected: this.wsConnected,
        supabaseConnected: this.supabaseConnected,
        activeTransport,
      });
    }
  }

  public onMessage(cb: MessageListener) {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  public onPresence(cb: PresenceListener) {
    this.presenceListeners.add(cb);
    return () => this.presenceListeners.delete(cb);
  }

  public onStatus(cb: StatusListener) {
    this.statusListeners.add(cb);
    this.emitTransportStatus();
    return () => this.statusListeners.delete(cb);
  }

  public disconnect() {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.supabaseChannel) {
      this.supabaseChannel.unsubscribe();
      this.supabaseChannel = null;
    }
  }
}
