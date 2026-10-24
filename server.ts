import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface ConnectedDevice {
  deviceId: string;
  deviceName: string;
  role: 'pc-transmitter' | 'mobile-receiver';
  platform: string;
  status: 'online' | 'pairing' | 'connected' | 'streaming' | 'disconnected';
  sessionId: string | null;
  pairingCode: string | null;
  lastSeenAt: number;
  isStreamingAudio: boolean;
  ws: WebSocket;
}

interface ServerSession {
  sessionId: string;
  pairingCode: string;
  sessionToken: string;
  hostDeviceId: string;
  hostDeviceName: string;
  createdAt: number;
  authorizedDeviceIds: Set<string>;
  isStreaming: boolean;
  audioSourceLabel?: string;
}

const devices = new Map<string, ConnectedDevice>();
const sessions = new Map<string, ServerSession>();
const codeToSessionId = new Map<string, string>();

function generatePairingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

function serializeDevices() {
  return Array.from(devices.values()).map((d) => ({
    deviceId: d.deviceId,
    deviceName: d.deviceName,
    role: d.role,
    platform: d.platform,
    status: d.status,
    sessionId: d.sessionId,
    pairingCode: d.pairingCode,
    lastSeenAt: d.lastSeenAt,
    isStreamingAudio: d.isStreamingAudio,
  }));
}

function serializeSession(s: ServerSession) {
  return {
    sessionId: s.sessionId,
    pairingCode: s.pairingCode,
    sessionToken: s.sessionToken,
    hostDeviceId: s.hostDeviceId,
    hostDeviceName: s.hostDeviceName,
    createdAt: s.createdAt,
    connectedPeerIds: Array.from(s.authorizedDeviceIds),
    isStreaming: s.isStreaming,
    audioSourceLabel: s.audioSourceLabel,
  };
}

function broadcastPresence() {
  const payload = {
    type: 'presence:sync',
    fromDeviceId: 'server',
    payload: {
      devices: serializeDevices(),
    },
    timestamp: Date.now(),
  };
  const message = JSON.stringify(payload);
  for (const client of devices.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

function sendToDevice(deviceId: string, data: any) {
  const target = devices.get(deviceId);
  if (target && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/config', (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const detectedAppUrl =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL.replace(/\/$/, '')
        : `${protocol}://${host}`;

    res.json({
      appUrl: detectedAppUrl,
      supabaseConfigured: Boolean(
        process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
      ),
      supabaseUrl: process.env.VITE_SUPABASE_URL || '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
      turnConfigured: Boolean(process.env.VITE_TURN_URL),
      turnUrl: process.env.VITE_TURN_URL || '',
      turnUsername: process.env.VITE_TURN_USERNAME || '',
      turnCredential: process.env.VITE_TURN_CREDENTIAL || '',
    });
  });

  app.get('/api/sessions/lookup/:codeOrId', (req, res) => {
    const raw = (req.params.codeOrId || '').trim();
    const upper = raw.toUpperCase();
    const sessionId = codeToSessionId.get(upper) || raw;
    const session = sessions.get(sessionId);

    if (!session) {
      res.status(404).json({
        error: 'Session not found. Verify the pairing code on the host PC.',
      });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      pairingCode: session.pairingCode,
      hostDeviceId: session.hostDeviceId,
      hostDeviceName: session.hostDeviceName,
      isStreaming: session.isStreaming,
    });
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let boundDeviceId: string | null = null;

    ws.on('message', (rawBuffer) => {
      try {
        const msg = JSON.parse(rawBuffer.toString());
        const now = Date.now();
        const fromId: string = msg.fromDeviceId;

        if (!fromId) return;

        if (msg.type === 'device:announce') {
          boundDeviceId = fromId;
          const existing = devices.get(fromId);
          devices.set(fromId, {
            deviceId: fromId,
            deviceName: String(msg.payload?.deviceName || 'EchoLink Node').slice(0, 42),
            role: msg.payload?.role === 'mobile-receiver' ? 'mobile-receiver' : 'pc-transmitter',
            platform: String(msg.payload?.platform || 'Browser').slice(0, 36),
            status: msg.payload?.status || existing?.status || 'online',
            sessionId: existing?.sessionId || null,
            pairingCode: existing?.pairingCode || null,
            lastSeenAt: now,
            isStreamingAudio: Boolean(existing?.isStreamingAudio),
            ws,
          });
          broadcastPresence();
          return;
        }

        const sender = devices.get(fromId);
        if (sender) {
          sender.lastSeenAt = now;
          sender.ws = ws;
        }

        if (msg.type === 'device:update') {
          if (sender) {
            if (msg.payload?.deviceName) {
              sender.deviceName = String(msg.payload.deviceName).slice(0, 42);
            }
            if (msg.payload?.role) {
              sender.role = msg.payload.role;
            }
            if (msg.payload?.status) {
              sender.status = msg.payload.status;
            }
            if (typeof msg.payload?.isStreamingAudio === 'boolean') {
              sender.isStreamingAudio = msg.payload.isStreamingAudio;
            }
            broadcastPresence();
          }
          return;
        }

        if (msg.type === 'session:created') {
          // Host creates a new expiring audio session
          let pairingCode = generatePairingCode();
          while (codeToSessionId.has(pairingCode)) {
            pairingCode = generatePairingCode();
          }
          const sessionId =
            msg.payload?.sessionId || `el_${crypto.randomBytes(8).toString('hex')}`;
          const sessionToken =
            msg.payload?.sessionToken || crypto.randomBytes(16).toString('hex');

          const newSession: ServerSession = {
            sessionId,
            pairingCode,
            sessionToken,
            hostDeviceId: fromId,
            hostDeviceName: sender?.deviceName || msg.payload?.hostDeviceName || 'Desktop Host',
            createdAt: now,
            authorizedDeviceIds: new Set([fromId]),
            isStreaming: false,
          };

          sessions.set(sessionId, newSession);
          codeToSessionId.set(pairingCode, sessionId);

          if (sender) {
            sender.sessionId = sessionId;
            sender.pairingCode = pairingCode;
            sender.status = 'online';
          }

          sendToDevice(fromId, {
            type: 'session:created',
            sessionId,
            pairingCode,
            sessionToken,
            fromDeviceId: 'server',
            payload: serializeSession(newSession),
            timestamp: now,
          });

          broadcastPresence();
          return;
        }

        if (msg.type === 'pair:request') {
          const requestedCode = (msg.pairingCode || msg.payload?.pairingCode || '')
            .trim()
            .toUpperCase();
          const requestedSessionId =
            msg.sessionId ||
            msg.payload?.sessionId ||
            codeToSessionId.get(requestedCode);

          const session = requestedSessionId ? sessions.get(requestedSessionId) : undefined;

          if (!session) {
            sendToDevice(fromId, {
              type: 'error:notice',
              fromDeviceId: 'server',
              payload: {
                code: 'SESSION_NOT_FOUND',
                message:
                  'Audio session not found. Check the 6-character code or scan the QR code on your PC.',
              },
              timestamp: now,
            });
            return;
          }

          // If pairing via QR with a valid sessionToken, or manual pairing code, notify host
          if (sender) {
            sender.status = 'pairing';
            sender.sessionId = session.sessionId;
          }
          const hostDev = devices.get(session.hostDeviceId);
          if (hostDev && hostDev.status === 'online') {
            hostDev.status = 'pairing';
          }

          const autoApprove =
            msg.sessionToken && msg.sessionToken === session.sessionToken;

          if (autoApprove) {
            session.authorizedDeviceIds.add(fromId);
            if (sender) sender.status = 'connected';
            if (hostDev) {
              hostDev.status = session.isStreaming ? 'streaming' : 'connected';
            }

            sendToDevice(fromId, {
              type: 'pair:accept',
              sessionId: session.sessionId,
              sessionToken: session.sessionToken,
              pairingCode: session.pairingCode,
              fromDeviceId: session.hostDeviceId,
              targetDeviceId: fromId,
              payload: {
                session: serializeSession(session),
                hostDeviceName: session.hostDeviceName,
                autoApprovedByToken: true,
              },
              timestamp: now,
            });

            sendToDevice(session.hostDeviceId, {
              type: 'pair:accept',
              sessionId: session.sessionId,
              sessionToken: session.sessionToken,
              pairingCode: session.pairingCode,
              fromDeviceId: fromId,
              targetDeviceId: session.hostDeviceId,
              payload: {
                peerDeviceId: fromId,
                peerDeviceName: sender?.deviceName || msg.payload?.deviceName || 'Mobile Receiver',
                peerPlatform: sender?.platform || msg.payload?.platform || 'Phone',
                session: serializeSession(session),
                autoApprovedByToken: true,
              },
              timestamp: now,
            });
            broadcastPresence();
            return;
          }

          // Send explicit pairing request to host PC
          sendToDevice(session.hostDeviceId, {
            type: 'pair:request',
            sessionId: session.sessionId,
            pairingCode: session.pairingCode,
            fromDeviceId: fromId,
            targetDeviceId: session.hostDeviceId,
            payload: {
              requestId: `req_${crypto.randomBytes(4).toString('hex')}`,
              sessionId: session.sessionId,
              pairingCode: session.pairingCode,
              fromDeviceId: fromId,
              fromDeviceName: sender?.deviceName || msg.payload?.deviceName || 'Mobile Receiver',
              fromPlatform: sender?.platform || msg.payload?.platform || 'Mobile Browser',
              timestamp: now,
            },
            timestamp: now,
          });
          broadcastPresence();
          return;
        }

        if (msg.type === 'pair:accept') {
          const session = msg.sessionId ? sessions.get(msg.sessionId) : undefined;
          const targetId = msg.targetDeviceId;
          if (!session || !targetId || session.hostDeviceId !== fromId) return;

          session.authorizedDeviceIds.add(targetId);
          const peerDev = devices.get(targetId);
          if (peerDev) {
            peerDev.status = 'connected';
            peerDev.sessionId = session.sessionId;
          }
          if (sender) {
            sender.status = session.isStreaming ? 'streaming' : 'connected';
          }

          sendToDevice(targetId, {
            type: 'pair:accept',
            sessionId: session.sessionId,
            sessionToken: session.sessionToken,
            pairingCode: session.pairingCode,
            fromDeviceId: fromId,
            targetDeviceId: targetId,
            payload: {
              session: serializeSession(session),
              hostDeviceName: session.hostDeviceName,
            },
            timestamp: now,
          });

          sendToDevice(fromId, {
            type: 'session:updated',
            sessionId: session.sessionId,
            fromDeviceId: 'server',
            payload: serializeSession(session),
            timestamp: now,
          });
          broadcastPresence();
          return;
        }

        if (msg.type === 'pair:reject') {
          const targetId = msg.targetDeviceId;
          const session = msg.sessionId ? sessions.get(msg.sessionId) : undefined;
          if (targetId) {
            const peerDev = devices.get(targetId);
            if (peerDev) {
              peerDev.status = 'online';
              peerDev.sessionId = null;
            }
            sendToDevice(targetId, {
              type: 'pair:reject',
              sessionId: msg.sessionId,
              fromDeviceId: fromId,
              targetDeviceId: targetId,
              payload: { reason: 'Connection declined by host PC.' },
              timestamp: now,
            });
          }
          if (sender && session && session.authorizedDeviceIds.size <= 1) {
            sender.status = 'online';
          }
          broadcastPresence();
          return;
        }

        // Validate session membership for WebRTC signaling messages
        if (
          msg.type === 'webrtc:offer' ||
          msg.type === 'webrtc:answer' ||
          msg.type === 'webrtc:ice-candidate' ||
          msg.type === 'stream:state'
        ) {
          const session = msg.sessionId ? sessions.get(msg.sessionId) : undefined;
          if (!session) {
            sendToDevice(fromId, {
              type: 'error:notice',
              fromDeviceId: 'server',
              payload: {
                code: 'INVALID_SESSION',
                message: 'Cannot relay WebRTC signaling: session is not active.',
              },
              timestamp: now,
            });
            return;
          }

          if (!session.authorizedDeviceIds.has(fromId)) {
            sendToDevice(fromId, {
              type: 'error:notice',
              fromDeviceId: 'server',
              payload: {
                code: 'UNAUTHORIZED_PEER',
                message: 'Unauthorized signaling attempt rejected: device is not paired with this session.',
              },
              timestamp: now,
            });
            return;
          }

          if (msg.type === 'stream:state') {
            session.isStreaming = Boolean(msg.payload?.isStreaming);
            session.audioSourceLabel = msg.payload?.audioSourceLabel || '';
            if (sender) {
              sender.isStreamingAudio = session.isStreaming;
              sender.status = session.isStreaming ? 'streaming' : 'connected';
            }
            for (const memberId of session.authorizedDeviceIds) {
              if (memberId !== fromId) {
                sendToDevice(memberId, msg);
              }
            }
            broadcastPresence();
            return;
          }

          if (msg.targetDeviceId && session.authorizedDeviceIds.has(msg.targetDeviceId)) {
            sendToDevice(msg.targetDeviceId, msg);
          } else {
            for (const memberId of session.authorizedDeviceIds) {
              if (memberId !== fromId) {
                sendToDevice(memberId, msg);
              }
            }
          }
          return;
        }

        if (msg.type === 'session:ended') {
          const session = msg.sessionId ? sessions.get(msg.sessionId) : undefined;
          if (session) {
            for (const memberId of session.authorizedDeviceIds) {
              if (memberId !== fromId) {
                sendToDevice(memberId, {
                  type: 'session:ended',
                  sessionId: session.sessionId,
                  fromDeviceId: fromId,
                  payload: { reason: msg.payload?.reason || 'Session closed by peer.' },
                  timestamp: now,
                });
              }
              const dev = devices.get(memberId);
              if (dev) {
                dev.status = 'online';
                dev.sessionId = null;
                dev.pairingCode = null;
                dev.isStreamingAudio = false;
              }
            }
            codeToSessionId.delete(session.pairingCode);
            sessions.delete(session.sessionId);
            broadcastPresence();
          }
          return;
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      if (boundDeviceId) {
        const departing = devices.get(boundDeviceId);
        if (departing?.sessionId) {
          const session = sessions.get(departing.sessionId);
          if (session) {
            session.authorizedDeviceIds.delete(boundDeviceId);
            for (const memberId of session.authorizedDeviceIds) {
              sendToDevice(memberId, {
                type: 'device:leave',
                sessionId: session.sessionId,
                fromDeviceId: boundDeviceId,
                payload: { deviceId: boundDeviceId, deviceName: departing.deviceName },
                timestamp: Date.now(),
              });
            }
            if (session.hostDeviceId === boundDeviceId) {
              codeToSessionId.delete(session.pairingCode);
              sessions.delete(session.sessionId);
            }
          }
        }
        devices.delete(boundDeviceId);
        broadcastPresence();
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EchoLink server & WebSocket signaling listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
