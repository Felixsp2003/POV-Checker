import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Clock, ExternalLink, Film, ListVideo, Save, ScanSearch, Trash2, Upload, Video, X, Zap, ArrowRight } from "lucide-react";
import { PovEntry, QueueItem, YTConnection, formatBytes, formatDuration, getMissing } from "../lib/core";
import { Badge, StatusPill, btnDanger, btnGhost, btnPrimary, inputCls } from "../ui";
import PovForm from "./PovForm";

export interface UploadProps {
  queue: QueueItem[];
  ytConns: YTConnection[];
  busy: string;
  expanded: string;
  setExpanded: (qid: string) => void;
  pool: string[];
  onAddPool: (n: string) => void;
  acpStatus: Record<string, string>;
  onFiles: (f: FileList | File[]) => void;
  onRun: (qid: string) => void;
  onAbort: (qid: string) => void;
  onSave: (qid: string, next: boolean) => void;
  onRemove: (qid: string) => void;
  onPatch: (qid: string, patch: Partial<QueueItem>) => void;
  onPatchOcr: (qid: string, patch: Partial<PovEntry>) => void;
  onAcp: (q: QueueItem) => void;
  getFile: (qid: string) => Promise<File | null>;
  onRecapture: (qid: string, sec: number) => void;
}

export default function UploadView(p: UploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const active = p.queue.filter((q) => ["youtube-upload", "youtube-wartet", "ocr"].includes(q.status)).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) p.onFiles(e.dataTransfer.files); }}
          className="cursor-pointer rounded-2xl border-2 border-dashed border-white/15 bg-white/[.02] p-10 text-center transition hover:border-amber-500/50 hover:bg-amber-500/5">
          <Upload size={36} className="mx-auto mb-3 text-amber-500" />
          <p className="text-lg font-black">POVs hier ablegen</p>
          <p className="mt-1 text-xs text-slate-400">Mehrere Aufnahmen gleichzeitig auswählen — <b className="text-amber-300">der Upload startet automatisch</b>, eine POV nach der anderen. Ist ein YouTube-Kanal voll, übernimmt der nächste.</p>
          <input ref={inputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { if (e.target.files) p.onFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <div className="space-y-2 rounded-2xl border border-white/10 bg-[#101830] p-4 text-xs">
          <p className="font-black">Verarbeitungswarteschlange</p>
          <p className="text-slate-400"><b className="text-slate-200">{p.queue.length} Dateien</b> · „Nächste POV“ speichert den aktuellen Fall ins Archiv und öffnet den nächsten.</p>
          {["Datei → Warteschlange (Automatik startet)", "YouTube-Upload unlisted · Kanalwechsel bei vollem Limit", "Verarbeitung kurz abwarten (max. 45 s)", "OCR: Bannblock (Chat oben links, letzte 5 s)", "Bannscreen-Foto → Prüfen → Speichern"].map((s) => (
            <p key={s} className="flex items-center gap-2 text-slate-300"><CheckCircle2 size={13} className="shrink-0 text-emerald-500" /> {s}</p>
          ))}
          <p className="pt-1 text-slate-500">Aktive Pipelines: <b className="text-slate-200">{active}</b> · YouTube-Slots aktiv: <b className="text-slate-200">{p.ytConns.filter((y) => y.enabled).length}/3</b></p>
        </div>
      </div>

      {p.queue.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#101830] p-8 text-center text-sm text-slate-400">
          <ListVideo size={32} className="mx-auto mb-2 text-slate-600" /> Warteschlange leer — oben Videos auswählen.
        </div>
      ) : (
        <div className="space-y-3">
          {p.queue.map((q, i) => (
            <QueueCard key={q.qid} q={q} index={i} total={p.queue.length} open={p.expanded === q.qid} onToggle={() => p.setExpanded(p.expanded === q.qid ? "" : q.qid)} {...p} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueCard(props: UploadProps & { q: QueueItem; index: number; total: number; open: boolean; onToggle: () => void }) {
  const { q, open } = props;
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true; let u = "";
    if (open) void props.getFile(q.qid).then((f) => { if (f && alive) { u = URL.createObjectURL(f); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); setUrl(""); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q.qid]);
  const running = ["youtube-upload", "youtube-wartet", "ocr"].includes(q.status);
  const missing = getMissing(q.ocr);
  const uploaded = !!q.youtubeId;
  const busy = props.busy === q.qid;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-[#101830] ${open ? "border-amber-500/40" : "border-white/10"}`}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
          {q.thumbUrl ? <img src={q.thumbUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Film size={20} className="text-slate-700" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{q.fileName}</p>
          <p className="text-[11px] text-slate-400">{formatBytes(q.fileSize)} · {formatDuration(q.duration || 0)} · #{q.qid.slice(-6)} · POV {props.index + 1}/{props.total}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusPill status={q.status} />
            {q.ocr.targetId && <Badge tone="violet">ID {q.ocr.targetId}</Badge>}
            {q.ocr.reason && <Badge tone="amber">{q.ocr.reason}</Badge>}
            {q.ocrDone && (missing.length ? <Badge tone="orange">fehlt: {missing.join(", ")}</Badge> : <Badge tone="green">vollständig</Badge>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={inputCls + " !w-auto !py-1.5 text-xs"} value={q.ytSlot} disabled={running || uploaded} onChange={(e) => props.onPatch(q.qid, { ytSlot: parseInt(e.target.value, 10) })} title="YouTube-Verbindung">
            {props.ytConns.map((y, i) => <option key={i} value={i}>YT {i + 1} · {y.name}</option>)}
          </select>
          {!running && (!q.ocrDone || !uploaded) && <button className={btnGhost} onClick={() => props.onRun(q.qid)}><Zap size={15} /> {q.ocrDone ? "Hochladen" : "Jetzt analysieren"}</button>}
          {running && <button className={btnGhost} onClick={() => props.onAbort(q.qid)}><X size={15} /> Abbrechen</button>}
          <button className={btnPrimary} disabled={!q.ocrDone} title={q.ocrDone ? "" : "Erst nach der Analyse prüfbar"} onClick={props.onToggle}>
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {open ? "Zuklappen" : q.ocrDone ? "Prüfen" : "Analyse läuft…"}
          </button>
        </div>
      </div>

      {(running || uploaded || q.ocrDone || q.error) && (
        <div className="space-y-2 border-t border-white/5 px-4 py-3">
          {/* Schritt 1: Analyse */}
          {(q.status === "ocr" || q.ocrDone) && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5"><ScanSearch size={12} className="text-amber-400" /> 1 · Analyse: „Adam Byers[15340] hat …[ID] für 60 Tage gebannt“</span>
                <span className="tick">{q.ocrProgress} %</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/50"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all" style={{ width: `${q.ocrProgress}%` }} /></div>
              {q.ocrResult && <p className="mt-1.5 truncate font-mono text-[10px] text-slate-500">{q.ocrResult.slice(0, 200)}</p>}
            </div>
          )}
          {/* Schritt 2: Upload */}
          {(running || uploaded) && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5"><Video size={12} className="text-red-400" /> 2 · {q.youtubeStatus || "YouTube-Upload"}</span>
                <span className="tick">{q.progress} %</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/50"><div className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500 transition-all" style={{ width: `${q.progress}%` }} /></div>
            </div>
          )}
          {q.processingStatus && (
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              <Clock size={12} /> Verarbeitung: <b className={q.processingStatus === "succeeded" ? "text-emerald-400" : "text-amber-300"}>{q.processingStatus}</b>
              {q.youtubeUrl && <a href={q.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">{q.youtubeUrl} <ExternalLink size={11} /></a>}
            </p>
          )}
          {q.error && <p className="text-xs text-red-300">✗ {q.error}</p>}
        </div>
      )}

      {open && (
        <div className="border-t border-white/10 p-4">
          <PovForm value={q.ocr} onChange={(patch) => props.onPatchOcr(q.qid, patch)} videoUrl={url} youtubeUrl={q.youtubeUrl}
            timestamps={q.ocr.timestamps} acpStatus={props.acpStatus[q.qid]} onAcp={() => props.onAcp(q)} pool={props.pool} onAddPool={props.onAddPool}
            bannerPhoto={q.bannerPhoto} onRecapture={(sec) => props.onRecapture(q.qid, sec)}
            onOpenPov={() => { if (url) window.open(url, "_blank", "noopener"); }} />
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
            <button className={btnGhost} onClick={props.onToggle}>Abbrechen</button>
            <button className={btnDanger} onClick={() => props.onRemove(q.qid)}><Trash2 size={14} /> Löschen</button>
            <div className="ml-auto flex flex-wrap gap-2">
              <button className={btnGhost} disabled={busy || running} onClick={() => props.onSave(q.qid, true)}><ArrowRight size={15} /> Nächste POV</button>
              <button className={btnPrimary} disabled={busy || running} onClick={() => props.onSave(q.qid, false)}>
                <Save size={15} /> {busy ? "Speichert…" : uploaded ? "Speichern ins Archiv" : "Speichern & YouTube hochladen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
