"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [cam, setCam] = useState(false);

  useEffect(() => {
    // Browser-only state, read once after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try {
      setName(localStorage.getItem("rs:name") ?? "");
    } catch {}
    const c = new URLSearchParams(location.search).get("code");
    if (c) setCode(c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  }, []);

  function go(c: string) {
    const n = name.trim();
    if (!n) return;
    try {
      localStorage.setItem("rs:name", n);
    } catch {}
    router.push(`/room/${c.toUpperCase()}?name=${encodeURIComponent(n)}${cam ? "&cam=1" : ""}`);
  }

  const ready = name.trim().length > 0;

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-[#0b0b0d] text-neutral-100">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">roomshare</h1>
          <p className="text-sm text-neutral-400 mt-1">Screen share and voice. No accounts.</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Name</span>
          <input
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 outline-none focus:border-blue-500 transition"
            placeholder="What people see"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Room code</span>
          <div className="flex gap-2">
            <input
              className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 font-mono text-lg tracking-[0.3em] uppercase outline-none focus:border-blue-500 transition"
              placeholder="ABC123"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && go(code)}
            />
            <button
              className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 font-medium disabled:opacity-30 disabled:hover:bg-blue-600 transition"
              disabled={!ready || code.length !== 6}
              onClick={() => go(code)}
            >
              Join
            </button>
          </div>
        </label>

        <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer select-none">
          <input type="checkbox" checked={cam} onChange={(e) => setCam(e.target.checked)} className="accent-blue-500" />
          Turn my camera on when I join
        </label>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
          <div className="relative flex justify-center text-xs text-neutral-600"><span className="bg-[#0b0b0d] px-2">or</span></div>
        </div>

        <button
          className="w-full rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2.5 font-medium disabled:opacity-30 transition"
          disabled={!ready}
          onClick={() => go(randomCode())}
        >
          Create a new room
        </button>
      </div>
    </main>
  );
}
