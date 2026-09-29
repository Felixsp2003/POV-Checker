// Prüf-/Bearbeitungsformular — Aufbau wie in der alten App (V153):
// Video + Zeitmarken · Ziel-ID · Ergebnis · Grund · SOC/SC (ACP) · Server · Datum · Proof ·
// Finaler Dateiname · PC Checker (Leiter + 4) · Bann-Typen · Perma/Archiv/Nicht gebannt · Im Dokument
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ExternalLink, Link2, Plus, Clock, MonitorPlay } from "lucide-react";
import {
  ALLOWED_REASONS, BAN_TYPES, DOCUMENT_STATUS, PC_CHECKER_LEAD, PC_CHECKER_MAX, SERVERS,
  PovEntry, autoPerma, autoResult, autoTypes, buildFinalFilename, getMissing, serverLabel, formatDuration,
} from "../lib/core";
import { Chip, Field, Toggle, btnGhost, btnPink, copyText, inputCls, mini } from "../ui";

export interface PovFormProps {
  value: Partial<PovEntry>;
  onChange: (patch: Partial<PovEntry>) => void;
  videoUrl?: string;            // lokale Vorschau
  youtubeUrl?: string;
  timestamps?: Record<string, number>;
  acpStatus?: string;
  onAcp?: () => void;
  onOpenPov?: () => void;
  pool: string[];
  onAddPool: (name: string) => void;
  showVideo?: boolean;
}

const TS_CHIPS: Array<{ key: string; label: string }> = [
  { key: "banner", label: "Bannblock" }, { key: "targetId", label: "Ziel-ID" }, { key: "reason", label: "Grund" },
  { key: "sc", label: "SC / RID" }, { key: "pcCheck", label: "PC-Check" },
];

export default function PovForm(p: PovFormProps) {
  const v = p.value;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeTs, setActiveTs] = useState("");
  const [manualReason, setManualReason] = useState(() => !!v.reason && !ALLOWED_REASONS.includes(v.reason));
  const [newChecker, setNewChecker] = useState("");
  const [pos, setPos] = useState(0);
  const missing = useMemo(() => getMissing(v), [v]);
  const types = v.types || [];
  const pc = (v.pcCheckers && v.pcCheckers.length ? v.pcCheckers : [PC_CHECKER_LEAD]);
  const ts = p.timestamps || v.timestamps || {};

  useEffect(() => { if (v.reason && !ALLOWED_REASONS.includes(v.reason)) setManualReason(true); }, [v.reason]);

  const jump = (key: string) => {
    const t = ts[key]; if (t == null || !videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, t - 0.05); videoRef.current.pause(); setActiveTs(key);
  };
  const setReason = (reason: string) => {
    const patch: Partial<PovEntry> = { reason };
    if (reason) {
      patch.types = autoTypes(reason);
      const ap = autoPerma(reason); if (ap !== undefined) patch.perma = ap;
      const ar = autoResult(reason);
      if (ar || !v.manualResult || v.manualResult === autoResult(v.reason || "")) patch.manualResult = ar;
    }
    p.onChange(patch);
  };
  const setChecker = (i: number, name: string) => {
    const next = [...pc]; while (next.length <= i) next.push("");
    next[i] = name;
    p.onChange({ pcCheckers: next.filter((x, idx) => idx === 0 || x).slice(0, PC_CHECKER_MAX) });
  };
  const addChecker = () => {
    const n = newChecker.trim(); if (!n) return;
    p.onAddPool(n);
    const free = pc.findIndex((x, i) => i > 0 && !x);
    const idx = free > 0 ? free : pc.length;
    if (idx < PC_CHECKER_MAX && !pc.includes(n)) setChecker(idx, n);
    setNewChecker("");
  };
  const toggleType = (id: string) => p.onChange({ types: types.includes(id) ? types.filter((t) => t !== id) : [...types, id] });
  const finalName = buildFinalFilename(v);
  const fmtTs = (n?: number) => n == null ? "" : `${formatDuration(n)}`;

  return (
    <div className="space-y-4">
      {p.showVideo !== false && (
        <div className="rounded-xl border border-white/10 bg-black/40 p-2">
          {p.videoUrl ? (
            <video ref={videoRef} src={p.videoUrl} controls preload="metadata" className="max-h-[340px] w-full rounded-lg bg-black"
              onTimeUpdate={() => setPos(videoRef.current?.currentTime || 0)} />
          ) : (
            <div className="flex h-28 items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 text-xs text-slate-400">
              {p.youtubeUrl ? <a href={p.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-cyan-300 hover:underline"><MonitorPlay size={15} /> Video auf YouTube ansehen</a> : "Kein lokales Video verfügbar — Felder trotzdem bearbeitbar."}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {TS_CHIPS.map((c) => (
              <button key={c.key} type="button" disabled={ts[c.key] == null || !p.videoUrl} onClick={() => jump(c.key)} title={fmtTs(ts[c.key])}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40 ${activeTs === c.key ? "border-pink-500 bg-pink-500/20 text-pink-200" : "border-white/10 bg-white/[.04] text-slate-300 hover:bg-white/10"}`}>
                {c.label}{ts[c.key] != null && <span className="ml-1 text-[10px] opacity-70 tick">{fmtTs(ts[c.key])}</span>}
              </button>
            ))}
            {p.videoUrl && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500 tick"><Clock size={11} /> {formatDuration(pos)}</span>}
            {p.videoUrl && (
              <button type="button" className={btnGhost + mini} onClick={() => {
                const t = videoRef.current?.currentTime || 0;
                const key = activeTs || "banner";
                p.onChange({ timestamps: { ...ts, [key]: +t.toFixed(2) } });
              }} title="Aktuelle Videoposition als Zeitmarke für den gewählten Chip speichern">Position merken</button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
        <Field label="Ziel-ID">
          <input className={inputCls} inputMode="numeric" value={v.targetId || ""} onChange={(e) => p.onChange({ targetId: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="z. B. 172718" />
          <div className="mt-1.5 flex gap-1.5">
            {p.onOpenPov && <button type="button" className={btnGhost + mini} onClick={p.onOpenPov}><ExternalLink size={12} /> POV hier öffnen</button>}
          </div>
        </Field>
        <Field label="Ergebnis" hint="Beim Hochladen eintragen. Bei Verweigerung/Trolling automatisch. Bei Positiv beim Prüfen selbst eintragen (z. B. Vanish, Loader, Multicheater).">
          <input className={inputCls} value={v.manualResult || ""} onChange={(e) => p.onChange({ manualResult: e.target.value })} placeholder="Ergebnis manuell eintragen" />
        </Field>

        <Field label="Grund" hint={<>BannGrund wird im roten Adminpanel-Bereich geladen; bei fehlendem SC zuerst <b>SC aus ACP holen</b>. Nur Gründe aus der festen Liste — OCR übernimmt niemals beliebigen Text.</>}>
          {manualReason ? (
            <input className={inputCls} list="dc-reasons" value={v.reason || ""} onChange={(e) => setReason(e.target.value)} placeholder="Grund eingeben" />
          ) : (
            <select className={inputCls} value={ALLOWED_REASONS.includes(v.reason || "") ? v.reason : ""} onChange={(e) => setReason(e.target.value)}>
              <option value="">Bitte wählen</option>
              {ALLOWED_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <datalist id="dc-reasons">{ALLOWED_REASONS.map((r) => <option key={r} value={r} />)}</datalist>
          <div className="mt-1.5"><button type="button" className={btnGhost + mini} onClick={() => setManualReason((m) => !m)}>{manualReason ? "Aus Liste wählen" : "Grund manuell eingeben"}</button></div>
        </Field>
        <Field label="SOC / SC aus Adminpanel" hint={p.acpStatus || "SC wird aus dem Chrome-Adminpanel übernommen (Extension). Alternativ hier einfügen."}>
          <input className={`${inputCls} font-mono`} value={v.sc || ""} onChange={(e) => p.onChange({ sc: e.target.value.trim(), rid: v.rid || "" })} placeholder="SC wird aus dem Chrome-Adminpanel übernommen" />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {p.onAcp && <button type="button" className={btnPink + mini} disabled={!v.targetId} onClick={p.onAcp}><Link2 size={12} /> SC aus ACP holen</button>}
            <button type="button" className={btnGhost + mini} disabled={!v.sc} onClick={() => copyText(v.sc || "")}><Copy size={12} /> SC kopieren</button>
          </div>
        </Field>

        <Field label="Server" hint={`Fest: ${serverLabel(v.server || "3")}`}>
          <select className={inputCls} value={v.server || "3"} onChange={(e) => p.onChange({ server: e.target.value })}>
            {SERVERS.map((s) => <option key={s} value={s}>{s} · {serverLabel(s)}</option>)}
          </select>
        </Field>
        <Field label="Datum" hint="Automatisch aus dem POV-Dateinamen.">
          <input className={inputCls} type="date" value={v.date || ""} onChange={(e) => p.onChange({ date: e.target.value })} />
        </Field>

        <Field label="Proof" className="md:col-span-2">
          <input className={inputCls} value={v.proof || v.youtubeUrl || ""} onChange={(e) => p.onChange({ proof: e.target.value.trim() })} placeholder="https://youtu.be/…" />
        </Field>
        <Field label="Finaler Dateiname" className="md:col-span-2" hint="Wird auch als YouTube-Titel gesetzt.">
          <div className="flex gap-2">
            <input className={`${inputCls} font-mono`} readOnly value={finalName} />
            <button type="button" className={btnGhost} onClick={() => copyText(finalName)}><Copy size={14} /></button>
          </div>
        </Field>
      </div>

      {/* PC Checker */}
      <div className="rounded-xl border border-white/10 bg-white/[.02] p-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-300">PC Checker <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">1 = Leiter · bis zu 5 Personen · Foto des PC-Checks separat</span></p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <Field label="1. PC-Check-Leiter" className="md:col-span-2">
            <input className={inputCls} value={pc[0] || ""} onChange={(e) => setChecker(0, e.target.value)} />
          </Field>
          {[1, 2, 3, 4].map((i) => (
            <Field key={i} label={`${i + 1}. PC Checker`}>
              <select className={inputCls} value={pc[i] || ""} onChange={(e) => setChecker(i, e.target.value)}>
                <option value="">Nicht besetzt</option>
                {p.pool.filter((n) => n !== pc[0]).map((n) => <option key={n} value={n}>{n}</option>)}
                {pc[i] && !p.pool.includes(pc[i]) && <option value={pc[i]}>{pc[i]}</option>}
              </select>
            </Field>
          ))}
          <Field label="PC Checker manuell hinzufügen" className="md:col-span-2" hint={`Der PC-Check-Leiter ist automatisch ${PC_CHECKER_LEAD}. Insgesamt sind maximal ${PC_CHECKER_MAX} PC Checker möglich. Neue Namen bleiben in der Liste gespeichert.`}>
            <div className="flex gap-2">
              <input className={inputCls} value={newChecker} onChange={(e) => setNewChecker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecker())} placeholder="Name eingeben" />
              <button type="button" className={btnGhost} onClick={addChecker}><Plus size={14} /></button>
            </div>
          </Field>
        </div>
      </div>

      {/* Bann-Typen */}
      <div>
        <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-300">Bann-Typen <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">Mehrere gleichzeitig möglich</span></p>
        <div className="flex flex-wrap gap-1.5">
          {BAN_TYPES.map((t) => <Chip key={t.id} active={types.includes(t.id)} onClick={() => toggleType(t.id)}>{t.label}</Chip>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Toggle checked={!!v.perma} onChange={(x) => p.onChange({ perma: x })} label="Perma-Bann" />
        <Toggle checked={!!v.permaArchive} onChange={(x) => p.onChange({ permaArchive: x })} label="Archiv: in Perma eingetragen" />
        <Toggle checked={!!v.notBanned} onChange={(x) => p.onChange({ notBanned: x, types: x && !types.includes("negativ") ? [...types, "negativ"] : types })} label="Nicht gebannt" />
      </div>

      <Field label="Im Dokument">
        <select className={inputCls} value={v.documentStatus || DOCUMENT_STATUS[0]} onChange={(e) => p.onChange({ documentStatus: e.target.value })}>
          {DOCUMENT_STATUS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </Field>

      {missing.length > 0 ? (
        <p className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-200">⚠ Bitte prüfen: {missing.join(" · ")}</p>
      ) : (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">✓ Vollständig — {finalName}</p>
      )}
    </div>
  );
}
