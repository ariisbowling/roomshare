"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  type TrackReference,
  useChat,
  useConnectionState,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTrackToggle,
  useTracks,
} from "@livekit/components-react";
import { AudioPresets, ConnectionState, Participant, RoomOptions, Track } from "livekit-client";
import {
  Check,
  Copy,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Send,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// ---- quality settings -------------------------------------------------------
// "Sharp" for code/text/slides. "Smooth" for movies/games: motion priority and
// a lower cap, which is still well above what 1440p streaming services use.
const SHARE_MODES = {
  sharp: { label: "Sharp", desc: "text & code", hint: "detail" as const, bitrate: 20_000_000, fps: 60 },
  smooth: { label: "Smooth", desc: "video & games", hint: "motion" as const, bitrate: 12_000_000, fps: 60 },
  movie: { label: "Movie", desc: "films, saves data", hint: "motion" as const, bitrate: 6_000_000, fps: 30 },
};
type ShareMode = keyof typeof SHARE_MODES;

const roomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    videoCodec: "vp9",
    screenShareEncoding: { maxBitrate: SHARE_MODES.sharp.bitrate, maxFramerate: SHARE_MODES.sharp.fps },
    screenShareSimulcastLayers: [],
    audioPreset: AudioPresets.musicHighQualityStereo,
    dtx: true,
    red: true,
  },
};

// ---- root -------------------------------------------------------------------
export default function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const camOnJoin = params.get("cam") === "1";
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  useEffect(() => {
    if (!name) {
      router.replace(`/?code=${code}`);
      return;
    }
    fetch(`/api/token?room=${code}&name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => (d.token ? setToken(d.token) : setError(d.error)))
      .catch((e) => setError(String(e)));
  }, [code, name, router]);

  if (error) return <Center>{error}</Center>;
  if (!url) return <Center>NEXT_PUBLIC_LIVEKIT_URL is not set</Center>;
  if (!token) return <Center>Joining {code}…</Center>;

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      options={roomOptions}
      connect
      audio
      video={camOnJoin}
      onDisconnected={() => router.push("/")}
      className="h-dvh flex flex-col bg-[#0b0b0d] text-neutral-200 select-none"
    >
      <Shell code={code} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function Shell({ code }: { code: string }) {
  const [panel, setPanel] = useState<"none" | "chat" | "people">("none");
  const participants = useParticipants();
  const state = useConnectionState();

  return (
    <>
      <header className="h-12 shrink-0 flex items-center justify-between px-3 sm:px-4">
        <CodePill code={code} />
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              state === ConnectionState.Connected ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
            }`}
          />
          {state === ConnectionState.Connected ? `${participants.length} here` : state}
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <main className="flex-1 min-w-0 relative px-3 sm:px-4 pb-2">
          <Stage />
        </main>
        <SidePanel panel={panel} onClose={() => setPanel("none")} />
      </div>

      <Controls panel={panel} setPanel={setPanel} />
    </>
  );
}

// ---- header -----------------------------------------------------------------
function CodePill({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="group flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/10 pl-3 pr-2 py-1 transition"
      title="Copy invite link"
      onClick={() => {
        navigator.clipboard?.writeText(`${location.origin}/?code=${code}`).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <span className="font-mono text-sm tracking-[0.25em] text-neutral-300">{code}</span>
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-neutral-500 group-hover:text-neutral-300" />}
    </button>
  );
}

// ---- stage ------------------------------------------------------------------
function Stage() {
  const screens = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const cams = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], { onlySubscribed: false });
  const participants = useParticipants();
  const screen = screens.find(isTrackReference);
  const camRefs = cams.filter(isTrackReference);

  if (screen) {
    return (
      <div className="h-full w-full relative rounded-xl overflow-hidden bg-black">
        <VideoTrack trackRef={screen} className="h-full w-full object-contain" />
        <div className="absolute top-2 left-2 text-xs px-2 py-1 rounded-md bg-black/50 backdrop-blur text-neutral-300">
          {screen.participant.name || screen.participant.identity}
          {screen.participant.isLocal ? " (you)" : ""}
        </div>
        {camRefs.length > 0 && (
          <div className="absolute bottom-2 right-2 flex gap-2">
            {camRefs.map((t) => (
              <div key={t.publication.trackSid} className="w-40 aspect-video rounded-lg overflow-hidden shadow-lg">
                <CamTile trackRef={t} compact />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (camRefs.length > 0) {
    const cols = camRefs.length <= 1 ? 1 : camRefs.length <= 4 ? 2 : 3;
    return (
      <div className="h-full w-full grid gap-3 content-center" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {camRefs.map((t) => (
          <div key={t.publication.trackSid} className="aspect-video max-h-full rounded-xl overflow-hidden">
            <CamTile trackRef={t} />
          </div>
        ))}
        {participants
          .filter((p) => !camRefs.some((t) => t.participant.identity === p.identity))
          .map((p) => (
            <div key={p.identity} className="aspect-video rounded-xl bg-white/[0.03] flex items-center justify-center">
              <VoiceAvatar participant={p} size={72} />
            </div>
          ))}
      </div>
    );
  }

  // Voice only.
  return (
    <div className="h-full w-full flex flex-wrap items-center justify-center gap-10 sm:gap-14">
      {participants.map((p) => (
        <VoiceAvatar key={p.identity} participant={p} size={96} />
      ))}
    </div>
  );
}

function CamTile({ trackRef, compact }: { trackRef: TrackReference; compact?: boolean }) {
  const p = trackRef.participant;
  const speaking = useIsSpeaking(p);
  const muted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  return (
    <div className={`relative h-full w-full bg-black ring-2 transition ${speaking ? "ring-emerald-400" : "ring-transparent"}`}>
      <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" style={p.isLocal ? { transform: "scaleX(-1)" } : undefined} />
      <div className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/50 backdrop-blur text-neutral-200 ${compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"}`}>
        {muted && <MicOff size={compact ? 10 : 12} className="text-red-400" />}
        {p.name || p.identity}
        {p.isLocal ? " (you)" : ""}
      </div>
    </div>
  );
}

function VoiceAvatar({ participant: p, size }: { participant: Participant; size: number }) {
  const speaking = useIsSpeaking(p);
  const muted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  const label = p.name || p.identity;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative rounded-full flex items-center justify-center font-medium text-white transition-all duration-150 ${
          speaking ? "ring-4 ring-emerald-400 ring-offset-4 ring-offset-[#0b0b0d]" : "ring-0"
        }`}
        style={{ width: size, height: size, background: hue(label), fontSize: size * 0.38 }}
      >
        {label.slice(0, 1).toUpperCase()}
        {muted && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-[#0b0b0d] p-1.5">
            <MicOff size={14} className="text-red-400" />
          </span>
        )}
      </div>
      <span className="text-sm text-neutral-400">
        {label}
        {p.isLocal ? " (you)" : ""}
      </span>
    </div>
  );
}

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 40%)`;
}

// ---- side panel -------------------------------------------------------------
function SidePanel({ panel, onClose }: { panel: "none" | "chat" | "people"; onClose: () => void }) {
  if (panel === "none") return null;
  return (
    <aside className="absolute inset-0 sm:static sm:w-80 shrink-0 flex flex-col bg-[#0b0b0d] sm:bg-transparent sm:border-l border-white/[0.06] z-20">
      <div className="h-10 flex items-center justify-between px-4 text-xs uppercase tracking-wider text-neutral-500">
        {panel}
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-neutral-400">
          <X size={16} />
        </button>
      </div>
      {panel === "chat" ? <ChatPanel /> : <PeoplePanel />}
    </aside>
  );
}

function PeoplePanel() {
  const participants = useParticipants();
  return (
    <ul className="flex-1 overflow-y-auto px-2 space-y-0.5">
      {participants.map((p) => (
        <PersonRow key={p.identity} p={p} />
      ))}
    </ul>
  );
}

function PersonRow({ p }: { p: Participant }) {
  const speaking = useIsSpeaking(p);
  const muted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  const label = p.name || p.identity;
  return (
    <li className="flex items-center gap-3 px-2 py-1.5 rounded-lg">
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs text-white ring-2 transition ${speaking ? "ring-emerald-400" : "ring-transparent"}`}
        style={{ background: hue(label) }}
      >
        {label.slice(0, 1).toUpperCase()}
      </span>
      <span className="flex-1 text-sm truncate">
        {label}
        {p.isLocal && <span className="text-neutral-500"> (you)</span>}
      </span>
      {muted ? <MicOff size={14} className="text-neutral-600" /> : <Mic size={14} className="text-neutral-600" />}
    </li>
  );
}

function ChatPanel() {
  const { chatMessages, send, isSending } = useChat();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [chatMessages.length]);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await send(t);
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 space-y-3 text-sm">
        {chatMessages.length === 0 && <p className="text-neutral-600 text-xs pt-4">No messages yet.</p>}
        {chatMessages.map((m) => (
          <div key={m.id ?? m.timestamp}>
            <div className="flex items-baseline gap-2">
              <span className="text-neutral-400 text-xs">{m.from?.name || m.from?.identity || "?"}</span>
              <span className="text-neutral-700 text-[10px]">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="text-neutral-200 break-words select-text">{m.message}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-blue-500 transition"
          placeholder="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition" disabled={isSending || !text.trim()}>
          <Send size={16} />
        </button>
      </form>
    </>
  );
}

// ---- controls ---------------------------------------------------------------
function Controls({ panel, setPanel }: { panel: "none" | "chat" | "people"; setPanel: (p: "none" | "chat" | "people") => void }) {
  const room = useRoomContext();
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const { chatMessages } = useChat();
  const [seen, setSeen] = useState(0);
  const unread = panel === "chat" ? 0 : chatMessages.length - seen;
  function changePanel(next: "none" | "chat" | "people") {
    if (panel === "chat" || next === "chat") setSeen(chatMessages.length);
    setPanel(next);
  }

  return (
    <footer className="shrink-0 flex justify-center px-3 pb-3 pt-1">
      <div className="flex items-center gap-1.5 rounded-2xl bg-white/[0.05] border border-white/[0.06] p-1.5 shadow-2xl">
        <Ctl on={mic.enabled} off pending={mic.pending} onClick={() => mic.toggle()} title={mic.enabled ? "Mute" : "Unmute"}>
          {mic.enabled ? <Mic size={18} /> : <MicOff size={18} />}
        </Ctl>
        <Ctl on={cam.enabled} pending={cam.pending} onClick={() => cam.toggle()} title={cam.enabled ? "Camera off" : "Camera on"}>
          {cam.enabled ? <Video size={18} /> : <VideoOff size={18} />}
        </Ctl>
        <ShareControl />
        <Divider />
        <Ctl on={panel === "chat"} onClick={() => changePanel(panel === "chat" ? "none" : "chat")} title="Chat" badge={unread}>
          <MessageSquare size={18} />
        </Ctl>
        <Ctl on={panel === "people"} onClick={() => changePanel(panel === "people" ? "none" : "people")} title="People">
          <Users size={18} />
        </Ctl>
        <FullscreenControl />
        <Divider />
        <button
          className="h-10 px-3 rounded-xl bg-red-500/90 hover:bg-red-500 text-white flex items-center gap-1.5 text-sm transition"
          onClick={() => room.disconnect()}
          title="Leave"
        >
          <PhoneOff size={16} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </footer>
  );
}

function Ctl({
  on,
  off,
  pending,
  onClick,
  title,
  badge,
  children,
}: {
  on: boolean;
  off?: boolean; // style "off" state as a warning (mic muted)
  pending?: boolean;
  onClick: () => void;
  title: string;
  badge?: number;
  children: React.ReactNode;
}) {
  const cls = on ? "bg-white/10 text-white" : off ? "bg-red-500/15 text-red-300" : "text-neutral-400 hover:text-white hover:bg-white/5";
  return (
    <button className={`relative h-10 w-10 rounded-xl flex items-center justify-center transition disabled:opacity-50 ${cls}`} onClick={onClick} disabled={pending} title={title}>
      {children}
      {badge ? (
        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-blue-500 text-[10px] text-white flex items-center justify-center">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-6 bg-white/10 mx-0.5" />;
}

function ShareControl() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [mode, setMode] = useState<ShareMode>("sharp");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function start(m: ShareMode) {
    const cfg = SHARE_MODES[m];
    setBusy(true);
    try {
      if (isScreenShareEnabled) await localParticipant.setScreenShareEnabled(false);
      await localParticipant.setScreenShareEnabled(
        true,
        {
          contentHint: cfg.hint,
          resolution: { width: 2560, height: 1440, frameRate: cfg.fps },
          audio: true,
          systemAudio: "include",
          selfBrowserSurface: "exclude",
        },
        {
          videoCodec: "vp9",
          screenShareEncoding: { maxBitrate: cfg.bitrate, maxFramerate: cfg.fps },
          screenShareSimulcastLayers: [],
        },
      );
    } catch {
      /* picker cancelled */
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await localParticipant.setScreenShareEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative flex">
      <button
        className={`h-10 pl-3 pr-2 rounded-l-xl flex items-center gap-2 text-sm transition disabled:opacity-50 ${
          isScreenShareEnabled ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"
        }`}
        onClick={() => (isScreenShareEnabled ? stop() : start(mode))}
        disabled={busy}
        title={isScreenShareEnabled ? "Stop sharing" : "Share screen"}
      >
        {isScreenShareEnabled ? <MonitorX size={18} /> : <MonitorUp size={18} />}
        <span className="hidden sm:inline">{isScreenShareEnabled ? "Stop" : "Share"}</span>
      </button>
      <button
        className={`h-10 px-2 rounded-r-xl text-[11px] font-medium border-l border-black/30 transition ${
          isScreenShareEnabled ? "bg-blue-600 text-blue-100" : "text-neutral-500 hover:text-white hover:bg-white/5"
        }`}
        onClick={() => setOpen((o) => !o)}
        title="Share quality"
      >
        {SHARE_MODES[mode].label}
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 w-52 rounded-xl bg-[#17171a] border border-white/10 shadow-2xl p-1 z-30">
          {(Object.keys(SHARE_MODES) as ShareMode[]).map((k) => (
            <button
              key={k}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between hover:bg-white/5 ${
                mode === k ? "text-white" : "text-neutral-400"
              }`}
              onClick={() => {
                setMode(k);
                setOpen(false);
                if (isScreenShareEnabled) start(k);
              }}
            >
              <span>
                {SHARE_MODES[k].label}
                <span className="block text-[11px] text-neutral-500">{SHARE_MODES[k].desc}</span>
              </span>
              {mode === k && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FullscreenControl() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  return (
    <Ctl
      on={false}
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
      title={fs ? "Exit fullscreen" : "Fullscreen"}
    >
      {fs ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
    </Ctl>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh flex items-center justify-center bg-[#0b0b0d] text-neutral-400 text-sm">{children}</div>;
}
