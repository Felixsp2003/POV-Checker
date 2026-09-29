import { useState } from "react";
import { CheckCircle2, Copy, Info, X, XCircle } from "lucide-react";
import type { QueueItem } from "./lib/core";

export const inputCls = "w-full rounded-lg border border-white/10 bg-[#0b1326] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60";
export const btnPrimary = "inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-[#131006] hover:bg-amber-400 transition shadow-[0_8px_30px_-8px_rgba(245,158,11,.6)] disabled:opacity-50 disabled:cursor-not-allowed";
export const btnPink = "inline-flex items-center gap-2 rounded-lg bg-pink-500 px-3 py-2 text-sm font-bold text-white hover:bg-pink-400 transition shadow-[0_8px_30px_-8px_rgba(236,72,153,.6)] disabled:opacity-50";
export const btnGhost = "inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 transition disabled:opacity-50";
export const btnDanger = "inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition disabled:opacity-50";
export const mini = " !px-2 !py-1 !text-[11px]";

export type ToastKind = "ok" | "err" | "info";
export interface Toast { id: string; kind: ToastKind; text: string; }
export type Push = (kind: ToastKind, text: string) => void;

const tones: Record<string, string> = {
  zinc: "bg-white/5 text-slate-300 border-white/10",
  amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  red: "bg-red-500/15 text-red-300 border-red-500/30",
  sky: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  orange: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  pink: "bg-pink-500/15 text-pink-300 border-pink-500/30",
};
export function Badge({ children, tone = "zinc", className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tones[tone] || tones.zinc} ${className}`}>{children}</span>;
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
      <span className={`relative inline-block h-5 w-9 rounded-full transition ${checked ? "bg-amber-500" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

export function Chip({ active, onClick, children, tone = "amber" }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "amber" | "pink" }) {
  const on = tone === "pink" ? "border-pink-500/60 bg-pink-500/15 text-pink-200" : "border-amber-500/60 bg-amber-500/15 text-amber-200";
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${active ? on : "border-white/10 bg-white/[.03] text-slate-300 hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

export function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${warn ? "border-orange-500/40 bg-orange-500/10" : "border-white/10 bg-white/[.03]"}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`truncate text-xs font-bold ${warn ? "text-orange-300" : "text-slate-100"}`}>{value}</p>
    </div>
  );
}

export function StatusPill({ status }: { status: QueueItem["status"] }) {
  const map: Record<string, { label: string; tone: string }> = {
    "wartet": { label: "Wartet auf Analyse", tone: "zinc" },
    "youtube-upload": { label: "YouTube-Upload läuft", tone: "amber" },
    "youtube-wartet": { label: "YouTube-Verarbeitung…", tone: "sky" },
    "ocr": { label: "Analyse läuft (Bannblock)", tone: "orange" },
    "fertig": { label: "Analysiert — bereit zum Prüfen", tone: "green" },
    "fehler": { label: "Fehler", tone: "red" },
    "gespeichert": { label: "Gespeichert", tone: "green" },
  };
  const m = map[status] || { label: String(status || "unbekannt"), tone: "zinc" };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function ModalShell({ title, sub, onClose, children, wide, xwide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; xwide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`max-h-[94vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1424] shadow-2xl fade-up ${xwide ? "max-w-6xl" : wide ? "max-w-4xl" : "max-w-2xl"}`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#0d1424]/95 p-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-black">{title}</h2>
            {sub && <p className="truncate text-xs text-slate-400">{sub}</p>}
          </div>
          <button className={btnGhost} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[300] flex w-96 max-w-[calc(100vw-40px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 text-xs shadow-2xl fade-up ${t.kind === "ok" ? "border-emerald-500/30 bg-emerald-950/90" : t.kind === "err" ? "border-red-500/30 bg-red-950/90" : "border-white/10 bg-[#111a2f]/95"}`}>
          {t.kind === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : t.kind === "err" ? <XCircle size={16} className="mt-0.5 shrink-0 text-red-400" /> : <Info size={16} className="mt-0.5 shrink-0 text-cyan-400" />}
          <p className="leading-relaxed text-slate-100">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

export function CodeBox({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[11px] text-emerald-300">{code}</code>
      <button className={`${btnGhost} !px-2 !py-1 !text-[11px]`} onClick={() => { void navigator.clipboard.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); }).catch(() => undefined); }}>
        {done ? "kopiert ✓" : <Copy size={13} />}
      </button>
    </div>
  );
}

export function copyText(t: string): void { void navigator.clipboard.writeText(t).catch(() => undefined); }
