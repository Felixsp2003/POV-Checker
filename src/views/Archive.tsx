import { useEffect, useState } from "react";
import { Archive, BadgeCheck, CircleAlert, Copy, Eye, Film, FolderInput, FolderOutput, Link2, Pencil, Play, Trash2, Users } from "lucide-react";
import { PovEntry, formatBytes, formatDate, getMissing, getVideo, serverLabel } from "../lib/core";
import { Badge, ModalShell, btnDanger, btnGhost, btnPrimary, copyText, mini } from "../ui";

export type ArchiveFilter = "alle" | "bans" | "pc" | "soc" | "hard" | "cheater" | "negativ" | "verweigert" | "ohne-video" | "archiv" | "doppelt";

// ---------- Thumbnails: YouTube (kostenlos) → IndexedDB (thumb_<id>) → Platzhalter ----------
const thumbCache = new Map<string, string>();
export function useThumb(e: PovEntry): string {
  const yt = e.youtubeId ? `https://i.ytimg.com/vi/${e.youtubeId}/mqdefault.jpg` : "";
  const [url, setUrl] = useState(yt || thumbCache.get(e.id) || "");
  useEffect(() => {
    if (yt) { setUrl(yt); return; }
    if (thumbCache.has(e.id)) { setUrl(thumbCache.get(e.id)!); return; }
    let alive = true;
    void getVideo("thumb_" + e.id).then((b) => { if (b && alive) { const u = URL.createObjectURL(b); thumbCache.set(e.id, u); setUrl(u); } }).catch(() => undefined);
    return () => { alive = false; };
  }, [e.id, yt]);
  return url;
}

export function resultTone(e: PovEntry): string {
  return e.result === "BESTÄTIGT" ? "green" : e.result === "NEGATIV" ? "red" : e.result === "VERDACHT" ? "orange" : "sky";
}
const TYPE_LABEL: Record<string, string> = { hardban: "Hardban", socban: "Soc-Ban", cheater: "Cheater", negativ: "Negativ", verweigert: "Verweigert", pccheck: "PC-Check" };

export function ArchiveView(props: {
  filters: Array<{ id: ArchiveFilter; label: string; count: number }>;
  archiveFilter: ArchiveFilter; setArchiveFilter: (f: ArchiveFilter) => void;
  list: PovEntry[]; dupIds: Set<string>; selected: Set<string>; setSelected: (s: Set<string>) => void;
  onArchive: (ids: string[], to: boolean) => void; onDelete: (ids: string[]) => void;
  onDetail: (e: PovEntry) => void; onEdit: (e: PovEntry) => void; onPlay: (e: PovEntry) => void; onSc: (e: PovEntry) => void;
}) {
  const { filters, archiveFilter, setArchiveFilter, list, dupIds, selected, setSelected } = props;
  const toggle = (id: string) => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setArchiveFilter(f.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${archiveFilter === f.id ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[.03] text-slate-300 hover:bg-white/10"}`}>
            {f.label}<span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] tick">{f.count}</span>
          </button>
        ))}
        {list.length > 0 && <button className={`${btnGhost}${mini} ml-auto`} onClick={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((e) => e.id)))}>{selected.size === list.length ? "Auswahl aufheben" : "Alle auswählen"}</button>}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 fade-up">
          <span className="text-xs font-bold text-amber-300">{selected.size} ausgewählt</span>
          <button className={btnPrimary} onClick={() => props.onArchive([...selected], true)}><FolderInput size={15} /> Ausgewählte ins Archiv</button>
          <button className={btnGhost} onClick={() => props.onArchive([...selected], false)}><FolderOutput size={15} /> Aus Archiv entfernen</button>
          <button className={btnDanger} onClick={() => props.onDelete([...selected])}><Trash2 size={15} /> Löschen</button>
          <button className={btnGhost} onClick={() => setSelected(new Set())}>Auswahl aufheben</button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[.02] p-12 text-center">
          <Archive size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="font-bold">Keine Einträge in dieser Ansicht</p>
          <p className="mt-1 text-xs text-slate-400">Filter sind reine Anzeige — die Originaldaten bleiben vollständig erhalten. Neue POVs erscheinen zuerst unter „Alle“.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((e) => (
            <EntryCard key={e.id} entry={e} dup={dupIds.has(e.targetId) && !!e.targetId} checked={selected.has(e.id)} onCheck={() => toggle(e.id)}
              onDetail={() => props.onDetail(e)} onEdit={() => props.onEdit(e)} onPlay={() => props.onPlay(e)}
              onArchive={() => props.onArchive([e.id], !e.permaArchive)} onDelete={() => props.onDelete([e.id])} onSc={() => props.onSc(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard(p: { entry: PovEntry; dup: boolean; checked: boolean; onCheck: () => void; onDetail: () => void; onEdit: () => void; onPlay: () => void; onArchive: () => void; onDelete: () => void; onSc: () => void }) {
  const e = p.entry; const thumb = useThumb(e);
  const missing = getMissing(e);
  return (
    <div className={`card-glow overflow-hidden rounded-2xl border bg-[#101830] transition ${p.checked ? "border-amber-500/60" : "border-white/10"}`}>
      <div className="relative h-36 bg-black/50">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center"><Film size={32} className="text-slate-700" /></div>}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <input type="checkbox" checked={p.checked} onChange={p.onCheck} className="h-4 w-4 rounded range-accent" />
          {e.permaArchive && <Badge tone="amber"><Archive size={11} /> POV Archiv</Badge>}
          {e.perma && <Badge tone="red">Perma</Badge>}
          {p.dup && <Badge tone="red">Doppelte ID</Badge>}
        </div>
        <div className="absolute right-2 top-2"><Badge tone={missing.length ? "orange" : resultTone(e)}>{missing.length ? "Prüfen" : e.result}</Badge></div>
        <button onClick={p.onPlay} className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-amber-500 hover:text-black">
          <Play size={13} /> {e.youtubeUrl ? "YouTube" : e.hasVideo ? "Video" : "Kein Video"}
        </button>
      </div>
      <div className="space-y-2 p-3.5">
        <div className="flex items-center gap-2">
          <span className="text-base font-black tick">ID {e.targetId || "—"}</span>
          <Badge tone="violet">{serverLabel(e.server)}</Badge>
          <span className="ml-auto text-[11px] text-slate-400">{formatDate(e.date)}</span>
        </div>
        <p className="truncate text-sm font-bold text-amber-300" title={e.reason}>{e.reason || "Unbekannter Grund"}</p>
        {e.manualResult && e.manualResult !== e.reason && <p className="truncate text-xs text-slate-300">Ergebnis: <b>{e.manualResult}</b></p>}
        <div className="flex flex-wrap gap-1">{(e.types || []).map((t) => <Badge key={t} tone={t === "cheater" || t === "hardban" ? "red" : t === "negativ" ? "zinc" : "sky"}>{TYPE_LABEL[t] || t}</Badge>)}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span className="truncate" title={e.sc}>SC: <b className="font-mono text-slate-200">{e.sc ? `${e.sc.slice(0, 10)}…` : "—"}</b></span>
          <span className="truncate">Größe: <b className="text-slate-200">{formatBytes(e.filesize)}</b></span>
          <span className="truncate" title={(e.pcCheckers || []).join(", ")}><Users size={10} className="mr-1 inline" /><b className="text-slate-200">{(e.pcCheckers || []).length}</b> Checker</span>
          <span className="truncate">Dokument: <b className={/^eingetragen/i.test(e.documentStatus) ? "text-emerald-300" : "text-slate-200"}>{e.documentStatus || "—"}</b></span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button className={btnGhost + mini} onClick={p.onDetail}><Eye size={13} /> Öffnen</button>
          <button className={btnGhost + mini} onClick={p.onEdit}><Pencil size={13} /> Bearbeiten</button>
          <button className={btnGhost + mini} onClick={p.onSc} title="SC aus ACP holen"><Link2 size={13} /> ACP/SC</button>
          <button className={btnGhost + mini} onClick={p.onArchive}>{e.permaArchive ? <><FolderOutput size={13} /> Aus Archiv</> : <><FolderInput size={13} /> Ins Archiv</>}</button>
          <button className={btnDanger + mini} onClick={p.onDelete}><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
}

export function CasesView(p: { list: PovEntry[]; onEdit: (e: PovEntry) => void; onDetail: (e: PovEntry) => void; onDelete: (ids: string[]) => void; onSc: (e: PovEntry) => void }) {
  if (!p.list.length) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-12 text-center">
        <BadgeCheck size={40} className="mx-auto mb-3 text-emerald-500" />
        <p className="font-bold">Keine Verdachtsfälle — alle Datensätze vollständig.</p>
        <p className="mt-1 text-xs text-slate-400">Fehlende oder widersprüchliche Informationen werden hier ohne Raten angezeigt.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-xs">
        <CircleAlert size={16} className="text-orange-400" /><p><b>{p.list.length} Fälle</b> benötigen manuelle Korrektur.</p>
      </div>
      {p.list.map((e) => {
        const miss = getMissing(e);
        return (
          <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#101830] p-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black tick">ID {e.targetId || "???"}</span>
                <Badge tone="violet">{serverLabel(e.server)}</Badge>
                <Badge tone="sky">{formatDate(e.date)}</Badge>
                <span className="text-xs text-slate-400">{e.reason || "kein Grund"}</span>
              </div>
              <p className="mt-1 text-xs text-orange-300">Fehlt: {miss.join(" · ") || "Prüfung offen"}</p>
            </div>
            <div className="flex gap-1.5">
              <button className={btnGhost} onClick={() => p.onSc(e)}><Link2 size={14} /> ACP/SC</button>
              <button className={btnGhost} onClick={() => p.onDetail(e)}><Eye size={14} /> Öffnen</button>
              <button className={btnPrimary} onClick={() => p.onEdit(e)}><Pencil size={14} /> Korrigieren</button>
              <button className={btnDanger} onClick={() => p.onDelete([e.id])}><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DetailModal({ entry, onClose, onEdit, onPlay, dup }: { entry: PovEntry; onClose: () => void; onEdit: () => void; onPlay: () => void; dup: boolean }) {
  const e = entry; const miss = getMissing(e); const thumb = useThumb(e);
  const rows: Array<[string, string]> = [
    ["Ziel-ID", e.targetId], ["Grund", e.reason], ["Ergebnis", e.manualResult || "—"], ["SOC / SC", e.sc || "—"], ["Server", serverLabel(e.server)],
    ["Datum", formatDate(e.date)], ["Discord", e.discord || "—"], ["Im Dokument", e.documentStatus || "—"], ["PC Checker", (e.pcCheckers || []).join(", ") || "—"],
    ["Bann-Typen", (e.types || []).map((t) => TYPE_LABEL[t] || t).join(", ") || "—"], ["Perma-Bann", e.perma ? "Ja" : "Nein"], ["Nicht gebannt", e.notBanned ? "Ja" : "Nein"],
    ["Datei", e.filename || "—"], ["Original", e.origFilename || "—"], ["Größe", formatBytes(e.filesize)], ["YouTube-Slot", String(e.ytSlot || "—")],
  ];
  const tpl = `ID: ${e.targetId}\nGrund: ${e.reason}\nErgebnis: ${e.manualResult || "—"}\nSOC: ${e.sc || "—"}\nProof: ${e.proof || e.youtubeUrl || "—"}\nPC Checker: ${(e.pcCheckers || []).join(", ")}`;
  return (
    <ModalShell title={`ID ${e.targetId || "—"} · ${e.reason}`} sub={`${e.filename} · ${formatBytes(e.filesize)}`} onClose={onClose} wide>
      <div className="space-y-4">
        {thumb && <img src={thumb} alt="" className="h-56 w-full rounded-xl object-cover" />}
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={resultTone(e)}>{e.result}</Badge>
          {e.permaArchive && <Badge tone="amber">POV-Archiv</Badge>}{e.perma && <Badge tone="red">Perma</Badge>}{dup && <Badge tone="red">Doppelte ID</Badge>}
          {miss.length ? <Badge tone="orange">fehlt: {miss.join(", ")}</Badge> : <Badge tone="green">vollständig</Badge>}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p>
              <p className="truncate text-sm font-bold" title={v}>{v || "—"}</p>
            </div>
          ))}
        </div>
        {(e.youtubeUrl || e.proof) && <p className="truncate text-xs">Proof: <a href={e.proof || e.youtubeUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">{e.proof || e.youtubeUrl}</a></p>}
        {Object.keys(e.timestamps || {}).length > 0 && <p className="text-xs text-slate-400">Zeitmarken: {Object.entries(e.timestamps).map(([k, v]) => `${k} ${v}s`).join(" · ")}</p>}
        {e.note && <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><b>Notiz:</b> {e.note}</p>}
        {e.ocrRaw && <details className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><summary className="cursor-pointer font-bold">OCR-Rohdaten</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-slate-400">{e.ocrRaw}</pre></details>}
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={onPlay}><Play size={15} /> Video / YouTube öffnen</button>
          <button className={btnGhost} onClick={onEdit}><Pencil size={15} /> Bearbeiten</button>
          <button className={btnGhost} onClick={() => copyText(tpl)}><Copy size={15} /> Vorlage kopieren</button>
        </div>
      </div>
    </ModalShell>
  );
}
