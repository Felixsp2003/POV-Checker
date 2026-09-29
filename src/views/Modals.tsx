import { useEffect, useMemo, useState } from "react";
import { KeyRound, Save, XCircle } from "lucide-react";
import { DB_NAME, PovEntry, STORE, buildFinalFilename, canBuildFinalName, emptyEntry, findVideo, getMissing, loadPhoto, savePhoto } from "../lib/core";
import { captureFrameAt } from "../lib/services";
import { Badge, Field, ModalShell, btnGhost, btnPrimary, inputCls } from "../ui";
import PovForm from "./PovForm";

// ---------- Eintrag bearbeiten (mit lokalem Video + Zeitmarken, falls vorhanden) ----------
export function EditModal({ entry, onClose, onSave, pool, onAddPool, acpStatus, onAcp }: {
  entry: PovEntry; onClose: () => void; onSave: (e: PovEntry) => void;
  pool: string[]; onAddPool: (n: string) => void; acpStatus?: string; onAcp: (e: PovEntry) => void;
}) {
  const [f, setF] = useState<PovEntry>({ ...entry });
  const [url, setUrl] = useState("");
  const [photo, setPhoto] = useState("");
  useEffect(() => {
    let u = ""; let p = ""; let alive = true;
    void findVideo(entry).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    void loadPhoto(entry.id).then((b) => { if (b && alive) { p = URL.createObjectURL(b); setPhoto(p); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); if (p) URL.revokeObjectURL(p); };
  }, [entry]);
  const miss = getMissing(f);
  return (
    <ModalShell title={`Eintrag bearbeiten · ID ${entry.targetId || "—"}`} sub={`${entry.filename || entry.origFilename} · Änderung wird lokal + Tresor gesichert`} onClose={onClose} xwide>
      <PovForm value={f} onChange={(patch) => setF((p) => ({ ...p, ...patch }))} videoUrl={url} youtubeUrl={f.youtubeUrl} timestamps={f.timestamps}
        acpStatus={acpStatus} onAcp={() => onAcp(f)} pool={pool} onAddPool={onAddPool} bannerPhoto={photo}
        onRecapture={(sec) => { void findVideo(entry).then((b) => b && captureFrameAt(b, sec).then((d) => { if (d) { setPhoto(d); void savePhoto(entry.id, d); } })); }}
        onOpenPov={() => { const u = url || f.youtubeUrl; if (u) window.open(u, "_blank", "noopener"); }} />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        {miss.length > 0 ? <Badge tone="orange">fehlt: {miss.join(", ")}</Badge> : <Badge tone="green">vollständig</Badge>}
        <span className="text-[11px] text-slate-500">{canBuildFinalName(f) ? <>Finaler Name: <b className="text-slate-300">{buildFinalFilename(f)}</b></> : <>Name bleibt vorläufig: <b className="text-slate-300">{f.origFilename || f.filename}</b></>}</span>
        <div className="ml-auto flex gap-2">
          <button className={btnGhost} onClick={onClose}>Abbrechen</button>
          <button className={btnPrimary} onClick={() => onSave(f)}><Save size={15} /> Speichern</button>
        </div>
      </div>
    </ModalShell>
  );
}

// ---------- Neuer Eintrag (ohne Video, z. B. Nachtrag) ----------
export function NewEntryModal({ onClose, onSave, serverDefault, pool, onAddPool }: {
  onClose: () => void; onSave: (e: PovEntry) => void; serverDefault: string; pool: string[]; onAddPool: (n: string) => void;
}) {
  const [f, setF] = useState<PovEntry>(() => emptyEntry(serverDefault));
  const miss = getMissing(f);
  return (
    <ModalShell title="Neuer Eintrag" sub="Wird unter „Alle“ gespeichert — nicht automatisch im POV-Archiv" onClose={onClose} wide>
      <PovForm value={f} onChange={(patch) => setF((p) => ({ ...p, ...patch }))} pool={pool} onAddPool={onAddPool} showVideo={false} />
      <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4">
        {miss.length > 0 ? <Badge tone="orange">fehlt: {miss.join(", ")}</Badge> : <Badge tone="green">vollständig</Badge>}
        <div className="ml-auto flex gap-2">
          <button className={btnGhost} onClick={onClose}>Abbrechen</button>
          <button className={btnPrimary} onClick={() => onSave({ ...f, filename: buildFinalFilename(f, f.origFilename), youtubeUrl: f.youtubeUrl || (/youtu\.?be/.test(f.proof) ? f.proof : "") })}><Save size={15} /> Speichern</button>
        </div>
      </div>
    </ModalShell>
  );
}

export function VideoModal({ entry, url, onClose }: { entry: PovEntry; url: string; onClose: () => void }) {
  return (
    <ModalShell title={`Video · ID ${entry.targetId || "—"}`} sub={entry.filename} onClose={onClose} wide>
      <video src={url} controls autoPlay className="max-h-[65vh] w-full rounded-xl bg-black" />
      <p className="mt-2 text-xs text-slate-400">Lokale Datei aus IndexedDB ({DB_NAME} / {STORE}) · {(entry.filesize / 1048576).toFixed(1)} MB {entry.youtubeUrl && <a href={entry.youtubeUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">· Auf YouTube ansehen</a>}</p>
    </ModalShell>
  );
}

// ---------- Passwort ----------
export function PwForm({ username, onChange, onDone, onCancel, submitLabel = "Passwort ändern", cancelLabel = "Abbrechen" }: {
  username: string; onChange: (u: string, oldPw: string, newPw: string) => Promise<string>; onDone: () => void; onCancel?: () => void; submitLabel?: string; cancelLabel?: string;
}) {
  const [oldPw, setOldPw] = useState(""); const [newPw, setNewPw] = useState(""); const [newPw2, setNewPw2] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const score = useMemo(() => {
    let s = 0; if (newPw.length >= 8) s++; if (newPw.length >= 12) s++; if (/[a-z]/.test(newPw) && /[A-Z]/.test(newPw)) s++; if (/\d/.test(newPw)) s++; if (/[^A-Za-z0-9]/.test(newPw)) s++;
    return Math.min(5, s);
  }, [newPw]);
  const bars = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];
  const submit = async () => {
    setErr("");
    if (newPw !== newPw2) { setErr("Die neuen Passwörter stimmen nicht überein."); return; }
    setBusy(true); const msg = await onChange(username, oldPw, newPw); setBusy(false);
    if (msg) { setErr(msg); return; }
    onDone();
  };
  return (
    <div className="space-y-3">
      <Field label={`Aktuelles Passwort (${username})`}><input className={inputCls} type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} /></Field>
      <Field label="Neues Passwort (min. 8 Zeichen, Buchstaben + Zahlen)"><input className={inputCls} type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>
      {newPw && (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? bars[score] : "bg-white/10"}`} />)}</div>
          <span className="text-[10px] font-bold text-slate-400">{score <= 1 ? "schwach" : score <= 3 ? "mittel" : "stark"}</span>
        </div>
      )}
      <Field label="Neues Passwort wiederholen"><input className={inputCls} type="password" autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} /></Field>
      {err && <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300"><XCircle size={14} className="mt-0.5 shrink-0" /> {err}</p>}
      <div className="flex gap-2">
        {onCancel && <button className={btnGhost} onClick={onCancel} disabled={busy}>{cancelLabel}</button>}
        <button className={`${btnPrimary} flex-1 justify-center`} onClick={() => void submit()} disabled={busy || !oldPw || !newPw || !newPw2}><Save size={15} /> {busy ? "Speichere…" : submitLabel}</button>
      </div>
    </div>
  );
}

// Erzwungene Passwortänderung (blockiert die komplette App)
export function ForceChangeModal({ username, onChange, onDone, onLogout }: {
  username: string; onChange: (u: string, oldPw: string, newPw: string) => Promise<string>; onDone: () => void; onLogout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-[#0d1424] p-6 shadow-2xl fade-up">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-black"><KeyRound size={22} /></div>
          <div>
            <h2 className="text-lg font-black">Passwort ändern — erforderlich</h2>
            <p className="text-xs text-slate-400">Du nutzt noch das öffentliche Standardpasswort. Die App bleibt gesperrt, bis du ein eigenes gesetzt hast.</p>
          </div>
        </div>
        <PwForm username={username} onChange={onChange} onDone={onDone} onCancel={onLogout} cancelLabel="Abmelden" submitLabel="Passwort festlegen und weiter" />
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-400">
          <p className="font-bold text-slate-200">Wichtig</p>
          <p className="mt-1">Das Passwort ist zugleich der Schlüssel für den AES-256-Tresor. Ohne dieses Passwort kann niemand deine Cloud-Backups lesen — es gibt keine Wiederherstellung. Sicher notieren.</p>
        </div>
      </div>
    </div>
  );
}
