"use client";

import "@livekit/components-styles";
import {
  CarouselLayout,
  Chat,
  ControlBar,
  FocusLayout,
  FocusLayoutContainer,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useChat,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import { AudioPresets, RoomOptions, Track } from "livekit-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

// Two share modes. "Sharp" is for code/text/slides: max detail, 20 Mbps.
// "Smooth" is for movies/games: motion priority, 12 Mbps (already far past
// what 1440p streaming services use, and it halves bandwidth usage).
const SHARE_MODES = {
  sharp: { label: "Sharp (text)", hint: "detail" as const, bitrate: 20_000_000, fps: 60 },
  smooth: { label: "Smooth (video)", hint: "motion" as const, bitrate: 12_000_000, fps: 60 },
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

export default function RoomClient({ code }: { code: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const name = params.get("name") ?? "";
  const camOnJoin = params.get("cam") === "1";
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [chatOpen, setChatOpen] = useState(false);
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  useEffect(() => {
    if (!name) {
      router.replace("/");
      return;
    }
    fetch(`/api/token?room=${code}&name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => (d.token ? setToken(d.token) : setError(d.error)))
      .catch((e) => setError(String(e)));
  }, [code, name, router]);

  if (error) return <Center>Error: {error}</Center>;
  if (!url) return <Center>NEXT_PUBLIC_LIVEKIT_URL is not set</Center>;
  if (!token) return <Center>Connecting to {code}…</Center>;

  return (
    <LiveKitRoom
      token={token}
      serverUrl={url}
      options={roomOptions}
      connect
      audio
      video={camOnJoin}
      onDisconnected={() => router.push("/")}
      data-lk-theme="default"
      className="rs-room"
    >
      <RoomCode code={code} />
      <div className="rs-main">
        <Stage />
        <aside className={`rs-chat ${chatOpen ? "open" : ""}`}>
          <Chat />
        </aside>
      </div>
      <RoomAudioRenderer />
      <div className="rs-bar">
        <ControlBar
          variation="minimal"
          controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: true }}
        />
        <ShareButton />
        <ChatButton open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />
        <FullscreenButton />
      </div>
    </LiveKitRoom>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="rs-code"
      title="Copy invite link"
      onClick={() => {
        navigator.clipboard?.writeText(`${location.origin}/?code=${code}`).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "copied" : code}
    </button>
  );
}

function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const screen = useMemo(() => tracks.find((t) => t.source === Track.Source.ScreenShare), [tracks]);
  const others = useMemo(() => tracks.filter((t) => t !== screen), [tracks, screen]);

  if (screen) {
    return (
      <FocusLayoutContainer>
        <CarouselLayout tracks={others}>
          <ParticipantTile />
        </CarouselLayout>
        <FocusLayout trackRef={screen} />
      </FocusLayoutContainer>
    );
  }
  return (
    <GridLayout tracks={tracks}>
      <ParticipantTile />
    </GridLayout>
  );
}

function ShareButton() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [mode, setMode] = useState<ShareMode>("sharp");
  const [busy, setBusy] = useState(false);

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
      // user cancelled the picker
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
    <div className="rs-share">
      <button
        className="lk-button"
        onClick={() => (isScreenShareEnabled ? stop() : start(mode))}
        disabled={busy}
        data-lk-enabled={isScreenShareEnabled}
      >
        {isScreenShareEnabled ? "Stop sharing" : "Share screen"}
      </button>
      <select
        className="lk-button rs-select"
        value={mode}
        title="Share quality mode"
        onChange={(e) => {
          const m = e.target.value as ShareMode;
          setMode(m);
          if (isScreenShareEnabled) start(m);
        }}
      >
        {Object.entries(SHARE_MODES).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChatButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { chatMessages } = useChat();
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (open) setSeen(chatMessages.length);
  }, [open, chatMessages.length]);
  const unread = open ? 0 : chatMessages.length - seen;
  return (
    <button className="lk-button" onClick={onToggle} data-lk-enabled={open}>
      Chat{unread > 0 ? ` (${unread})` : ""}
    </button>
  );
}

function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  return (
    <button
      className="lk-button"
      onClick={() =>
        document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
      }
    >
      {fs ? "Exit fullscreen" : "Fullscreen"}
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh flex items-center justify-center bg-neutral-950 text-neutral-300">{children}</div>;
}
