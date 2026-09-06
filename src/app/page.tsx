"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomCode = () => Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");

const ease = [0.22, 1, 0.36, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.7, ease, delay } },
});

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [cam, setCam] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Browser-only state, read once after mount to avoid a hydration mismatch.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      setName(localStorage.getItem("rs:name") ?? "");
    } catch {}
    const c = new URLSearchParams(location.search).get("code");
    if (c) setCode(c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const ready = name.trim().length > 0;

  function go(c: string) {
    if (!ready || leaving) return;
    try {
      localStorage.setItem("rs:name", name.trim());
    } catch {}
    setLeaving(true);
    setTimeout(() => router.push(`/room/${c}?name=${encodeURIComponent(name.trim())}${cam ? "&cam=1" : ""}`), 350);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-bg text-ink">
      <motion.div className="w-full max-w-md" animate={leaving ? { opacity: 0, y: -10, transition: { duration: 0.35, ease } } : {}}>
        <motion.h1 {...rise(0)} className="font-display italic text-6xl sm:text-7xl leading-none tracking-tight">
          roomshare
        </motion.h1>
        <motion.p {...rise(0.08)} className="mt-3 text-mute text-base">
          Watch things together. Nothing between you and the picture.
        </motion.p>

        <motion.div {...rise(0.18)} className="mt-14">
          <Field label="Your name">
            <input
              className="w-full bg-transparent text-2xl py-2 outline-none placeholder:text-dim border-b border-line focus:border-ink/40 transition-colors"
              placeholder="ari"
              value={name}
              autoFocus={!name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && go(code)}
            />
          </Field>
        </motion.div>

        <motion.div {...rise(0.26)} className="mt-10">
          <Field label="Room code">
            <CodeInput value={code} onChange={setCode} onSubmit={() => go(code)} disabled={!ready} />
          </Field>
        </motion.div>

        <motion.div {...rise(0.34)} className="mt-10 flex items-center justify-between">
          <button
            className="group flex items-center gap-2 text-ink disabled:text-dim transition-colors"
            disabled={!ready}
            onClick={() => go(randomCode())}
          >
            <span className="text-lg">Start a new room</span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5 group-disabled:translate-x-0" />
          </button>
          <button className="text-sm text-mute hover:text-ink transition-colors" onClick={() => setCam((c) => !c)}>
            camera <span className={cam ? "text-accent" : ""}>{cam ? "on" : "off"}</span>
          </button>
        </motion.div>
      </motion.div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-[0.2em] text-dim mb-1">{label}</span>
      {children}
    </label>
  );
}

function CodeInput({ value, onChange, onSubmit, disabled }: { value: string; onChange: (v: string) => void; onSubmit: () => void; disabled: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const active = Math.min(value.length, 5);

  return (
    <div className="relative flex items-center gap-3">
      <div className="flex gap-2" onClick={() => ref.current?.focus()}>
        {cells.map((ch, i) => (
          <div
            key={i}
            className={`relative w-11 h-14 rounded-lg border flex items-center justify-center font-mono text-2xl transition-colors ${
              ch ? "border-ink/30 bg-surface" : "border-line"
            }`}
          >
            <AnimatePresence>
              {ch && (
                <motion.span key={ch + i} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
                  {ch}
                </motion.span>
              )}
            </AnimatePresence>
            {focused && i === active && value.length < 6 && (
              <motion.span layoutId="caret" className="absolute bottom-2 w-5 h-px bg-accent" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
            )}
          </div>
        ))}
      </div>
      <input
        ref={ref}
        className="absolute inset-0 opacity-0 cursor-text"
        value={value}
        maxLength={6}
        autoCapitalize="characters"
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && value.length === 6 && onSubmit()}
      />
      <AnimatePresence>
        {value.length === 6 && (
          <motion.button
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            className="relative h-14 px-5 rounded-lg bg-accent text-bg font-medium disabled:opacity-40 transition-opacity"
            disabled={disabled}
            onClick={onSubmit}
          >
            Join
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
