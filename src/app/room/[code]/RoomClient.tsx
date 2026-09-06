"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  type TrackReference,
  useChat,
  useConnectionState,
  useDataChannel,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useMediaDeviceSelect,
  useParticipants,
  useRemoteParticipants,
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
  Music,
  PhoneOff,
  Send,
  Settings,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SFX, playSfx, type SfxId } from "@/lib/sfx";

// ---- quality settings -------------------------------------------------------
// "Sharp" for code/text/slides. "Smooth" for video/games. "Movie" for films:
// films are 24 fps, so a 30 fps cap loses nothing and halves the data.
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

type Panel = "none" | "chat" | "people";

// ---- volume state -----------------------------------------------------------
type Volumes = { voice: number; movie: number; sfx: number; person: Record<string, number> };
const VolumeCtx = createContext<{ v: Volumes; set: (patch: Partial<Volumes>) => void; setPerson: (id: string, vol: number) => void }>(null!);

function VolumeProvider({ children }: { children: React.ReactNode }) {
  const [v, setV] = useState<Volumes>({ voice: 1, movie: 1, sfx: 0.7, person: {} });
  const set = useCallback((patch: Partial<Volumes>) => setV((o) => ({ ...o, ...patch })), []);
  const setPerson = useCallback((id: string, vol: number) => setV((o) => ({ ...o, person: { ...o.person, [id]: vol } })), []);
  return <VolumeCtx.Provider value={{ v, set, setPerson }}>{children}</VolumeCtx.Provider>;
}

/** Applies voice/movie/per-person volumes to every remote audio track. */
function AudioMixer() {
  const { v } = useContext(VolumeCtx);
  const remotes = useRemoteParticipants();
  // Re-run when audio tracks appear or disappear.
  const audioTracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true });
  useEffect(() => {
    for (const p of remotes) {
      p.setVolume(v.voice * (v.person[p.identity] ?? 1), Track.Source.Microphone);
      p.setVolume(v.movie, Track.Source.ScreenShareAudio);
    }
  }, [v, remotes, audioTracks.length]);
  return null;
}

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
      className="h-dvh flex flex-col bg-bg text-ink select-none"
    >
      <VolumeProvider>
        <Shell code={code} />
        <AudioMixer />
        <SfxReceiver />
      </VolumeProvider>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function Shell({ code }: { code: string }) {
  const [panel, setPanel] = useState<Panel>("none");
  const participants = useParticipants();
  const state = useConnectionState();
  const stageRef = useRef<HTMLElement>(null);
  const [theater, setTheater] = useState(false);

  useEffect(() => {
    const h = () => setTheater(!!document.fullscreenElement && document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleTheater = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stageRef.current?.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "f" && !(e.target instanceof HTMLInputElement)) toggleTheater();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [toggleTheater]);

  return (
    <>
      <header className="h-12 shrink-0 flex items-center justify-between px-3 sm:px-4">
        <CodePill code={code} />
        <div className="flex items-center gap-1.5 text-xs text-mute">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${state === ConnectionState.Connected ? "bg-accent" : "bg-amber-400 animate-pulse"}`} />
          {state === ConnectionState.Connected ? `${participants.length} here` : state}
        </div>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <main ref={stageRef} className={`flex-1 min-w-0 relative ${theater ? "bg-black" : "px-3 sm:px-4 pb-2"}`} onDoubleClick={toggleTheater}>
          <Stage theater={theater} />
          {theater && <TheaterOverlay onExit={toggleTheater} />}
        </main>
        <SidePanel panel={panel} onClose={() => setPanel("none")} />
      </div>

      <Controls panel={panel} setPanel={setPanel} onTheater={toggleTheater} />
    </>
  );
}

// ---- header -----------------------------------------------------------------
function CodePill({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="group flex items-center gap-2 rounded-full hover:bg-surface pl-3 pr-2 py-1 transition"
      title="Copy invite link"
      onClick={() => {
        navigator.clipboard?.writeText(`${location.origin}/?code=${code}`).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      <span className="font-mono text-sm tracking-[0.25em] text-ink/80">{code}</span>
      {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} className="text-mute group-hover:text-ink/80" />}
    </button>
  );
}

// ---- stage ------------------------------------------------------------------
function Stage({ theater }: { theater: boolean }) {
  const screens = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], { onlySubscribed: false });
  const cams = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], { onlySubscribed: false });
  const participants = useParticipants();
  const screen = screens.find(isTrackReference);
  const camRefs = cams.filter(isTrackReference);

  if (screen) {
    return (
      <div className={`h-full w-full relative overflow-hidden bg-black ${theater ? "" : "rounded-xl"}`}>
        <VideoTrack trackRef={screen} className="h-full w-full object-contain" />
        {!theater && (
          <div className="absolute top-2 left-2 text-xs px-2 py-1 rounded-md bg-black/50 backdrop-blur text-ink/80">
            {screen.participant.name || screen.participant.identity}
            {screen.participant.isLocal ? " (you)" : ""}
          </div>
        )}
        {camRefs.length > 0 && !theater && (
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
            <div key={p.identity} className="aspect-video rounded-xl bg-surface flex items-center justify-center">
              <VoiceAvatar participant={p} size={72} />
            </div>
          ))}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-wrap items-center justify-center gap-10 sm:gap-14">
      <AnimatePresence mode="popLayout">
        {participants.map((p) => (
          <motion.div
            key={p.identity}
            layout
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <VoiceAvatar participant={p} size={96} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CamTile({ trackRef, compact }: { trackRef: TrackReference; compact?: boolean }) {
  const p = trackRef.participant;
  const speaking = useIsSpeaking(p);
  const muted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  return (
    <div className={`relative h-full w-full bg-black ring-2 transition ${speaking ? "ring-accent" : "ring-transparent"}`}>
      <VideoTrack trackRef={trackRef} className="h-full w-full object-cover" style={p.isLocal ? { transform: "scaleX(-1)" } : undefined} />
      <div className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/50 backdrop-blur text-ink ${compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"}`}>
        {muted && <MicOff size={compact ? 10 : 12} className="text-warn" />}
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
      <div className="relative" style={{ width: size, height: size }}>
        <AnimatePresence>
          {speaking && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-accent"
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0.9, 0.35, 0.9], scale: [1.08, 1.16, 1.08] }}
              exit={{ opacity: 0, scale: 1 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </AnimatePresence>
      <div
        className="relative rounded-full flex items-center justify-center font-display text-ink"
        style={{ width: size, height: size, background: hue(label), fontSize: size * 0.46 }}
      >
        {label.slice(0, 1).toLowerCase()}
        {muted && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-bg p-1.5">
            <MicOff size={14} className="text-warn" />
          </span>
        )}
      </div>
      </div>
      <span className="text-sm text-mute">
        {label}
        {p.isLocal ? " (you)" : ""}
      </span>
    </div>
  );
}

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 28% 32%)`;
}

// ---- theater overlay: auto-hides until the mouse moves ----------------------
function TheaterOverlay({ onExit }: { onExit: () => void }) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const { v, set } = useContext(VolumeCtx);
  const { localParticipant } = useLocalParticipant();
  const speaking = useIsSpeaking(localParticipant);

  useEffect(() => {
    const poke = () => {
      setVisible(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), 2500);
    };
    poke();
    document.addEventListener("mousemove", poke);
    document.addEventListener("touchstart", poke);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("mousemove", poke);
      document.removeEventListener("touchstart", poke);
    };
  }, []);

  return (
    <motion.div
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.35 }}
      className={`absolute inset-0 ${visible ? "" : "cursor-none"}`}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2" onDoubleClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 px-3 py-2">
          <Slider label="Movie" value={v.movie} onChange={(x) => set({ movie: x })} />
          <Slider label="Voice" value={v.voice} onChange={(x) => set({ voice: x })} />
        </div>
        <button
          className={`h-11 w-11 rounded-2xl backdrop-blur border border-line flex items-center justify-center transition ${
            mic.enabled ? (speaking ? "bg-accent/90 text-white" : "bg-black/60 text-white") : "bg-warn/90 text-white"
          }`}
          onClick={() => mic.toggle()}
          disabled={mic.pending}
          title={mic.enabled ? "Mute" : "Unmute"}
        >
          {mic.enabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button className="h-11 w-11 rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 flex items-center justify-center text-white" onClick={onExit} title="Exit fullscreen (Esc)">
          <Minimize2 size={20} />
        </button>
      </div>
    </motion.div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink/80">
      <span className="w-10">{label}</span>
      <input type="range" min={0} max={1} step={0.02} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-24 " />
    </label>
  );
}

// ---- side panel -------------------------------------------------------------
function SidePanel({ panel, onClose }: { panel: Panel; onClose: () => void }) {
  return (
    <AnimatePresence initial={false}>
      {panel !== "none" && (
    <motion.aside
      key="side"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: "var(--side-w)", opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      style={{ ["--side-w" as string]: "20rem" }}
      className="absolute inset-0 sm:static sm:!w-[var(--side-w)] shrink-0 flex flex-col overflow-hidden bg-bg sm:bg-transparent sm:border-l border-line z-20"
    >
    <div className="w-full sm:w-80 h-full flex flex-col">
      <div className="h-10 flex items-center justify-between px-4 text-xs uppercase tracking-wider text-mute">
        {panel}
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-mute">
          <X size={16} />
        </button>
      </div>
      {panel === "chat" ? <ChatPanel /> : <PeoplePanel />}
    </div>
    </motion.aside>
      )}
    </AnimatePresence>
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
  const { v, setPerson } = useContext(VolumeCtx);
  const label = p.name || p.identity;
  return (
    <li className="px-2 py-1.5 rounded-lg">
      <div className="flex items-center gap-3">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs text-white ring-2 transition ${speaking ? "ring-accent" : "ring-transparent"}`} style={{ background: hue(label) }}>
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 text-sm truncate">
          {label}
          {p.isLocal && <span className="text-mute"> (you)</span>}
        </span>
        {muted ? <MicOff size={14} className="text-dim" /> : <Mic size={14} className="text-dim" />}
      </div>
      {!p.isLocal && (
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={v.person[p.identity] ?? 1}
          onChange={(e) => setPerson(p.identity, Number(e.target.value))}
          className="w-full mt-1.5  h-1"
          title="Volume for this person"
        />
      )}
    </li>
  );
}

function ChatPanel() {
  const { chatMessages, send, isSending } = useChat();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length]);

  async function submit() {
    const t = text.trim();
    if (!t) return;
    setText("");
    await send(t);
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 space-y-3 text-sm">
        {chatMessages.length === 0 && <p className="text-dim text-xs pt-4">No messages yet.</p>}
        {chatMessages.map((m) => (
          <motion.div key={m.id ?? m.timestamp} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <div className="flex items-baseline gap-2">
              <span className="text-mute text-xs">{m.from?.name || m.from?.identity || "?"}</span>
              <span className="text-dim text-[10px]">{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="text-ink break-words select-text">{m.message}</div>
          </motion.div>
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
          className="flex-1 min-w-0 rounded-lg bg-surface border border-line px-3 py-2 text-sm outline-none focus:border-ink/40 transition"
          placeholder="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="p-2 rounded-lg bg-accent text-bg hover:brightness-110 disabled:opacity-40 transition" disabled={isSending || !text.trim()}>
          <Send size={16} />
        </button>
      </form>
    </>
  );
}

// ---- soundboard -------------------------------------------------------------
const enc = new TextEncoder();
const dec = new TextDecoder();

function SfxReceiver() {
  const { v } = useContext(VolumeCtx);
  const vol = useRef(v.sfx);
  useEffect(() => {
    vol.current = v.sfx;
  }, [v.sfx]);
  useDataChannel("sfx", (msg) => {
    const id = dec.decode(msg.payload) as SfxId;
    if (id in SFX) playSfx(id, vol.current);
  });
  return null;
}

function SoundboardControl() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { send } = useDataChannel("sfx");
  const { v, set } = useContext(VolumeCtx);
  useClickOutside(ref, open, () => setOpen(false));

  function play(id: SfxId) {
    playSfx(id, v.sfx);
    send(enc.encode(id), { reliable: true }).catch(() => {});
  }

  return (
    <div ref={ref} className="relative">
      <Ctl on={open} onClick={() => setOpen((o) => !o)} title="Soundboard">
        <Music size={18} />
      </Ctl>
      <AnimatePresence>
      {open && (
        <Popover className="w-64">
          <div className="grid grid-cols-2 gap-1 p-1">
            {(Object.keys(SFX) as SfxId[]).map((id) => (
              <button key={id} className="px-3 py-2 rounded-lg text-sm text-left text-ink/80 hover:bg-white/10 hover:text-white active:bg-accent active:text-bg transition" onClick={() => play(id)}>
                {SFX[id]}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-line">
            <Slider label="Vol" value={v.sfx} onChange={(x) => set({ sfx: x })} />
          </div>
        </Popover>
      )}
      </AnimatePresence>
    </div>
  );
}

// ---- controls ---------------------------------------------------------------
function Controls({ panel, setPanel, onTheater }: { panel: Panel; setPanel: (p: Panel) => void; onTheater: () => void }) {
  const room = useRoomContext();
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const { chatMessages } = useChat();
  const [seen, setSeen] = useState(0);
  const unread = panel === "chat" ? 0 : chatMessages.length - seen;
  function changePanel(next: Panel) {
    if (panel === "chat" || next === "chat") setSeen(chatMessages.length);
    setPanel(next);
  }

  return (
    <footer className="shrink-0 flex justify-center px-3 pb-3 pt-1">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.1 }}
        className="flex items-center gap-1.5 rounded-2xl bg-surface border border-line p-1.5 shadow-2xl flex-wrap justify-center backdrop-blur"
      >
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
        <VolumeControl />
        <SoundboardControl />
        <DevicesControl />
        <Ctl on={false} onClick={onTheater} title="Fullscreen (F)">
          <Maximize2 size={18} />
        </Ctl>
        <Divider />
        <button className="h-10 px-3 rounded-xl bg-warn/90 hover:bg-warn text-white flex items-center gap-1.5 text-sm transition" onClick={() => room.disconnect()} title="Leave">
          <PhoneOff size={16} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </motion.div>
    </footer>
  );
}

function Ctl({ on, off, pending, onClick, title, badge, children }: { on: boolean; off?: boolean; pending?: boolean; onClick: () => void; title: string; badge?: number; children: React.ReactNode }) {
  const cls = on ? "bg-white/10 text-white" : off ? "bg-warn/15 text-warn" : "text-mute hover:text-white hover:bg-white/5";
  return (
    <motion.button whileTap={{ scale: 0.92 }} className={`relative h-10 w-10 rounded-xl flex items-center justify-center transition disabled:opacity-50 ${cls}`} onClick={onClick} disabled={pending} title={title}>
      {children}
      <AnimatePresence>
        {badge ? (
          <motion.span
            key="b"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] text-bg flex items-center justify-center font-medium"
          >
            {badge}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}

function Divider() {
  return <span className="w-px h-6 bg-white/10 mx-0.5" />;
}

function Popover({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      style={{ transformOrigin: "bottom center", x: "-50%" }}
      className={`absolute bottom-12 left-1/2 rounded-xl bg-[#171513] border border-line shadow-2xl z-30 ${className}`}
    >
      {children}
    </motion.div>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, active: boolean, onOutside: () => void) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [active, ref, onOutside]);
}

function VolumeControl() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { v, set } = useContext(VolumeCtx);
  useClickOutside(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <Ctl on={open} onClick={() => setOpen((o) => !o)} title="Volume">
        <Volume2 size={18} />
      </Ctl>
      <AnimatePresence>
      {open && (
        <Popover className="p-3 space-y-2">
          <Slider label="Movie" value={v.movie} onChange={(x) => set({ movie: x })} />
          <Slider label="Voice" value={v.voice} onChange={(x) => set({ voice: x })} />
          <Slider label="Sounds" value={v.sfx} onChange={(x) => set({ sfx: x })} />
          <p className="text-[10px] text-dim pt-1">Per-person volume is in the People panel.</p>
        </Popover>
      )}
      </AnimatePresence>
    </div>
  );
}

function ShareControl() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [mode, setMode] = useState<ShareMode>("sharp");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  async function start(m: ShareMode) {
    const cfg = SHARE_MODES[m];
    setBusy(true);
    try {
      if (isScreenShareEnabled) await localParticipant.setScreenShareEnabled(false);
      await localParticipant.setScreenShareEnabled(
        true,
        { contentHint: cfg.hint, resolution: { width: 2560, height: 1440, frameRate: cfg.fps }, audio: true, systemAudio: "include", selfBrowserSurface: "exclude" },
        { videoCodec: "vp9", screenShareEncoding: { maxBitrate: cfg.bitrate, maxFramerate: cfg.fps }, screenShareSimulcastLayers: [] },
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
        className={`h-10 pl-3 pr-2 rounded-l-xl flex items-center gap-2 text-sm transition disabled:opacity-50 ${isScreenShareEnabled ? "bg-accent text-bg" : "text-mute hover:text-white hover:bg-white/5"}`}
        onClick={() => (isScreenShareEnabled ? stop() : start(mode))}
        disabled={busy}
        title={isScreenShareEnabled ? "Stop sharing" : "Share screen"}
      >
        {isScreenShareEnabled ? <MonitorX size={18} /> : <MonitorUp size={18} />}
        <span className="hidden sm:inline">{isScreenShareEnabled ? "Stop" : "Share"}</span>
      </button>
      <button
        className={`h-10 px-2 rounded-r-xl text-[11px] font-medium border-l border-black/30 transition ${isScreenShareEnabled ? "bg-accent text-bg/70" : "text-mute hover:text-white hover:bg-white/5"}`}
        onClick={() => setOpen((o) => !o)}
        title="Share quality"
      >
        {SHARE_MODES[mode].label}
      </button>
      <AnimatePresence>
      {open && (
        <Popover className="w-52 p-1">
          {(Object.keys(SHARE_MODES) as ShareMode[]).map((k) => (
            <button
              key={k}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between hover:bg-surface ${mode === k ? "text-white" : "text-mute"}`}
              onClick={() => {
                setMode(k);
                setOpen(false);
                if (isScreenShareEnabled) start(k);
              }}
            >
              <span>
                {SHARE_MODES[k].label}
                <span className="block text-[11px] text-mute">{SHARE_MODES[k].desc}</span>
              </span>
              {mode === k && <Check size={14} />}
            </button>
          ))}
        </Popover>
      )}
      </AnimatePresence>
    </div>
  );
}

function DevicesControl() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <Ctl on={open} onClick={() => setOpen((o) => !o)} title="Audio devices">
        <Settings size={18} />
      </Ctl>
      <AnimatePresence>
      {open && (
        <Popover className="w-72 py-1">
          <DeviceSelect label="Microphone" kind="audioinput" />
          <DeviceSelect label="Speaker" kind="audiooutput" />
        </Popover>
      )}
      </AnimatePresence>
    </div>
  );
}

function DeviceSelect({ label, kind }: { label: string; kind: "audioinput" | "audiooutput" }) {
  const d = useMediaDeviceSelect({ kind });
  return (
    <label className="block px-3 py-2">
      <span className="block text-[11px] uppercase tracking-wider text-mute mb-1">{label}</span>
      <select className="w-full rounded-md bg-surface border border-line px-2 py-1.5 text-sm outline-none focus:border-ink/40" value={d.activeDeviceId} onChange={(e) => d.setActiveMediaDevice(e.target.value)}>
        {d.devices.map((dev) => (
          <option key={dev.deviceId} value={dev.deviceId}>
            {dev.label || dev.deviceId.slice(0, 8)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh flex items-center justify-center bg-bg text-mute text-sm">{children}</div>;
}
