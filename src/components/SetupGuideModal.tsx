import React, { useState } from 'react';
import { X, Server, Shield, Check, Database, Globe } from 'lucide-react';
import { RuntimeConfig } from '../types/echolink';

interface SetupGuideModalProps {
  isOpen: boolean;
  config: RuntimeConfig;
  activeTransport: string;
  onClose: () => void;
  onSaveCustomConfig: (custom: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    turnUrl: string;
    turnUsername: string;
    turnCredential: string;
  }) => void;
}

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({
  isOpen,
  config,
  activeTransport,
  onClose,
  onSaveCustomConfig,
}) => {
  const [supabaseUrl, setSupabaseUrl] = useState(
    localStorage.getItem('echolink_supabase_url') || config.supabaseUrl || ''
  );
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(
    localStorage.getItem('echolink_supabase_anon_key') || config.supabaseAnonKey || ''
  );
  const [turnUrl, setTurnUrl] = useState(
    localStorage.getItem('echolink_turn_url') || config.turnUrl || ''
  );
  const [turnUsername, setTurnUsername] = useState(
    localStorage.getItem('echolink_turn_username') || config.turnUsername || ''
  );
  const [turnCredential, setTurnCredential] = useState(
    localStorage.getItem('echolink_turn_credential') || config.turnCredential || ''
  );
  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('echolink_supabase_url', supabaseUrl.trim());
    localStorage.setItem('echolink_supabase_anon_key', supabaseAnonKey.trim());
    localStorage.setItem('echolink_turn_url', turnUrl.trim());
    localStorage.setItem('echolink_turn_username', turnUsername.trim());
    localStorage.setItem('echolink_turn_credential', turnCredential.trim());

    onSaveCustomConfig({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      turnUrl: turnUrl.trim(),
      turnUsername: turnUsername.trim(),
      turnCredential: turnCredential.trim(),
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0B0E17] border border-slate-800 p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Signaling, Supabase Realtime & TURN Relay Configuration
            </h2>
            <p className="text-xs font-mono text-cyan-300 mt-0.5">
              Active Signaling Transport: {activeTransport}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Architecture Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-100">
              <Database className="w-4 h-4 text-violet-400" />
              <span>1. Supabase Realtime + WebSocket Signaling</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              EchoLink uses a dual-transport signaling engine. Out of the box, it connects to the built-in Express WebSocket signaling server (<code className="text-slate-200">/ws</code>) AND attaches to <strong className="text-slate-200">Supabase Realtime</strong> Presence & Broadcast channels when <code className="text-slate-200">VITE_SUPABASE_URL</code> and <code className="text-slate-200">VITE_SUPABASE_ANON_KEY</code> are configured. Never use a Supabase <code className="text-rose-300">service_role</code> key in the browser.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-100">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>2. STUN Discovery & TURN Relay Fallback</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              WebRTC uses STUN (<code className="text-slate-200">stun:stun.l.google.com:19302</code>) to discover public IP/port mappings for direct peer-to-peer audio. When PC and phone are on different networks behind strict symmetric NATs or carrier-grade NAT (5G/LTE), configure a <strong className="text-slate-200">TURN relay server</strong> below so encrypted audio packets relay reliably.
            </p>
          </div>
        </div>

        {/* Interactive Configuration Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Server className="w-4 h-4 text-violet-400" />
              <span>Supabase Realtime Credentials (Optional Override)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  VITE_SUPABASE_URL
                </label>
                <input
                  type="url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  VITE_SUPABASE_ANON_KEY (Public Anon Key Only)
                </label>
                <input
                  type="password"
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-violet-400"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span>WebRTC TURN Server Relay (For Cross-Network / Cellular NATs)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  VITE_TURN_URL
                </label>
                <input
                  type="text"
                  value={turnUrl}
                  onChange={(e) => setTurnUrl(e.target.value)}
                  placeholder="turn:turn.example.com:3478"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  VITE_TURN_USERNAME
                </label>
                <input
                  type="text"
                  value={turnUsername}
                  onChange={(e) => setTurnUsername(e.target.value)}
                  placeholder="turn_user"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  VITE_TURN_CREDENTIAL
                </label>
                <input
                  type="password"
                  value={turnCredential}
                  onChange={(e) => setTurnCredential(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              {savedNotice ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Applied Live</span>
                </>
              ) : (
                <span>Save & Reconnect</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
