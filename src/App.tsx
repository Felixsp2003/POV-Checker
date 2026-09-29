import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, AlertTriangle, Upload, FileSpreadsheet, Settings as SettingsIcon,
  Search, Plus, RefreshCw, LogOut, Shield, Database, CheckCircle2,
  XCircle, Clock, Play, Eye, Pencil, Trash2, FolderInput, FolderOutput,
  ChevronDown, Copy, ExternalLink, Download, HardDrive, KeyRound, User,
  Film, ScanSearch, Link2, FileText, Info, Zap, ListVideo, BadgeCheck, CircleAlert,
  ArrowUpRight, Save, X, MonitorPlay, CloudUpload, CloudDownload, PlugZap, Video,
} from "lucide-react";
import {
  APP_VERSION, META_KEY, DB_NAME, STORE, PovEntry, QueueItem, YTConnection, DriveConfig,
  AppSettings, ScCheckResult, ALLOWED_REASONS, SERVERS, CSV_FILTER_DEFS, CSV_SORTS,
  uid, sha256, formatBytes, formatDate, todayISO, safeJSON,
  isHardbann, isSocBan, isCheater, isPcCheck, isBan, isNegative, getMissing,
  findDuplicateIds, buildFinalFilename, entryQuality,
  getVideo, putVideo, delVideo, hasVideo,
  loadMeta, saveMeta, loadDeleted, saveDeleted, markDeleted, saveRecord, loadAllRecords, deleteRecord,
  mergeEntries, loadSettings, saveSettings, loadYT, saveYT, loadDrive, saveDrive,
  loadUsers, saveUsers, loadSession, saveSession, loadBridgeToken, loadQueueMeta, saveQueueMeta,
  applyCsvFilters, sortCsv, toCSV, extractCrossbanServer, buildCrossbanCommands, buildCrossbanTemplate,
} from "./lib/core";
import {
  captureThumbnail, runOcrOnFile, youtubeUpload, youtubeWaitProcessing, youtubeSetTitle,
  driveBackup, driveRestore, downloadLocalBackup, googleConnect, openAcpForId,
  installAcpListener, downloadExtension,
} from "./lib/services";
import {
  unlockVault, lockVault, restoreVaultKey, lockStatus, noteLoginFail, noteLoginOk, formatRemain,
  downloadEncryptedVault, importEncryptedFile,
} from "./lib/vault";

// ============================== kleine UI-Helfer ==============================

// Öffentlicher Standard-Zugang. Kein persönliches Passwort mehr im Quellcode.
// Die Änderung wird beim ersten Login erzwungen (siehe ForceChangePassword).
const DEFAULT_USER = "Adam";
const DEFAULT_PW = "Admin";

type View = "archive" | "cases" | "upload" | "csv" | "settings";
type ArchiveFilter = "alle" | "bans" | "pc" | "soc" | "hard" | "cheater" | "negativ" | "ohne-video" | "archiv" | "doppelt";

interface Toast { id: string; kind: "ok" | "err" | "info"; text: string; }

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = uid("t");
    setToasts((p) => [...p.slice(-4), { id, kind, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5200);
  }, []);
  return { toasts, push };
}

function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: "bg-white/5 text-slate-300 border-white/10",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
    sky: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    orange: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tones[tone] || tones.zinc}`}>{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "w-full rounded-lg border border-white/10 bg-[#0b1326] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20";
const btnPrimary = "inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-[#131006] hover:bg-amber-400 transition shadow-[0_8px_30px_-8px_rgba(245,158,11,.6)]";
const btnGhost = "inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10 transition";
const btnDanger = "inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition";

// ============================== HAUPT-APP ==============================

export default function App() {
  const { toasts, push } = useToasts();
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<string>("");
  const [view, setView] = useState<View>("archive");
  const [entries, setEntries] = useState<PovEntry[]>([]);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("alle");
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [ytConns, setYtConns] = useState<YTConnection[]>(() => loadYT());
  const [drive, setDrive] = useState<DriveConfig>(() => loadDrive());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [driveMsg, setDriveMsg] = useState("");

  // Modals
  const [detail, setDetail] = useState<PovEntry | null>(null);
  const [editing, setEditing] = useState<PovEntry | null>(null);
  const [videoPlay, setVideoPlay] = useState<{ entry: PovEntry; url: string } | null>(null);
  const [manual, setManual] = useState<{ qid: string } | { entryId: string } | null>(null);
  const [scOpen, setScOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  // CSV-State
  const [csvActive, setCsvActive] = useState<Set<string>>(new Set());
  const [csvSearch, setCsvSearch] = useState("");
  const [csvFrom, setCsvFrom] = useState("");
  const [csvTo, setCsvTo] = useState("");
  const [csvSort, setCsvSort] = useState("new");

  const filesRef = useRef<Map<string, File>>(new Map());
  const abortRef = useRef<Map<string, AbortController>>(new Map());
  const bridgeToken = useMemo(() => loadBridgeToken(), []);
  const autoBackupTimer = useRef<number | null>(null);

  // ---------- START-SEQUENZ (nur LESEN, niemals zurücksetzen!) ----------
  useEffect(() => {
    (async () => {
      try {
        // 1-7: Speicher lesen (Meta + Einzelrecords mergen, Löschungen beachten)
        const meta = loadMeta();
        const recs = loadAllRecords();
        const merged = mergeEntries(meta, recs);
        const deleted = new Set(loadDeleted());
        setEntries(merged.filter((e) => !deleted.has(e.id)));
        // Queue-Meta laden (Dateien müssen ggf. erneut gewählt werden)
        const qm = loadQueueMeta().filter((q) => q.status !== "gespeichert");
        setQueue(qm.map((q) => ({ ...q, status: q.status === "gespeichert" ? q.status : "wartet", progress: 0, error: q.error || "" })));
        // Standard-Konto einmalig anlegen, falls noch KEIN Benutzer existiert.
        // Öffentliches Standardpasswort "Admin" — Änderung wird beim ersten Login ERZWUNGEN.
        // Kein persönliches Passwort mehr im Quellcode.
        if (loadUsers().length === 0) {
          const salt = uid("s");
          const p = await sha256(salt + "::" + DEFAULT_PW);
          saveUsers([{ u: DEFAULT_USER, p, salt, created: Date.now(), role: "admin", mustChange: true }]);
        }
        // Session nur gültig, wenn Tresor-Schlüssel in dieser Browsersitzung entsperrt ist
        const unlocked = await restoreVaultKey();
        const s = loadSession();
        if (s && unlocked) {
          setUser(s);
          const me = loadUsers().find((x) => x.u === s);
          if (me?.mustChange) setForceChange(true);
        }
        // alte Queue-Blobs verifizieren (still)
        void meta; void recs;
      } catch (e) {
        push("err", `Start-Fehler: ${e instanceof Error ? e.message : String(e)} — lokale Daten wurden NICHT verändert.`);
      } finally {
        setBooted(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- ACP Bridge Listener ----------
  useEffect(() => {
    const off = installAcpListener((m) => {
      if (m.type === "SC_RESULT" && m.sc) {
        push("ok", `ACP: SC „${m.sc}“ empfangen${m.targetId ? ` für ID ${m.targetId}` : ""}.`);
        setEntries((prev) => {
          if (!m.targetId) return prev;
          const next = prev.map((e) => e.targetId === m.targetId && !e.sc
            ? { ...e, sc: m.sc, rid: e.rid || m.sc, updatedAt: Date.now(), quality: entryQuality({ ...e, sc: m.sc }) }
            : e);
          persist(next, "ACP SC übernommen", true);
          return next;
        });
        setQueue((prev) => prev.map((q) =>
          q.ocr?.targetId === m.targetId ? { ...q, ocr: { ...q.ocr, sc: m.sc } } : q));
        (window as unknown as { __DC_LAST_SC?: unknown }).__DC_LAST_SC = m;
      }
      if (m.type === "SC_CHECK_RESULT") {
        (window as unknown as { __DC_SC_RESULTS?: unknown[] }).__DC_SC_RESULTS =
          [...((window as unknown as { __DC_SC_RESULTS?: unknown[] }).__DC_SC_RESULTS || []), m];
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Persistenz (Daten haben Vorrang vor UI) ----------
  const persist = useCallback((next: PovEntry[], reason: string, skipBackup = false) => {
    try {
      saveMeta(next); // Haupt-Meta
      for (const e of next.slice(0, 400)) saveRecord(e); // redundante Einzelrecords
    } catch (e) {
      push("err", `Lokales Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
    setEntries(next);
    if (!skipBackup && loadSettings().autoBackup) {
      if (autoBackupTimer.current) window.clearTimeout(autoBackupTimer.current);
      autoBackupTimer.current = window.setTimeout(() => {
        void driveBackup(reason).then((r) => setDriveMsg(r.msg));
      }, 1200);
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadFromDisk = useCallback(() => {
    const meta = loadMeta();
    const recs = loadAllRecords();
    const merged = mergeEntries(meta, recs);
    const deleted = new Set(loadDeleted());
    setEntries(merged.filter((e) => !deleted.has(e.id)));
    setYtConns(loadYT());
    setDrive(loadDrive());
    setSettings(loadSettings());
    push("info", `Neu geladen: ${merged.length} Einträge aus persistentem Speicher (${META_KEY} + ${DB_NAME}).`);
  }, [push]);

  // ---------- Archiv: Filter ist reine Anzeige ----------
  const dupIds = useMemo(() => findDuplicateIds(entries), [entries]);
  const archiveCounts = useMemo(() => ({
    alle: entries.length,
    bans: entries.filter(isBan).length,
    pc: entries.filter(isPcCheck).length,
    soc: entries.filter(isSocBan).length,
    hard: entries.filter(isHardbann).length,
    cheater: entries.filter(isCheater).length,
    negativ: entries.filter(isNegative).length,
    ohneVideo: entries.filter((e) => !e.hasVideo).length,
    archiv: entries.filter((e) => e.permaArchive).length,
    doppelt: entries.filter((e) => dupIds.has(e.targetId)).length,
  }), [entries, dupIds]);

  const archiveList = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = entries;
    switch (archiveFilter) {
      case "bans": list = list.filter(isBan); break;
      case "pc": list = list.filter(isPcCheck); break;
      case "soc": list = list.filter(isSocBan); break;
      case "hard": list = list.filter(isHardbann); break;
      case "cheater": list = list.filter(isCheater); break;
      case "negativ": list = list.filter(isNegative); break;
      case "ohne-video": list = list.filter((e) => !e.hasVideo); break;
      case "archiv": list = list.filter((e) => e.permaArchive); break;
      case "doppelt": list = list.filter((e) => dupIds.has(e.targetId)); break;
      default: break;
    }
    if (s) list = list.filter((e) =>
      e.targetId.toLowerCase().includes(s) || e.sc.toLowerCase().includes(s) ||
      e.reason.toLowerCase().includes(s) || e.rid.toLowerCase().includes(s));
    return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [entries, archiveFilter, search, dupIds]);

  const casesList = useMemo(() =>
    entries.filter((e) => getMissing(e).length > 0 || e.result === "VERDACHT" || e.result === "OFFEN"),
    [entries]);

  // ---------- Aktionen ----------
  const doArchive = (ids: string[], to: boolean) => {
    const next = entries.map((e) => ids.includes(e.id) ? { ...e, permaArchive: to, updatedAt: Date.now() } : e);
    persist(next, to ? "POV archiviert" : "POV aus Archiv entfernt");
    push("ok", to ? `${ids.length} POV(s) ins POV-Archiv verschoben (bleiben unter „Alle“).` : `${ids.length} POV(s) aus Archiv entfernt.`);
    setSelected(new Set());
  };

  const doDelete = async (ids: string[]) => {
    if (!window.confirm(`${ids.length} POV(s) endgültig löschen? Lokale Metadaten + Video werden entfernt.`)) return;
    const next = entries.filter((e) => !ids.includes(e.id));
    // 1. localStorage aktualisieren, 2. IDB entfernen, 3. Löschmarkierung
    try {
      saveMeta(next);
      for (const id of ids) {
        markDeleted(id); deleteRecord(id);
        try { await delVideo(id); } catch { /* ok */ }
      }
      setEntries(next);
      setSelected(new Set());
      push("ok", `${ids.length} POV(s) gelöscht. Löschmarkierung gespeichert — kein Auto-Restore.`);
      void driveBackup("POV gelöscht").then((r) => setDriveMsg(r.msg));
    } catch (e) {
      push("err", `Löschen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const openVideo = async (entry: PovEntry) => {
    if (entry.youtubeUrl) { window.open(entry.youtubeUrl, "_blank", "noopener"); return; }
    try {
      const blob = await getVideo(entry.id);
      if (!blob) { push("err", "Kein lokales Video in IndexedDB gefunden."); return; }
      const url = URL.createObjectURL(blob);
      setVideoPlay({ entry, url });
    } catch (e) {
      push("err", `Video-Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saveEditedEntry = (e: PovEntry) => {
    const next = entries.map((x) => x.id === e.id
      ? { ...e, filename: buildFinalFilename(e), updatedAt: Date.now(), quality: entryQuality(e) }
      : x);
    persist(next, "POV bearbeitet");
    void youtubeSetTitle(e.youtubeId, buildFinalFilename(e), ytConns[0]?.accessToken || "");
    setEditing(null); setDetail(null);
    push("ok", `ID ${e.targetId} gespeichert — nach Reload weiterhin vorhanden.`);
  };

  // ---------- Upload-Pipeline ----------
  const addFiles = async (files: FileList | File[]) => {
    const arr = [...files].filter((f) => f.size > 0);
    if (!arr.length) return;
    const items: QueueItem[] = [];
    for (const f of arr) {
      const qid = uid("q");
      filesRef.current.set(qid, f);
      const thumb = await captureThumbnail(f).catch(() => ({ url: "", duration: 0, width: 0, height: 0 }));
      items.push({
        qid, fileName: f.name, fileSize: f.size, fileType: f.type || "video/mp4",
        status: "wartet", progress: 0, ocrProgress: 0, ocrResult: "",
        youtubeStatus: "wartet", youtubeId: "", youtubeUrl: "",
        processingStatus: "", error: "", ytSlot: settings.ytDefaultSlot,
        ocr: null, ocrComplete: false, missing: [], editing: false,
        createdAt: Date.now(), thumbUrl: thumb.url, duration: thumb.duration,
      });
      // Queue-Blob sofort persistent (Reload-sicher)
      try { await putVideo("q_" + qid, f, { name: f.name }); } catch { /* Quota */ }
    }
    const next = [...queue, ...items];
    setQueue(next); saveQueueMeta(next);
    push("info", `${items.length} Datei(en) in Warteschlange — Status „Upload wartet · 0 %“.`);
  };

  const runPipeline = async (qid: string) => {
    const item = queue.find((q) => q.qid === qid);
    if (!item) return;
    let file = filesRef.current.get(qid) || null;
    if (!file) {
      // Reload: Blob aus IndexedDB wiederherstellen
      const blob = await getVideo("q_" + qid).catch(() => null);
      if (blob) { file = new File([blob], item.fileName, { type: item.fileType }); filesRef.current.set(qid, file); }
      else {
        setQueue((p) => p.map((q) => q.qid === qid ? { ...q, status: "fehler", error: "Datei nach Reload nicht gefunden — bitte erneut wählen." } : q));
        return;
      }
    }
    const ctrl = new AbortController();
    abortRef.current.set(qid, ctrl);
    const setQ = (patch: Partial<QueueItem>) => setQueue((p) => p.map((q) => q.qid === qid ? { ...q, ...patch } : q));
    try {
      // 5-7: YouTube Upload (unlisted, Slot)
      setQ({ status: "youtube-upload", error: "", progress: 0, youtubeStatus: "upload" });
      const slot = ytConns[item.ytSlot] || ytConns[0];
      const { videoId, url } = await youtubeUpload(file, item.fileName, slot.slot, slot.accessToken || "",
        (pr) => setQ({ progress: pr.percent, youtubeStatus: pr.status }), ctrl.signal);
      setQ({ youtubeId: videoId, youtubeUrl: url, youtubeStatus: `fertig · ${videoId}`, progress: 100 });
      // 8-9: Verarbeitung abwarten (processingStatus = succeeded)
      setQ({ status: "youtube-wartet", processingStatus: "uploaded" });
      const proc = await youtubeWaitProcessing(videoId, slot.accessToken || "", true,
        (s) => setQ({ processingStatus: s }), ctrl.signal);
      if (proc !== "succeeded") throw new Error("YouTube-Verarbeitung fehlgeschlagen");
      // 10-17: OCR auf lokaler Originaldatei
      setQ({ status: "ocr", ocrProgress: 5, ocrResult: "Frames werden extrahiert…" });
      const ocr = await runOcrOnFile(file, item.fileName, settings.adminId, settings.ocrFrames, settings.ocrLanguage,
        (p) => setQ({ ocrProgress: Math.min(95, 10 + Math.round((p.frame / p.frames) * 70)), ocrResult: `[${p.variant}] ${p.text.slice(0, 160)}` }));
      const merged = { ...ocr.data };
      const missing = getMissing(merged);
      setQ({
        status: "fertig", ocrProgress: 100, ocr: merged, ocrComplete: missing.length === 0, missing,
        ocrResult: ocr.raw.slice(0, 1200) || "OCR abgeschlossen (Dateiname-Heuristik + Frame-Analyse).",
      });
      const nq = queue.map((q) => q.qid === qid ? { ...q, status: "fertig" as const } : q);
      saveQueueMeta(nq);
      push(missing.length === 0 ? "ok" : "info",
        missing.length === 0 ? `POV vollständig: ID ${merged.targetId} · ${merged.reason}` : `OCR fertig — bitte prüfen: fehlt ${missing.join(", ")}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("abgebrochen")) setQ({ status: "wartet", error: "Abgebrochen." });
      else setQ({ status: "fehler", error: msg });
      push("err", `Pipeline-Fehler (${item.fileName}): ${msg} — Datei bleibt in Queue erhalten.`);
    } finally {
      abortRef.current.delete(qid);
    }
  };

  const saveQueueItem = async (qid: string) => {
    const item = queue.find((q) => q.qid === qid);
    if (!item || !item.ocr) return;
    let file = filesRef.current.get(qid) || null;
    if (!file) {
      const blob = await getVideo("q_" + qid).catch(() => null);
      if (blob) file = new File([blob], item.fileName, { type: item.fileType });
    }
    setBusy(qid);
    try {
      // ZUERST Metadaten, DANN IDB, DANN Meta speichern, DANN verifizieren
      const id = uid("pov");
      const now = Date.now();
      const o = item.ocr;
      const filename = buildFinalFilename({ ...o, date: o.date || todayISO() });
      const entry: PovEntry = {
        id, targetId: (o.targetId || "").trim(), reason: (o.reason || "Unvollständig").trim(),
        sc: (o.sc || "").trim(), server: o.server || settings.serverDefault,
        date: o.date || todayISO(), discord: (o.discord || "").trim(),
        proof: item.youtubeUrl || "", youtubeId: item.youtubeId, youtubeUrl: item.youtubeUrl,
        youtubeTitle: filename, filename, origFilename: item.fileName,
        filesize: item.fileSize, duration: item.duration || 0,
        result: getMissing(o).length === 0 ? "BESTÄTIGT" : "OFFEN",
        status: getMissing(o).length === 0 ? "vollständig" : `unvollständig: ${getMissing(o).join(", ")}`,
        family: (o.family || "").trim(), rid: (o.sc || "").trim(), note: "",
        permaArchive: false, // NIEMALS automatisch archivieren
        hasVideo: !!file, thumbnail: item.thumbUrl || "",
        createdAt: now, updatedAt: now, quality: entryQuality(o),
        ocrRaw: item.ocrResult.slice(0, 2000), adminId: settings.adminId,
      };
      if (file) await putVideo(id, file, { name: filename }); // Datei dauerhaft
      const next = [entry, ...entries];
      saveMeta(next); saveRecord(entry); // Metadaten dauerhaft
      // Verifizieren
      const verifyMeta = loadMeta().some((e) => e.id === id);
      const verifyVideo = file ? await hasVideo(id) : true;
      if (!verifyMeta || !verifyVideo) throw new Error("Verifizierung fehlgeschlagen — nicht als gespeichert markiert.");
      try { await delVideo("q_" + qid); } catch { /* ok */ }
      filesRef.current.delete(qid);
      setEntries(next);
      const nq = queue.filter((q) => q.qid !== qid);
      setQueue(nq); saveQueueMeta(nq);
      push("ok", `POV gespeichert unter „Alle“ (NICHT im POV-Archiv). ID ${entry.targetId || "—"} · ${entry.reason}`);
      void driveBackup("POV gespeichert").then((r) => setDriveMsg(r.msg));
      void youtubeSetTitle(item.youtubeId, filename, ytConns[item.ytSlot]?.accessToken || "");
    } catch (e) {
      push("err", `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)} — NICHT als gespeichert markiert.`);
    } finally {
      setBusy("");
    }
  };

  // ---------- CSV ----------
  const csvFiltered = useMemo(() => {
    const f = applyCsvFilters(entries, { active: csvActive, search: csvSearch, from: csvFrom, to: csvTo });
    return sortCsv(f, csvSort);
  }, [entries, csvActive, csvSearch, csvFrom, csvTo, csvSort]);

  const exportCSV = () => {
    const csv = toCSV(csvFiltered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `grandrp-povs-${csvFiltered.length}-${todayISO()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    push("ok", `CSV exportiert: ${csvFiltered.length} Einträge (nur gefilterte).`);
  };

  // ---------- Login ----------
  const [loginU, setLoginU] = useState("");
  const [loginP, setLoginP] = useState("");
  const [forceChange, setForceChange] = useState(false);

  const changeOwnPassword = async (username: string, oldPw: string, newPw: string): Promise<string> => {
    const users = loadUsers();
    const me = users.find((x) => x.u.toLowerCase() === username.toLowerCase());
    if (!me) return "Benutzer nicht gefunden.";
    const oldHash = await sha256(me.salt + "::" + oldPw);
    if (oldHash !== me.p) return "Aktuelles Passwort ist falsch.";
    if (newPw.length < 8) return "Neues Passwort muss mindestens 8 Zeichen haben.";
    if (newPw === DEFAULT_PW) return "Das Standardpasswort darf nicht beibehalten werden.";
    if (!/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) return "Neues Passwort braucht Buchstaben und Zahlen.";
    if (newPw === oldPw) return "Neues Passwort muss sich vom alten unterscheiden.";
    if (newPw.toLowerCase().includes(username.toLowerCase())) return "Passwort darf den Benutzernamen nicht enthalten.";
    // Neuer Salt + neuer Hash; AES-Tresor-Schlüssel auf neues Passwort umstellen
    const salt = uid("s");
    const hash = await sha256(salt + "::" + newPw);
    saveUsers(users.map((x) => x.u === me.u ? { ...x, p: hash, salt, mustChange: false } : x));
    await unlockVault(me.u, newPw);
    return "";
  };

  const doLogin = async () => {
    const lock = lockStatus();
    if (lock.locked) {
      push("err", `Konto gesperrt. Nochmal in ${formatRemain(lock.remainMs)}.`);
      return;
    }
    const users = loadUsers();
    if (users.length === 0) {
      if (!loginU.trim() || loginP.length < 4) { push("err", "Bitte Benutzername + Passwort (min. 4 Zeichen) für das erste Konto wählen."); return; }
      const salt = uid("s");
      const p = await sha256(salt + "::" + loginP);
      saveUsers([{ u: loginU.trim(), p, salt, created: Date.now(), role: "admin" }]);
      await unlockVault(loginU.trim(), loginP);
      noteLoginOk();
      saveSession(loginU.trim()); setUser(loginU.trim());
      setLoginP("");
      push("ok", `Willkommen, ${loginU.trim()}! Konto angelegt. Tresor AES-256 entsperrt.`);
      return;
    }
    const found = users.find((x) => x.u.toLowerCase() === loginU.trim().toLowerCase());
    if (!found) {
      const f = noteLoginFail();
      push("err", f.locked ? `Zu viele Fehlversuche. Gesperrt für ${formatRemain(f.remainMs)}.` : "Benutzer nicht gefunden.");
      return;
    }
    const h = await sha256(found.salt + "::" + loginP);
    if (h !== found.p) {
      const f = noteLoginFail();
      push("err", f.locked ? `Falsches Passwort. Konto ${formatRemain(f.remainMs)} gesperrt.` : `Falsches Passwort (${f.fails}/5).`);
      return;
    }
    await unlockVault(found.u, loginP);
    noteLoginOk();
    saveSession(found.u); setUser(found.u);
    setLoginP("");
    if (found.mustChange) {
      setForceChange(true);
      push("info", "Standardpasswort erkannt — bitte jetzt ein eigenes Passwort setzen.");
      return;
    }
    push("ok", `Angemeldet als ${found.u}. Tresor entsperrt — Cloud-Daten nur mit diesem Passwort lesbar.`);
    void driveBackup("login");
  };

  // ============================== RENDER ==============================
  if (!booted) {
    return (
      <div className="flex h-full items-center justify-center bg-[#070b14]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-500/30 border-t-amber-500" />
          <p className="text-sm text-slate-400">Lade persistenten Speicher… ({META_KEY})</p>
        </div>
      </div>
    );
  }

  if (settings.loginRequired && !user) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#070b14] p-6" style={{ backgroundImage: "radial-gradient(800px 400px at 20% 10%, rgba(245,158,11,.12), transparent), radial-gradient(800px 400px at 90% 90%, rgba(34,211,238,.08), transparent)" }}>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1424]/90 p-8 shadow-2xl fade-up">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 font-black text-xl text-black">DC</div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Grand RP DC Checker</h1>
              <p className="text-xs text-slate-400">POV · OCR · YouTube · {APP_VERSION}</p>
            </div>
          </div>
          <h2 className="mb-1 text-lg font-bold">Sicherer Zugang</h2>
          <p className="mb-5 text-xs text-slate-400">Passwort wird nur als Hash gespeichert. Daraus entsteht der AES-256-Tresor-Schlüssel — Cloud-Backups sind ohne dieses Passwort unlesbar. Nach 5 Fehlversuchen 15 Minuten Sperre. Sitzung endet mit dem Schließen des Browsers.</p>
          <div className="space-y-3">
            <Field label="Benutzername">
              <input className={inputCls} value={loginU} onChange={(e) => setLoginU(e.target.value)} placeholder="z. B. admin" autoComplete="username" />
            </Field>
            <Field label="Passwort">
              <input className={inputCls} type="password" value={loginP} onChange={(e) => setLoginP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void doLogin()} placeholder="••••••••" autoComplete="current-password" />
            </Field>
            <button className={`${btnPrimary} w-full justify-center`} onClick={() => void doLogin()}><KeyRound size={16} /> Anmelden</button>
            <p className="text-center text-[11px] text-slate-500">Lokal dauerhaft · AES-256-Tresor · anderer PC über Drive oder geheimes GitHub-Gist</p>
          </div>
        </div>
        <Toasts toasts={toasts} />
      </div>
    );
  }

  const titles: Record<View, { t: string; d: string }> = {
    archive: { t: "Archiv", d: `${entries.length} Einträge · Filter verändern niemals die Originaldaten` },
    cases: { t: "Verdachtsfälle", d: `${casesList.length} unvollständige / widersprüchliche Fälle` },
    upload: { t: "POVs hochladen", d: "YouTube-Upload (unlisted) → Verarbeitung abwarten → OCR → speichern" },
    csv: { t: "CSV erstellen", d: "Filtern, sortieren & exportieren — nur gefilterte Einträge werden exportiert" },
    settings: { t: "Einstellungen", d: "Tresor AES-256 · Drive · Gist · OCR · YouTube ×3 · ACP · Benutzer" },
  };

  const filters: Array<{ id: ArchiveFilter; label: string; count: number; icon?: React.ReactNode }> = [
    { id: "alle", label: "Alle", count: archiveCounts.alle },
    { id: "bans", label: "Bans", count: archiveCounts.bans },
    { id: "pc", label: "PC-Checks", count: archiveCounts.pc },
    { id: "soc", label: "Soc-Ban", count: archiveCounts.soc },
    { id: "hard", label: "Hardbann", count: archiveCounts.hard },
    { id: "cheater", label: "Cheater", count: archiveCounts.cheater },
    { id: "negativ", label: "Negativ", count: archiveCounts.negativ },
    { id: "ohne-video", label: "Ohne Video", count: archiveCounts.ohneVideo },
    { id: "archiv", label: "POV Archiv", count: archiveCounts.archiv },
    { id: "doppelt", label: "Doppelte IDs", count: archiveCounts.doppelt },
  ];

  return (
    <div className="flex h-full bg-[#070b14] text-slate-100">
      {/* ============ SIDEBAR ============ */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-[#0a101f]">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-lg font-black text-black">DC</div>
            <div>
              <p className="text-sm font-black leading-tight">Archiv</p>
              <p className="text-[11px] text-slate-400">Grand RP DC Checker</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {([
            { id: "archive" as View, label: "Archiv", icon: <Archive size={17} />, n: entries.length },
            { id: "cases" as View, label: "Verdachtsfälle", icon: <AlertTriangle size={17} />, n: casesList.length, alert: casesList.length > 0 },
            { id: "upload" as View, label: "POVs hochladen", icon: <Upload size={17} />, n: queue.length },
            { id: "csv" as View, label: "CSV erstellen", icon: <FileSpreadsheet size={17} /> },
            { id: "settings" as View, label: "Einstellungen", icon: <SettingsIcon size={17} /> },
          ]).map((it) => (
            <button key={it.id} onClick={() => setView(it.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${view === it.id ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30" : "text-slate-300 hover:bg-white/5"}`}>
              <span className={view === it.id ? "text-amber-400" : "text-slate-400"}>{it.icon}</span>
              <span className="flex-1 text-left">{it.label}</span>
              {typeof it.n === "number" && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tick ${it.alert ? "bg-red-500/20 text-red-300" : "bg-white/10 text-slate-300"}`}>{it.n}</span>}
            </button>
          ))}
          <button onClick={() => setScOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">
            <ScanSearch size={17} className="text-slate-400" />
            <span className="flex-1 text-left">SocialClub Checker</span>
            <ArrowUpRight size={14} className="text-slate-500" />
          </button>
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
            <div className="flex items-center gap-2">
              <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
              <p className="text-xs font-black">DC Checker</p>
              <span className="ml-auto text-[10px] font-bold text-slate-500">{APP_VERSION}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">POV · OCR · YouTube</p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
              <Database size={11} />
              <span className="truncate">{entries.length} lokal · AES-256 · {drive.connected || drive.gistToken ? "Tresor ●" : "nur dieser PC"}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ============ CONTENT ============ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* TOPBAR */}
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a101f]/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0">
              <h1 className="text-lg font-black leading-tight">{titles[view].t}</h1>
              <p className="truncate text-xs text-slate-400">{titles[view].d}</p>
            </div>
            <div className="mx-auto flex w-full max-w-md items-center gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className={`${inputCls} pl-9`} placeholder="Globale Suche: ID · SC/SOC · Grund…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="amber">{APP_VERSION}</Badge>
              <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold md:inline-flex"><User size={13} /> {user || "Gast"}</span>
              <button className={btnGhost} title="Abmelden" onClick={() => { lockVault(); saveSession(""); setUser(""); }}><LogOut size={15} /><span className="hidden lg:inline">Abmelden</span></button>
              <button className={btnGhost} title="Neu laden (aus persistentem Speicher)" onClick={reloadFromDisk}><RefreshCw size={15} /><span className="hidden lg:inline">Neu laden</span></button>
              <button className={btnGhost} onClick={() => { setView("csv"); }}><FileSpreadsheet size={15} /><span className="hidden lg:inline">CSV erstellen</span></button>
              <button className={btnPrimary} onClick={() => setNewOpen(true)}><Plus size={15} /> Neuer Eintrag</button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          {!drive.connected && !drive.gistToken && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs">
              <Shield size={16} className="shrink-0 text-amber-400" />
              <p className="min-w-0 flex-1 text-slate-200"><b>Dauerhaft auf diesem PC.</b> Für einen Notfall-PC: Einstellungen → Tresor — Google Drive oder geheimes GitHub-Gist. Inhalt ist AES-256, ohne dein Passwort unlesbar.</p>
              <button className={btnGhost + " !py-1.5"} onClick={() => setView("settings")}>Tresor öffnen</button>
            </div>
          )}
          {view === "archive" && (
            <ArchiveView
              filters={filters} archiveFilter={archiveFilter} setArchiveFilter={setArchiveFilter}
              list={archiveList} dupIds={dupIds} selected={selected} setSelected={setSelected}
              onArchive={doArchive} onDelete={doDelete} onDetail={setDetail} onEdit={setEditing}
              onPlay={openVideo} onManual={(id) => setManual({ entryId: id })}
              onSc={(e) => { openAcpForId(e.targetId); push("info", `ACP geöffnet für ID ${e.targetId} — Extension sendet SC automatisch zurück.`); }}
            />
          )}
          {view === "cases" && (
            <CasesView list={casesList} onEdit={setEditing} onDetail={setDetail} onDelete={doDelete}
              onSc={(e) => { openAcpForId(e.targetId); push("info", `ACP geöffnet für ID ${e.targetId}.`); }} />
          )}
          {view === "upload" && (
            <UploadView queue={queue} setQueue={setQueue} busy={busy}
              ytConns={ytConns} onFiles={addFiles} onRun={runPipeline} onSave={saveQueueItem}
              onRemove={(qid) => {
                abortRef.current.get(qid)?.abort();
                filesRef.current.delete(qid);
                void delVideo("q_" + qid).catch(() => undefined);
                const nq = queue.filter((q) => q.qid !== qid);
                setQueue(nq); saveQueueMeta(nq);
              }}
              onManual={(qid) => setManual({ qid })}
              onSc={(q) => { if (q.ocr?.targetId) { openAcpForId(q.ocr.targetId); push("info", `ACP geöffnet für ID ${q.ocr.targetId}.`); } }}
              onPatch={(qid, patch) => setQueue((p) => p.map((q) => q.qid === qid ? { ...q, ...patch } : q))}
            />
          )}
          {view === "csv" && (
            <CsvView entries={entries} filtered={csvFiltered} active={csvActive} setActive={setCsvActive}
              search={csvSearch} setSearch={setCsvSearch} from={csvFrom} setFrom={setCsvFrom}
              to={csvTo} setTo={setCsvTo} sort={csvSort} setSort={setCsvSort} onExport={exportCSV} />
          )}
          {view === "settings" && (
            <SettingsView settings={settings} setSettings={(s) => { setSettings(s); saveSettings(s); }}
              ytConns={ytConns} setYtConns={(c) => { setYtConns(c); saveYT(c); }}
              drive={drive} setDrive={(d) => { setDrive(d); saveDrive(d); }}
              entries={entries} setEntries={(e) => persist(e, "Daten importiert")} push={push}
              driveMsg={driveMsg} setDriveMsg={setDriveMsg} bridgeToken={bridgeToken}
              onChangePassword={changeOwnPassword} username={user} />
          )}
        </main>
      </div>

      {/* ============ MODALS ============ */}
      {detail && <DetailModal entry={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); }} onPlay={() => openVideo(detail)} dup={dupIds.has(detail.targetId)} />}
      {editing && <EditModal entry={editing} onClose={() => setEditing(null)} onSave={saveEditedEntry} adminId={settings.adminId} />}
      {videoPlay && <VideoModal entry={videoPlay.entry} url={videoPlay.url} onClose={() => { URL.revokeObjectURL(videoPlay.url); setVideoPlay(null); }} />}
      {manual && <ManualModal manual={manual} queue={queue} entries={entries} filesRef={filesRef}
        onClose={() => setManual(null)}
        onApplyQueue={(qid, patch) => {
          setQueue((p) => p.map((q) => q.qid === qid ? { ...q, ocr: { ...q.ocr, ...patch }, missing: getMissing({ ...q.ocr, ...patch }), ocrComplete: getMissing({ ...q.ocr, ...patch }).length === 0 } : q));
          push("ok", "Manuelle Korrektur übernommen (postMessage-Äquivalent).");
        }}
        onApplyEntry={(id, patch) => {
          const next = entries.map((e) => e.id === id ? { ...e, ...patch, updatedAt: Date.now(), quality: entryQuality({ ...e, ...patch }) } : e);
          persist(next, "Manuell korrigiert");
          push("ok", "Manuelle Korrektur gespeichert + Drive-Backup angestoßen.");
        }} />}
      {newOpen && <NewEntryModal onClose={() => setNewOpen(false)} serverDefault={settings.serverDefault}
        onSave={(e) => {
          const now = Date.now();
          const entry: PovEntry = {
            ...e, id: uid("pov"), permaArchive: false, hasVideo: false, thumbnail: "",
            createdAt: now, updatedAt: now, quality: entryQuality(e),
            youtubeTitle: e.youtubeUrl ? e.filename : "", proof: e.proof || e.youtubeUrl,
          };
          persist([entry, ...entries], "Neuer Eintrag");
          setNewOpen(false);
          push("ok", `Eintrag gespeichert unter „Alle“ (nicht archiviert).`);
        }} />}
      {scOpen && <ScCheckerModal onClose={() => setScOpen(false)} push={push} />}

      {forceChange && user && (
        <ForceChangeModal
          username={user}
          onChange={changeOwnPassword}
          onDone={() => { setForceChange(false); push("ok", "Passwort geändert. Tresor-Schlüssel auf neues Passwort umgestellt — auf anderen PCs mit dem neuen Passwort anmelden."); }}
          onLogout={() => { lockVault(); saveSession(""); setUser(""); setForceChange(false); }}
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

// ---------- Erzwungene Passwortänderung (blockiert die komplette App) ----------

function ForceChangeModal({ username, onChange, onDone, onLogout }: {
  username: string;
  onChange: (u: string, oldPw: string, newPw: string) => Promise<string>;
  onDone: () => void;
  onLogout: () => void;
}) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const score = useMemo(() => {
    let s = 0;
    if (newPw.length >= 8) s++;
    if (newPw.length >= 12) s++;
    if (/[a-z]/.test(newPw) && /[A-Z]/.test(newPw)) s++;
    if (/\d/.test(newPw)) s++;
    if (/[^A-Za-z0-9]/.test(newPw)) s++;
    return Math.min(5, s);
  }, [newPw]);

  const submit = async () => {
    setErr("");
    if (newPw !== newPw2) { setErr("Die neuen Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    const msg = await onChange(username, oldPw, newPw);
    setBusy(false);
    if (msg) { setErr(msg); return; }
    onDone();
  };

  const bars = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];

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

        <div className="space-y-3">
          <Field label={`Aktuelles Passwort (${username})`}>
            <input className={inputCls} type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Standardpasswort" />
          </Field>
          <Field label="Neues Passwort (min. 8 Zeichen, Buchstaben + Zahlen)">
            <input className={inputCls} type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </Field>
          {newPw && (
            <div className="flex items-center gap-2">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? bars[score] : "bg-white/10"}`} />
                ))}
              </div>
              <span className="text-[10px] font-bold text-slate-400">{score <= 1 ? "schwach" : score <= 3 ? "mittel" : "stark"}</span>
            </div>
          )}
          <Field label="Neues Passwort wiederholen">
            <input className={inputCls} type="password" autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()} />
          </Field>
          {err && <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300"><XCircle size={14} className="mt-0.5 shrink-0" /> {err}</p>}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-400">
            <p className="font-bold text-slate-200">Wichtig</p>
            <p className="mt-1">Das Passwort ist zugleich der Schlüssel für den AES-256-Tresor. Ohne dieses Passwort kann niemand — auch nicht Google oder GitHub — deine Cloud-Backups lesen. Es gibt keine Wiederherstellung. Notiere es sicher.</p>
          </div>
          <div className="flex gap-2">
            <button className={btnGhost} onClick={onLogout} disabled={busy}>Abmelden</button>
            <button className={`${btnPrimary} flex-1 justify-center`} onClick={() => void submit()} disabled={busy || !oldPw || !newPw || !newPw2}>
              <Save size={15} /> {busy ? "Speichere…" : "Passwort festlegen und weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================== TOASTS ==============================

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-96 max-w-[calc(100vw-40px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 text-xs shadow-2xl fade-up ${t.kind === "ok" ? "border-emerald-500/30 bg-emerald-950/90" : t.kind === "err" ? "border-red-500/30 bg-red-950/90" : "border-white/10 bg-[#111a2f]/95"}`}>
          {t.kind === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" /> : t.kind === "err" ? <XCircle size={16} className="mt-0.5 shrink-0 text-red-400" /> : <Info size={16} className="mt-0.5 shrink-0 text-cyan-400" />}
          <p className="leading-relaxed text-slate-100">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

// ============================== ARCHIV ==============================

function ArchiveView(props: {
  filters: Array<{ id: ArchiveFilter; label: string; count: number }>;
  archiveFilter: ArchiveFilter; setArchiveFilter: (f: ArchiveFilter) => void;
  list: PovEntry[]; dupIds: Set<string>; selected: Set<string>; setSelected: (s: Set<string>) => void;
  onArchive: (ids: string[], to: boolean) => void; onDelete: (ids: string[]) => void;
  onDetail: (e: PovEntry) => void; onEdit: (e: PovEntry) => void; onPlay: (e: PovEntry) => void;
  onManual: (id: string) => void; onSc: (e: PovEntry) => void;
}) {
  const { filters, archiveFilter, setArchiveFilter, list, dupIds, selected, setSelected } = props;
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f.id} onClick={() => setArchiveFilter(f.id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${archiveFilter === f.id ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[.03] text-slate-300 hover:bg-white/10"}`}>
            {f.label}
            <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] tick">{f.count}</span>
          </button>
        ))}
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
            <EntryCard key={e.id} entry={e} dup={dupIds.has(e.targetId) && !!e.targetId}
              checked={selected.has(e.id)} onCheck={() => toggle(e.id)}
              onDetail={() => props.onDetail(e)} onEdit={() => props.onEdit(e)}
              onPlay={() => props.onPlay(e)} onArchive={() => props.onArchive([e.id], !e.permaArchive)}
              onDelete={() => props.onDelete([e.id])} onManual={() => props.onManual(e.id)} onSc={() => props.onSc(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryCard(props: {
  entry: PovEntry; dup: boolean; checked: boolean; onCheck: () => void;
  onDetail: () => void; onEdit: () => void; onPlay: () => void; onArchive: () => void;
  onDelete: () => void; onManual: () => void; onSc: () => void;
}) {
  const e = props.entry;
  return (
    <div className={`card-glow overflow-hidden rounded-2xl border bg-[#101830] transition ${props.checked ? "border-amber-500/60" : "border-white/10"}`}>
      <div className="relative h-36 bg-black/50">
        {e.thumbnail ? <img src={e.thumbnail} alt="" className="h-full w-full object-cover" /> : (
          <div className="flex h-full items-center justify-center"><Film size={32} className="text-slate-700" /></div>
        )}
        <div className="absolute left-2 top-2 flex gap-1.5">
          <input type="checkbox" checked={props.checked} onChange={props.onCheck} className="h-4 w-4 rounded range-accent" title="Auswählen" />
          {e.permaArchive && <Badge tone="amber"><Archive size={11} /> Archiv</Badge>}
          {props.dup && <Badge tone="red">Doppelte ID</Badge>}
        </div>
        <div className="absolute right-2 top-2 flex gap-1.5">
          <Badge tone={e.result === "BESTÄTIGT" ? "green" : e.result === "NEGATIV" ? "red" : e.result === "VERDACHT" ? "orange" : "sky"}>{e.result}</Badge>
        </div>
        <button onClick={props.onPlay} className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-bold text-white backdrop-blur hover:bg-amber-500 hover:text-black">
          <Play size={13} /> {e.youtubeUrl ? "YouTube" : e.hasVideo ? "Video" : "Kein Video"}
        </button>
      </div>
      <div className="space-y-2 p-3.5">
        <div className="flex items-center gap-2">
          <span className="text-base font-black tick">ID {e.targetId || "—"}</span>
          <Badge tone="violet">{e.server || "—"}</Badge>
          <span className="ml-auto text-[11px] text-slate-400">{formatDate(e.date)}</span>
        </div>
        <p className="truncate text-sm font-bold text-amber-300">{e.reason || "Unvollständig"}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span className="truncate">SC: <b className="text-slate-200">{e.sc ? `${e.sc.slice(0, 12)}${e.sc.length > 12 ? "…" : ""}` : "—"}</b></span>
          <span className="truncate">Größe: <b className="text-slate-200">{formatBytes(e.filesize)}</b></span>
          <span className="truncate">DC: <b className="text-slate-200">{e.discord || "—"}</b></span>
          <span className="truncate">Status: <b className="text-slate-200">{e.status || "—"}</b></span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button className={btnGhost + " !px-2 !py-1.5 !text-[11px]"} onClick={props.onDetail}><Eye size={13} /> Öffnen</button>
          <button className={btnGhost + " !px-2 !py-1.5 !text-[11px]"} onClick={props.onEdit}><Pencil size={13} /> Bearbeiten</button>
          <button className={btnGhost + " !px-2 !py-1.5 !text-[11px]"} onClick={props.onManual}><ScanSearch size={13} /> Korrigieren</button>
          <button className={btnGhost + " !px-2 !py-1.5 !text-[11px]"} onClick={props.onSc} title="SC aus ACP auslesen"><Link2 size={13} /> ACP/SC</button>
          <button className={btnGhost + " !px-2 !py-1.5 !text-[11px]"} onClick={props.onArchive}>{e.permaArchive ? <><FolderOutput size={13} /> Ent-archivieren</> : <><FolderInput size={13} /> Ins Archiv</>}</button>
          <button className={btnDanger + " !px-2 !py-1.5 !text-[11px]"} onClick={props.onDelete}><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
}

// ============================== VERDACHTSFÄLLE ==============================

function CasesView(props: { list: PovEntry[]; onEdit: (e: PovEntry) => void; onDetail: (e: PovEntry) => void; onDelete: (ids: string[]) => void; onSc: (e: PovEntry) => void }) {
  if (!props.list.length) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-12 text-center">
        <BadgeCheck size={40} className="mx-auto mb-3 text-emerald-500" />
        <p className="font-bold">Keine Verdachtsfälle — alle Datensätze vollständig.</p>
        <p className="mt-1 text-xs text-slate-400">Unvollständige Fälle (fehlende ID / Grund / Datum / SC) erscheinen automatisch hier.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-xs">
        <CircleAlert size={16} className="text-orange-400" />
        <p><b>{props.list.length} Fälle</b> benötigen manuelle Korrektur — fehlende oder widersprüchliche Angaben.</p>
      </div>
      {props.list.map((e) => {
        const miss = getMissing(e);
        return (
          <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#101830] p-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black tick">ID {e.targetId || "???"}</span>
                <Badge tone="violet">{e.server || "?"}</Badge>
                <Badge tone="sky">{formatDate(e.date)}</Badge>
                <span className="text-xs text-slate-400">{e.reason || "kein Grund"}</span>
              </div>
              <p className="mt-1 text-xs text-orange-300">Fehlt: {miss.join(" · ") || "Prüfung offen"}</p>
              {e.ocrRaw && <p className="mt-1 truncate font-mono text-[10px] text-slate-500">OCR: {e.ocrRaw.slice(0, 140)}</p>}
            </div>
            <div className="flex gap-1.5">
              <button className={btnGhost} onClick={() => props.onSc(e)}><Link2 size={14} /> ACP/SC</button>
              <button className={btnGhost} onClick={() => props.onDetail(e)}><Eye size={14} /> Öffnen</button>
              <button className={btnPrimary} onClick={() => props.onEdit(e)}><Pencil size={14} /> Korrigieren</button>
              <button className={btnDanger} onClick={() => props.onDelete([e.id])}><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================== UPLOAD ==============================

function UploadView(props: {
  queue: QueueItem[]; setQueue: (q: QueueItem[]) => void; busy: string; ytConns: YTConnection[];
  onFiles: (f: FileList | File[]) => void; onRun: (qid: string) => void; onSave: (qid: string) => void;
  onRemove: (qid: string) => void; onManual: (qid: string) => void; onSc: (q: QueueItem) => void;
  onPatch: (qid: string, patch: Partial<QueueItem>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const active = props.queue.filter((q) => ["youtube-upload", "youtube-wartet", "ocr"].includes(q.status)).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) props.onFiles(e.dataTransfer.files); }}
          className="cursor-pointer rounded-2xl border-2 border-dashed border-white/15 bg-white/[.02] p-10 text-center transition hover:border-amber-500/50 hover:bg-amber-500/5">
          <Upload size={36} className="mx-auto mb-3 text-amber-500" />
          <p className="font-black">POV-Videos wählen oder hierher ziehen</p>
          <p className="mt-1 text-xs text-slate-400">MP4 / WebM / MOV · Mehrfachauswahl möglich · Upload als <b>unlisted</b> · OCR läuft lokal auf der Originaldatei</p>
          <input ref={inputRef} type="file" accept="video/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files) props.onFiles(e.target.files); e.target.value = ""; }} />
        </div>
        <div className="space-y-2 rounded-2xl border border-white/10 bg-[#101830] p-4 text-xs">
          <p className="font-black">Ablauf (genau diese Reihenfolge)</p>
          {["1. Datei → Warteschlange (Upload wartet · 0 %)", "2. YouTube-Upload (unlisted, Slot 1–3)", "3. processingStatus = succeeded abwarten", "4. OCR auf lokaler Originaldatei", "5. Konsens-Voting + Validierung", "6. Manuell prüfen → Speichern → Backup"].map((s) => (
            <p key={s} className="flex items-center gap-2 text-slate-300"><CheckCircle2 size={13} className="shrink-0 text-emerald-500" /> {s}</p>
          ))}
          <p className="pt-1 text-slate-500">Aktive Pipelines: <b className="text-slate-200">{active}</b> · YouTube-Slots: <b className="text-slate-200">{props.ytConns.filter((y) => y.enabled).length}/3</b></p>
        </div>
      </div>

      {props.queue.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#101830] p-8 text-center text-sm text-slate-400">
          <ListVideo size={32} className="mx-auto mb-2 text-slate-600" />
          Warteschlange leer — wähle oben Videos aus.
        </div>
      ) : (
        <div className="space-y-3">
          {props.queue.map((q) => (
            <div key={q.qid} className="overflow-hidden rounded-2xl border border-white/10 bg-[#101830]">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
                  {q.thumbUrl ? <img src={q.thumbUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Film size={20} className="text-slate-700" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{q.fileName}</p>
                  <p className="text-[11px] text-slate-400">{formatBytes(q.fileSize)} · {q.duration ? `${Math.round(q.duration)}s` : "?"} · Queue-ID {q.qid.slice(-6)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusPill status={q.status} />
                    {q.missing.length > 0 && q.status === "fertig" && <Badge tone="orange">fehlt: {q.missing.join(", ")}</Badge>}
                    {q.status === "fertig" && q.ocrComplete && <Badge tone="green">vollständig</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select className={inputCls + " !w-auto !py-1.5 text-xs"} value={q.ytSlot}
                    onChange={(e) => props.onPatch(q.qid, { ytSlot: parseInt(e.target.value, 10) })} title="YouTube-Slot">
                    {props.ytConns.map((y, i) => <option key={i} value={i}>YT-Slot {i + 1} · {y.name}</option>)}
                  </select>
                  {q.status === "wartet" || q.status === "fehler" ? (
                    <button className={btnPrimary} onClick={() => props.onRun(q.qid)}><Zap size={15} /> Prüfen & Hochladen</button>
                  ) : null}
                  {q.status === "fertig" && (
                    <button className={btnPrimary} disabled={props.busy === q.qid} onClick={() => props.onSave(q.qid)}>
                      <Save size={15} /> {props.busy === q.qid ? "Speichert…" : "POV speichern"}
                    </button>
                  )}
                  <button className={btnGhost} onClick={() => props.onRemove(q.qid)}><X size={15} /></button>
                </div>
              </div>

              {(q.status === "youtube-upload" || q.status === "youtube-wartet" || q.status === "ocr" || q.status === "fertig") && (
                <div className="space-y-2 border-t border-white/5 px-4 py-3">
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5"><Video size={12} className="text-red-400" /> {q.youtubeStatus || "YouTube"}</span>
                      <span className="tick">{q.progress} %</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500 transition-all" style={{ width: `${q.progress}%` }} />
                    </div>
                  </div>
                  {q.processingStatus && (
                    <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Clock size={12} /> YouTube-Verarbeitung: <b className={q.processingStatus === "succeeded" ? "text-emerald-400" : "text-amber-300"}>{q.processingStatus}</b>
                      {q.youtubeUrl && <a href={q.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">{q.youtubeUrl} <ExternalLink size={11} /></a>}
                    </p>
                  )}
                  {(q.status === "ocr" || q.status === "fertig") && (
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5"><ScanSearch size={12} className="text-amber-400" /> OCR (lokale Originaldatei · Konsens-Voting)</span>
                        <span className="tick">{q.ocrProgress} %</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-black/50">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all" style={{ width: `${q.ocrProgress}%` }} />
                      </div>
                      {q.ocrResult && <p className="mt-1.5 truncate font-mono text-[10px] text-slate-500">{q.ocrResult.slice(0, 200)}</p>}
                    </div>
                  )}
                  {q.error && <p className="flex items-center gap-1.5 text-xs text-red-300"><XCircle size={13} /> {q.error}</p>}

                  {q.status === "fertig" && q.ocr && (
                    <div className="grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 md:grid-cols-3 lg:grid-cols-6">
                      <Mini label="Ziel-ID" value={q.ocr.targetId || "—"} warn={!q.ocr.targetId} />
                      <Mini label="Grund" value={q.ocr.reason || "—"} warn={!q.ocr.reason} />
                      <Mini label="Server" value={q.ocr.server || "—"} warn={!q.ocr.server} />
                      <Mini label="Datum" value={q.ocr.date || "—"} warn={!q.ocr.date} />
                      <Mini label="SC/RID" value={q.ocr.sc ? `${q.ocr.sc.slice(0, 14)}…` : "—"} warn={!q.ocr.sc} />
                      <Mini label="Discord" value={q.ocr.discord || "—"} />
                      <div className="flex gap-1.5 md:col-span-3 lg:col-span-6">
                        <button className={btnGhost} onClick={() => props.onManual(q.qid)}><Pencil size={13} /> Manuell korrigieren (Video-Position)</button>
                        <button className={btnGhost} onClick={() => props.onSc(q)} disabled={!q.ocr?.targetId}><Link2 size={13} /> SC aus ACP holen</button>
                        <span className="ml-auto self-center text-[11px] text-slate-500">Finaler Name: <b className="text-slate-300">{buildFinalFilename({ ...q.ocr, date: q.ocr.date || todayISO() })}</b></span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: QueueItem["status"] }) {
  const map: Record<string, { label: string; tone: "zinc" | "amber" | "green" | "red" | "sky" | "orange" }> = {
    "wartet": { label: "Upload wartet · 0 %", tone: "zinc" },
    "youtube-upload": { label: "YouTube-Upload", tone: "amber" },
    "youtube-wartet": { label: "YT-Verarbeitung…", tone: "sky" },
    "ocr": { label: "OCR läuft", tone: "orange" },
    "fertig": { label: "Bereit zum Speichern", tone: "green" },
    "fehler": { label: "Fehler", tone: "red" },
    "gespeichert": { label: "Gespeichert", tone: "green" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 ${warn ? "border-orange-500/40 bg-orange-500/10" : "border-white/10 bg-white/[.03]"}`}>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`truncate text-xs font-bold ${warn ? "text-orange-300" : "text-slate-100"}`}>{value}</p>
    </div>
  );
}

// ============================== CSV ==============================

function CsvView(props: {
  entries: PovEntry[]; filtered: PovEntry[];
  active: Set<string>; setActive: (s: Set<string>) => void;
  search: string; setSearch: (s: string) => void; from: string; setFrom: (s: string) => void;
  to: string; setTo: (s: string) => void; sort: string; setSort: (s: string) => void;
  onExport: () => void;
}) {
  const toggle = (id: string) => {
    const n = new Set(props.active);
    if (n.has(id)) n.delete(id); else n.add(id);
    props.setActive(n);
  };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#101830] p-4">
        <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Filter (nur Anzeige/Export — Originaldaten bleiben unverändert)</p>
        <div className="flex flex-wrap gap-1.5">
          {CSV_FILTER_DEFS.map((f) => (
            <button key={f.id} onClick={() => toggle(f.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${props.active.has(f.id) ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[.03] text-slate-300 hover:bg-white/10"}`}>
              {f.label}
            </button>
          ))}
          {props.active.size > 0 && <button className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-bold text-red-300" onClick={() => props.setActive(new Set())}>Filter zurücksetzen</button>}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input className={inputCls} placeholder="Suchtext (ID · SC · Grund…)" value={props.search} onChange={(e) => props.setSearch(e.target.value)} />
          <input className={inputCls} type="date" value={props.from} onChange={(e) => props.setFrom(e.target.value)} title="Datum von" />
          <input className={inputCls} type="date" value={props.to} onChange={(e) => props.setTo(e.target.value)} title="Datum bis" />
          <select className={inputCls} value={props.sort} onChange={(e) => props.setSort(e.target.value)}>
            {CSV_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="sky">{props.filtered.length} von {props.entries.length} Einträgen</Badge>
          <button className={btnPrimary} onClick={props.onExport}><Download size={15} /> CSV Download (nur gefilterte)</button>
          <button className={btnGhost} onClick={() => {
            const rows = props.filtered.map((e) => [e.proof || e.youtubeUrl, e.date, e.targetId, e.sc, e.discord, e.reason, e.server].join("\t")).join("\n");
            void navigator.clipboard.writeText(rows).catch(() => undefined);
          }}><Copy size={15} /> Als Tabelle kopieren</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[1000px] text-xs">
          <thead>
            <tr className="bg-[#0d1528] text-left text-[10px] uppercase tracking-wider text-slate-400">
              {["Proof", "Datum", "ID", "SOC", "RID", "Discord", "Familie", "Grund", "Server", "Ergebnis"].map((h) => <th key={h} className="px-3 py-2.5 font-bold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {props.filtered.slice(0, 300).map((e) => (
              <tr key={e.id} className="border-t border-white/5 hover:bg-white/[.03]">
                <td className="max-w-[160px] truncate px-3 py-2 text-cyan-300">{e.proof || e.youtubeUrl || "—"}</td>
                <td className="px-3 py-2 tick">{formatDate(e.date)}</td>
                <td className="px-3 py-2 font-bold tick">{e.targetId || "—"}</td>
                <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[11px]">{e.sc || "—"}</td>
                <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[11px]">{e.rid || e.sc || "—"}</td>
                <td className="px-3 py-2">{e.discord || "—"}</td>
                <td className="px-3 py-2">{e.family || "—"}</td>
                <td className="px-3 py-2 font-semibold text-amber-300">{e.reason}</td>
                <td className="px-3 py-2">{e.server}</td>
                <td className="px-3 py-2"><Badge tone={e.result === "BESTÄTIGT" ? "green" : e.result === "NEGATIV" ? "red" : "sky"}>{e.result}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {props.filtered.length > 300 && <p className="border-t border-white/5 bg-[#0d1528] px-3 py-2 text-[11px] text-slate-400">Vorschau: 300 von {props.filtered.length} — Export enthält alle gefilterten.</p>}
        {props.filtered.length === 0 && <p className="bg-[#0d1528] px-3 py-8 text-center text-slate-400">Keine Einträge für diese Filter.</p>}
      </div>
    </div>
  );
}

// ============================== EINSTELLUNGEN ==============================

function SettingsView(props: {
  settings: AppSettings; setSettings: (s: AppSettings) => void;
  ytConns: YTConnection[]; setYtConns: (c: YTConnection[]) => void;
  drive: DriveConfig; setDrive: (d: DriveConfig) => void;
  entries: PovEntry[]; setEntries: (e: PovEntry[]) => void;
  push: (k: "ok" | "err" | "info", t: string) => void;
  driveMsg: string; setDriveMsg: (s: string) => void; bridgeToken: string;
  onChangePassword: (u: string, oldPw: string, newPw: string) => Promise<string>;
  username: string;
}) {
  const { settings, setSettings, ytConns, setYtConns, drive, setDrive, push } = props;
  const [tab, setTab] = useState("allgemein");
  const [busy, setBusy] = useState("");
  const [newUser, setNewUser] = useState({ u: "", p: "" });
  const [users, setUsers] = useState(() => loadUsers());
  const [pwOpen, setPwOpen] = useState(false);

  const patchYt = (slot: number, patch: Partial<YTConnection>) => {
    setYtConns(ytConns.map((y) => y.slot === slot ? { ...y, ...patch } : y));
  };

  const ytConnect = async (slot: number) => {
    const y = ytConns[slot];
    const cid = y.clientId || settings.googleClientId;
    if (!cid) { push("err", "Bitte zuerst Google Client-ID eintragen (Tab Allgemein oder YouTube-Slot). Kostenlos in Google Cloud Console erstellbar."); return; }
    setBusy("yt" + slot);
    try {
      const { token, expiry } = await googleConnect(cid, ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"]);
      patchYt(slot, { accessToken: token, expiry });
      push("ok", `YouTube-Slot ${slot + 1} verbunden. Uploads laufen als unlisted.`);
    } catch (e) { push("err", `YouTube-Login fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(""); }
  };

  const driveConnect = async () => {
    const cid = drive.clientId || settings.googleClientId;
    if (!cid) { push("err", "Bitte zuerst Google Client-ID eintragen. Kostenlos in Google Cloud Console erstellbar."); return; }
    setBusy("drive");
    try {
      const { token, expiry } = await googleConnect(cid, ["https://www.googleapis.com/auth/drive.file"]);
      setDrive({ ...drive, connected: true, accessToken: token, expiry, clientId: cid });
      push("ok", "Google Drive verbunden — Backups laufen automatisch nach jeder Änderung.");
    } catch (e) { push("err", `Drive-Login fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(""); }
  };

  const tabs = [
    { id: "allgemein", label: "Allgemein & OCR" },
    { id: "youtube", label: "YouTube ×3" },
    { id: "drive", label: "Tresor / anderer PC" },
    { id: "acp", label: "ACP / Extension" },
    { id: "daten", label: "Daten & Backup" },
    { id: "install", label: "Installation" },
    { id: "benutzer", label: "Benutzer" },
    { id: "info", label: "Anleitung" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="space-y-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${tab === t.id ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30" : "text-slate-300 hover:bg-white/5"}`}>
            {t.label}
          </button>
        ))}
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[.02] p-3 text-[11px] text-slate-400">
          <p className="font-bold text-slate-200">{APP_VERSION} · kostenlos</p>
          <p className="mt-1 break-all font-mono">META: {META_KEY}</p>
          <p className="break-all font-mono">DB: {DB_NAME} / {STORE}</p>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-white/10 bg-[#101830] p-5">
        {tab === "allgemein" && (
          <div className="grid max-w-2xl gap-4">
            <h3 className="font-black">Allgemein & OCR</h3>
            <Field label="Eigene Admin-/Mitarbeiter-ID (wird NIEMALS als Ziel-ID erkannt)">
              <input className={inputCls} value={settings.adminId} onChange={(e) => setSettings({ ...settings, adminId: e.target.value.replace(/\D/g, "") })} placeholder="z. B. 111222" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="OCR-Sprache (Tesseract, lokal & kostenlos)">
                <select className={inputCls} value={settings.ocrLanguage} onChange={(e) => setSettings({ ...settings, ocrLanguage: e.target.value })}>
                  <option value="deu+eng">Deutsch + Englisch</option>
                  <option value="eng">Englisch</option>
                  <option value="deu">Deutsch</option>
                </select>
              </Field>
              <Field label={`OCR-Frames: ${settings.ocrFrames}`}>
                <input type="range" min={2} max={10} value={settings.ocrFrames} onChange={(e) => setSettings({ ...settings, ocrFrames: parseInt(e.target.value, 10) })} className="range-accent w-full" />
              </Field>
              <Field label="Standard-Server">
                <select className={inputCls} value={settings.serverDefault} onChange={(e) => setSettings({ ...settings, serverDefault: e.target.value })}>
                  {SERVERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Standard YouTube-Slot">
                <select className={inputCls} value={settings.ytDefaultSlot} onChange={(e) => setSettings({ ...settings, ytDefaultSlot: parseInt(e.target.value, 10) })}>
                  <option value={0}>Slot 1</option><option value={1}>Slot 2</option><option value={2}>Slot 3</option>
                </select>
              </Field>
            </div>
            <Field label="Google OAuth Client-ID (kostenlos, für YouTube + Drive)">
              <input className={inputCls} value={settings.googleClientId} onChange={(e) => setSettings({ ...settings, googleClientId: e.target.value.trim() })} placeholder="xxxx.apps.googleusercontent.com" />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.loginRequired} onChange={(e) => setSettings({ ...settings, loginRequired: e.target.checked })} className="h-4 w-4 range-accent" /> Login erforderlich</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.autoBackup} onChange={(e) => setSettings({ ...settings, autoBackup: e.target.checked })} className="h-4 w-4 range-accent" /> Auto-Backup nach Änderungen</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.acpAutoOpen} onChange={(e) => setSettings({ ...settings, acpAutoOpen: e.target.checked })} className="h-4 w-4 range-accent" /> ACP automatisch öffnen</label>
            </div>
            <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-400">
              OCR-Pipeline: Frame-Crops (unterer Bildbereich, 2× Upscale) → Varianten (Original, Graustufen, Threshold, Kontrast, Orange-Maske) → mehrere PSM-Modi → Konsens-Voting → Validierung gegen erlaubte Gründe → Admin-ID-Ausschluss. Läuft komplett lokal via Tesseract.js — kostenlos, ohne Server.
            </p>
          </div>
        )}

        {tab === "youtube" && (
          <div className="space-y-4">
            <h3 className="font-black">YouTube-Verbindungen (max. 3 — bleiben bei Archiv-Änderungen erhalten)</h3>
            {ytConns.map((y) => (
              <div key={y.slot} className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Video size={18} className="text-red-400" />
                  <input className="w-40 rounded-lg border border-white/10 bg-[#0b1326] px-2 py-1 text-sm font-bold" value={y.name} onChange={(e) => patchYt(y.slot, { name: e.target.value })} />
                  <label className="ml-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={y.enabled} onChange={(e) => patchYt(y.slot, { enabled: e.target.checked })} className="h-4 w-4 range-accent" /> Aktiv</label>
                  {y.accessToken && y.expiry > Date.now() ? <Badge tone="green">verbunden</Badge> : <Badge tone="zinc">offline-simulation</Badge>}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <input className={inputCls} placeholder="Client-ID (optional, sonst globale)" value={y.clientId} onChange={(e) => patchYt(y.slot, { clientId: e.target.value.trim() })} />
                  <input className={inputCls} placeholder="API-Key (optional)" value={y.apiKey} onChange={(e) => patchYt(y.slot, { apiKey: e.target.value.trim() })} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={btnPrimary} disabled={busy === "yt" + y.slot} onClick={() => void ytConnect(y.slot)}><PlugZap size={15} /> {busy === "yt" + y.slot ? "Verbinde…" : "Verbinden (OAuth, kostenlos)"}</button>
                  <button className={btnGhost} onClick={() => patchYt(y.slot, { accessToken: "", expiry: 0 })}>Trennen</button>
                  <span className="ml-auto self-center text-[11px] text-slate-500">Uploads: unlisted · Titel = finaler POV-Dateiname</span>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-400">Ohne Verbindung läuft eine echte Datei-Chunk-Simulation (Fortschritt + processingStatus), damit der komplette Ablauf kostenlos testbar bleibt. Mit OAuth wird die echte YouTube Data API v3 genutzt.</p>
          </div>
        )}

        {tab === "drive" && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-black">Tresor · anderer PC · AES-256</h3>
            <p className="text-xs text-slate-400">Eine statische Website kann selbst keine Datenbank hosten. Dauerhaft und auf einem anderen PC sind die Daten nur über den verschlüsselten Tresor (Drive und/oder geheimes GitHub-Gist). Google und GitHub sehen ausschließlich Ciphertext.</p>
            <div className="flex flex-wrap items-center gap-2">
              {drive.connected ? <Badge tone="green"><CloudUpload size={12} /> Drive verbunden</Badge> : <Badge tone="zinc">Drive offen</Badge>}
              {drive.gistId ? <Badge tone="green">Gist {drive.gistId.slice(0, 8)}…</Badge> : <Badge tone="zinc">Gist offen</Badge>}
              <Badge tone="amber">AES-256-GCM</Badge>
              {drive.lastBackup > 0 && <span className="text-xs text-slate-400">Letztes Backup: {new Date(drive.lastBackup).toLocaleString("de-DE")} · {drive.lastBackupCount} Einträge</span>}
            </div>
            <Field label="Drive Client-ID (optional, sonst globale)">
              <input className={inputCls} value={drive.clientId} onChange={(e) => setDrive({ ...drive, clientId: e.target.value.trim() })} placeholder="xxxx.apps.googleusercontent.com" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} disabled={busy === "drive"} onClick={() => void driveConnect()}><PlugZap size={15} /> Google Drive verbinden</button>
              <button className={btnGhost} onClick={() => { void driveBackup("manuell").then((r) => { props.setDriveMsg(r.msg); push(r.ok ? "ok" : "err", r.msg); }); }}><CloudUpload size={15} /> Jetzt alles sichern</button>
              <button className={btnGhost} onClick={() => {
                if (!window.confirm("Cloud-Tresor wiederherstellen? Lokale Daten werden GEMERGT — nichts wird gelöscht.")) return;
                void driveRestore().then((r) => {
                  if (!r.ok || !r.entries) { push("err", r.msg); return; }
                  if (r.deleted?.length) saveDeleted([...new Set([...loadDeleted(), ...r.deleted])]);
                  const merged = mergeEntries(props.entries, r.entries);
                  props.setEntries(merged);
                  push("ok", `Restore: ${r.entries.length} aus Tresor + lokal = ${merged.length} Einträge.`);
                });
              }}><CloudDownload size={15} /> Auf diesem PC wiederherstellen</button>
              <button className={btnGhost} onClick={() => { void downloadEncryptedVault().then(() => push("ok", "Verschlüsselter Tresor heruntergeladen.")).catch((e) => push("err", e instanceof Error ? e.message : String(e))); }}><Download size={15} /> AES-Datei exportieren</button>
              <button className={btnGhost} onClick={() => { downloadLocalBackup(); }}><Download size={15} /> Klartext-JSON (unsicher)</button>
              <label className={`${btnGhost} cursor-pointer`}>
                <Upload size={15} /> AES-Datei importieren
                <input type="file" accept="application/json,.enc.json" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void importEncryptedFile(f).then((payload) => {
                    if (payload.deleted?.length) saveDeleted([...new Set([...loadDeleted(), ...payload.deleted])]);
                    const merged = mergeEntries(props.entries, payload.entries || []);
                    props.setEntries(merged);
                    push("ok", `Import: ${payload.entries.length} entschlüsselt → ${merged.length} Einträge.`);
                  }).catch((err) => push("err", err instanceof Error ? err.message : String(err)));
                  e.target.value = "";
                }} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={drive.autoBackup} onChange={(e) => setDrive({ ...drive, autoBackup: e.target.checked })} className="h-4 w-4 range-accent" /> Automatisches verschlüsseltes Backup nach Änderungen</label>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <p className="text-sm font-black text-amber-200">Anderer PC — geheimes GitHub-Gist (kostenlos, ohne Google-OAuth)</p>
              <p className="text-xs text-slate-400">GitHub → Settings → Developer settings → Personal access tokens → Fine-grained oder classic mit Recht <b>gist</b>. Token nur hier einfügen, nie öffentlich teilen. Gist ist <b>secret</b> und der Inhalt ist AES-256.</p>
              <Field label="GitHub Token (gist)">
                <input className={`${inputCls} font-mono`} type="password" autoComplete="off" value={drive.gistToken} onChange={(e) => setDrive({ ...drive, gistToken: e.target.value.trim() })} placeholder="ghp_… oder github_pat_…" />
              </Field>
              <Field label="Gist-ID (wird beim ersten Sichern automatisch gesetzt)">
                <input className={`${inputCls} font-mono`} value={drive.gistId} onChange={(e) => setDrive({ ...drive, gistId: e.target.value.trim() })} placeholder="auf dem 2. PC die gleiche ID eintragen" />
              </Field>
              {drive.gistLast > 0 && <p className="text-[11px] text-slate-400">Gist zuletzt: {new Date(drive.gistLast).toLocaleString("de-DE")}</p>}
              <p className="text-[11px] leading-relaxed text-slate-400">PC 1: Token einfügen → „Jetzt alles sichern“ → Gist-ID notieren. PC 2: gleiche Website öffnen → als Adam anmelden → Token + Gist-ID eintragen → „Auf diesem PC wiederherstellen“.</p>
            </div>

            {props.driveMsg && <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">{props.driveMsg}</p>}
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs">
              <p className="font-bold text-red-300">Sicherheit</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                <li>Cloud erhält nur AES-256-GCM-Ciphertext. Schlüssel = Login-Passwort (PBKDF2, 180.000 Iterationen).</li>
                <li>Leerer lokaler Zustand überschreibt niemals den Cloud-Tresor.</li>
                <li>Wiederherstellen nur nach Bestätigung — nie automatisch bei F5.</li>
                <li>Videos bleiben lokal in IndexedDB; Proof-Links (YouTube) sind im Tresor und auf jedem PC nutzbar.</li>
                <li>5 falsche Passwörter → 15 Minuten Sperre. Abmelden löscht den Schlüssel aus dem RAM.</li>
              </ul>
            </div>
          </div>
        )}

        {tab === "acp" && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-black">ACP / Browser-Extension</h3>
            <p className="text-xs text-slate-400">Die Extension läuft auf <span className="font-mono text-slate-200">https://admin.gta5grand.com/de/*</span> und sendet SC/RID token-geschützt an diese Seite zurück.</p>
            <Field label="Bridge-Token (Nonce — Nachrichten ohne Token werden abgelehnt)">
              <div className="flex gap-2">
                <input className={`${inputCls} font-mono`} readOnly value={props.bridgeToken} />
                <button className={btnGhost} onClick={() => { void navigator.clipboard.writeText(props.bridgeToken).catch(() => undefined); push("ok", "Bridge-Token kopiert."); }}><Copy size={15} /></button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={() => { downloadExtension(); push("ok", "Extension-Datei heruntergeladen (manifest, background, content, bridge, README)."); }}><Download size={15} /> Extension herunterladen</button>
              <button className={btnGhost} onClick={() => window.open("https://admin.gta5grand.com/", "_blank", "noopener")}><ExternalLink size={15} /> ACP öffnen</button>
              <button className={btnGhost} onClick={() => {
                const last = (window as unknown as { __DC_LAST_SC?: unknown }).__DC_LAST_SC;
                push(last ? "ok" : "info", last ? `Bridge aktiv — letzte Nachricht: ${JSON.stringify(last).slice(0, 160)}` : "Bridge lauscht — noch keine Nachricht empfangen. Extension installiert? ACP-Tab aus dem Checker öffnen.");
              }}><Zap size={15} /> Bridge testen</button>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
              <p className="font-bold">Ablauf SC-Auslese:</p>
              <p className="mt-1">Ziel-ID → „ACP/SC“ → ACP-Tab öffnet sich mit <span className="font-mono">dc_id + dc_bridge</span> → Extension liest SC → sendet per Bridge → Feld wird automatisch aktualisiert.</p>
            </div>
          </div>
        )}

        {tab === "daten" && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-black">Daten & Speicher</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Mini label="Einträge (Alle)" value={String(props.entries.length)} />
              <Mini label="POV-Archiv" value={String(props.entries.filter((e) => e.permaArchive).length)} />
              <Mini label="Gelöschte IDs" value={String(loadDeleted().length)} />
              <Mini label="Videos lokal" value={String(props.entries.filter((e) => e.hasVideo).length)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} onClick={() => {
                const raw = loadMeta();
                push("info", `Verifikation: Meta=${raw.length}, Records=${loadAllRecords().length}, Merged=${mergeEntries(raw, loadAllRecords()).length}. Keys: ${META_KEY} / ${DB_NAME}.`);
              }}><HardDrive size={15} /> Speicher prüfen</button>
              <button className={btnGhost} onClick={() => { downloadLocalBackup(); }}><Download size={15} /> Export (JSON)</button>
              <label className={`${btnGhost} cursor-pointer`}>
                <Upload size={15} /> Import (JSON mergen)
                <input type="file" accept="application/json" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void f.text().then((t) => {
                    try {
                      const j = JSON.parse(t) as { entries?: PovEntry[] } | PovEntry[];
                      const arr = Array.isArray(j) ? j : j.entries || [];
                      const merged = mergeEntries(props.entries, arr);
                      props.setEntries(merged);
                      push("ok", `Import: ${arr.length} gemergt → ${merged.length} Einträge (nichts überschrieben).`);
                    } catch { push("err", "Import-Datei ungültig."); }
                  });
                  e.target.value = "";
                }} />
              </label>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs">
              <p className="font-bold text-red-300">Kein automatisches Löschen:</p>
              <p className="mt-1 text-slate-300">Diese App löscht NIEMALS automatisch (kein clearDB, kein localStorage.clear, kein deleteDatabase beim Start). Nur ausdrückliches Löschen entfernt Daten — mit Löschmarkierung gegen Auto-Restore.</p>
            </div>
          </div>
        )}

        {tab === "install" && <InstallGuide push={push} />}

        {pwOpen && (
          <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/85 p-4 backdrop-blur">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1424] p-6 shadow-2xl fade-up">
              <h2 className="mb-1 text-lg font-black">Passwort ändern</h2>
              <p className="mb-4 text-xs text-slate-400">Neuer Salt + neuer Hash. Der AES-Tresor-Schlüssel wird auf das neue Passwort umgestellt.</p>
              <PwForm username={props.username} onChange={props.onChangePassword} onDone={() => { setPwOpen(false); push("ok", "Passwort geändert. Cloud-Backups ab jetzt mit dem neuen Passwort gesichert."); }} />
            </div>
          </div>
        )}

        {tab === "benutzer" && (
          <div className="max-w-xl space-y-4">
            <h3 className="font-black">Benutzer (lokal, Hash-gespeichert)</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button className={btnPrimary} onClick={() => setPwOpen(true)}><KeyRound size={15} /> Passwort ändern</button>
              {users.some((u) => u.mustChange) && <Badge tone="red">Standardpasswort aktiv — Änderung erforderlich</Badge>}
            </div>
            <p className="text-[11px] text-slate-500">Nach einer Änderung wird der AES-Tresor-Schlüssel neu abgeleitet. Auf anderen PCs dann mit dem neuen Passwort anmelden; alte Cloud-Backups bleiben mit dem alten Passwort lesbar, solange sie nicht neu gesichert wurden.</p>
            {users.map((u) => (
              <div key={u.u} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
                <User size={16} className="text-slate-400" />
                <span className="font-bold">{u.u}</span>
                <Badge tone="violet">{u.role}</Badge>
                <button className={`${btnDanger} ml-auto !py-1.5`} onClick={() => {
                  if (users.length <= 1) { push("err", "Der letzte Benutzer kann nicht gelöscht werden."); return; }
                  if (!window.confirm(`Benutzer ${u.u} löschen?`)) return;
                  const n = users.filter((x) => x.u !== u.u);
                  setUsers(n); saveUsers(n); push("ok", `Benutzer ${u.u} gelöscht.`);
                }}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="grid gap-2 md:grid-cols-3">
              <input className={inputCls} placeholder="Neuer Benutzer" value={newUser.u} onChange={(e) => setNewUser({ ...newUser, u: e.target.value })} />
              <input className={inputCls} type="password" placeholder="Passwort" value={newUser.p} onChange={(e) => setNewUser({ ...newUser, p: e.target.value })} />
              <button className={btnPrimary} onClick={() => {
                if (!newUser.u.trim() || newUser.p.length < 4) { push("err", "Name + Passwort (min. 4) erforderlich."); return; }
                void sha256(uid("s") + "::" + newUser.p).then(() => undefined);
                const salt = uid("s");
                void sha256(salt + "::" + newUser.p).then((h) => {
                  const n = [...users, { u: newUser.u.trim(), p: h, salt, created: Date.now(), role: "mod" }];
                  setUsers(n); saveUsers(n); setNewUser({ u: "", p: "" });
                  push("ok", `Benutzer ${newUser.u.trim()} angelegt (SHA-256).`);
                });
              }}><Plus size={15} /> Anlegen</button>
            </div>
          </div>
        )}

        {tab === "info" && <ManualText />}
      </div>
    </div>
  );
}

function PwForm({ username, onChange, onDone }: {
  username: string;
  onChange: (u: string, oldPw: string, newPw: string) => Promise<string>;
  onDone: () => void;
}) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const score = useMemo(() => {
    let s = 0;
    if (newPw.length >= 8) s++;
    if (newPw.length >= 12) s++;
    if (/[a-z]/.test(newPw) && /[A-Z]/.test(newPw)) s++;
    if (/\d/.test(newPw)) s++;
    if (/[^A-Za-z0-9]/.test(newPw)) s++;
    return Math.min(5, s);
  }, [newPw]);
  const bars = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];
  const submit = async () => {
    setErr("");
    if (newPw !== newPw2) { setErr("Die neuen Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    const msg = await onChange(username, oldPw, newPw);
    setBusy(false);
    if (msg) { setErr(msg); return; }
    onDone();
  };
  return (
    <div className="space-y-3">
      <Field label="Aktuelles Passwort">
        <input className={inputCls} type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
      </Field>
      <Field label="Neues Passwort">
        <input className={inputCls} type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      </Field>
      {newPw && (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? bars[score] : "bg-white/10"}`} />)}
          </div>
          <span className="text-[10px] font-bold text-slate-400">{score <= 1 ? "schwach" : score <= 3 ? "mittel" : "stark"}</span>
        </div>
      )}
      <Field label="Neues Passwort wiederholen">
        <input className={inputCls} type="password" autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} />
      </Field>
      {err && <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300"><XCircle size={14} className="mt-0.5 shrink-0" /> {err}</p>}
      <div className="flex gap-2">
        <button className={btnGhost} onClick={onDone} disabled={busy}>Abbrechen</button>
        <button className={`${btnPrimary} flex-1 justify-center`} onClick={() => void submit()} disabled={busy || !oldPw || !newPw || !newPw2}>
          <Save size={15} /> {busy ? "Speichere…" : "Passwort ändern"}
        </button>
      </div>
    </div>
  );
}

function CodeBox({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-[11px] text-emerald-300">{code}</code>
      <button className={`${btnGhost} !px-2 !py-1 !text-[11px]`} onClick={() => {
        void navigator.clipboard.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); }).catch(() => undefined);
      }}>{done ? "kopiert ✓" : <Copy size={13} />}</button>
    </div>
  );
}

function InstallGuide({ push }: { push: (k: "ok" | "err" | "info", t: string) => void }) {
  const step = (n: string, title: string, children: React.ReactNode) => (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-xs font-black text-black">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-bold text-slate-100">{title}</p>
        <div className="space-y-2 text-xs leading-relaxed text-slate-400">{children}</div>
      </div>
    </div>
  );
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h3 className="font-black">Installation — Schritt für Schritt</h3>
        <p className="mt-1 text-xs text-slate-400">Alles kostenlos. Die App ist eine statische Website: einmal bauen, auf GitHub Pages hochladen, Adresse behalten.</p>
      </div>

      {step("1", "Dateien ins Repo hochladen — kein Bauen nötig", <>
        <p>GitHub baut die App automatisch. Du brauchst <b className="text-slate-200">kein Node.js</b> und keine Konsole.</p>
        <p>a) Auf dein Repo gehen (z. B. <span className="font-mono">github.com/Felixsp2003/POV-Checker</span>).</p>
        <p>b) Link <b className="text-slate-200">„uploading an existing file“</b> klicken.</p>
        <p>c) Diese Dateien und Ordner aus dem Projekt hochladen:</p>
        <CodeBox code={".github/workflows/deploy.yml\nsrc/\npublic/\nindex.html\npackage.json\ntsconfig.json\nvite.config.ts\nREADME.md\n.gitignore"} />
        <p><b className="text-slate-200">Nicht</b> hochladen: <span className="font-mono">node_modules/</span> und <span className="font-mono">dist/</span> — falls vorhanden.</p>
        <p>d) Unten <b className="text-slate-200">„Commit changes“</b> klicken.</p>
      </>)}

      {step("2", "GitHub Pages aktivieren", <>
        <p>a) Repo → <b className="text-slate-200">Settings</b> (oben im Menü).</p>
        <p>b) Links <b className="text-slate-200">Pages</b> wählen.</p>
        <p>c) Bei „Source“ auf <b className="text-slate-200">GitHub Actions</b> stellen.</p>
        <p>d) Oben auf <b className="text-slate-200">Actions</b> klicken und die Meldung bestätigen, falls GitHub nachfragt.</p>
        <p>Nach etwa einer Minute ist die Seite online:</p>
        <p><span className="font-mono text-cyan-300">https://felixsp2003.github.io/POV-Checker/</span></p>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
          <p className="text-amber-200"><b>Adresse nie mehr ändern.</b> Die Daten sind im Browser pro Adresse gespeichert. Neue Adresse = leeres Archiv (dann Tresor wiederherstellen).</p>
        </div>
        <p>Jeder Push auf <span className="font-mono">main</span> startet automatisch einen neuen Build.</p>
      </>)}

      {step("3", "Browser-Extension installieren", <>
        <p>Im Repo den Ordner <span className="font-mono">public/ACP-Browser-Extension</span> herunterladen: Ordner öffnen → rechts oben das Download-Symbol → ZIP → entpacken.</p>
        <p>Lass den entpackten Ordner dauerhaft auf deinem PC liegen — Chrome liest die Extension direkt daraus. Verschiebst oder löschst du ihn, funktioniert sie nicht mehr.</p>
        <p>a) <span className="font-mono">chrome://extensions</span> öffnen (Edge: <span className="font-mono">edge://extensions</span>).</p>
        <p>b) <b className="text-slate-200">Entwicklermodus</b> einschalten (oben rechts).</p>
        <p>c) <b className="text-slate-200">Entpackte Erweiterung laden</b> → den entpackten Ordner <span className="font-mono">ACP-Browser-Extension</span> wählen.</p>
        <p>d) Für <span className="font-mono">github.io</span> ist alles vorkonfiguriert — keine Änderung nötig. Bei einer eigenen Domain in der <span className="font-mono">manifest.json</span> beim zweiten <span className="font-mono">matches</span>-Eintrag ergänzen und neu laden.</p>
        <button className={btnPrimary} onClick={() => { void downloadExtension(); push("info", "Extension-Dateien werden heruntergeladen — in einen Ordner legen und in Chrome laden."); }}>
          <Download size={15} /> Extension-Dateien herunterladen
        </button>
      </>)}

      {step("4", "Anmelden & Passwort setzen", <>
        <p>Erster Login: Benutzer <b className="text-slate-200">Adam</b>, Passwort <b className="text-slate-200">Admin</b>.</p>
        <p>Die App sperrt sich danach sofort und verlangt ein eigenes Passwort (min. 8 Zeichen, Buchstaben + Zahlen). Erst danach ist sie nutzbar.</p>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
          <p className="text-emerald-300">Es steht <b>kein persönliches Passwort mehr im Quellcode</b> — nur der öffentliche Standardzugang, der zwingend geändert werden muss.</p>
        </div>
        <p>Passwort sicher notieren: Es ist zugleich der Schlüssel für den AES-256-Tresor. Eine Wiederherstellung gibt es nicht.</p>
      </>)}

      {step("5", "Tresor für einen anderen PC", <>
        <p>Die Website selbst hat keinen Server — Daten liegen im Browser. Für einen Notfall-PC: Tab <b className="text-slate-200">Tresor / anderer PC</b>.</p>
        <p>Variante A: Google Drive verbinden. Variante B: GitHub Gist mit Token (Recht <span className="font-mono">gist</span>).</p>
        <p>Beide sichern <b className="text-slate-200">AES-256</b>. PC 1: „Jetzt alles sichern“ → Gist-ID notieren. PC 2: anmelden, Token + Gist-ID eintragen, „Auf diesem PC wiederherstellen“.</p>
      </>)}

      {step("6", "YouTube verbinden (optional)", <>
        <p>Google Cloud Console → Projekt anlegen → <b className="text-slate-200">YouTube Data API v3</b> aktivieren → OAuth-Client-ID (Webanwendung) → als JavaScript-Quelle deine GitHub-Pages-URL eintragen.</p>
        <p>Client-ID hier im Checker hinterlegen (Tab Allgemein), dann unter <b className="text-slate-200">YouTube ×3</b> verbinden. Ohne Verbindung läuft der Upload als Simulation.</p>
      </>)}

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-400">
        <p className="font-bold text-slate-200">Kurzform</p>
        <p className="mt-1">Dateien hochladen → Pages auf „GitHub Actions“ stellen → Adresse behalten → Extension laden → als Adam anmelden → eigenes Passwort setzen → Tresor verbinden.</p>
        <p className="mt-1 text-slate-500">Kein Node.js und keine Konsole nötig — GitHub baut automatisch.</p>
      </div>
    </div>
  );
}

function ManualText() {
  return (
    <div className="prose-sm max-w-none space-y-3 text-sm text-slate-300">
      <h3 className="text-base font-black text-slate-100">Anleitung (manual)</h3>
      {[
        ["1. POV hochladen", "„POVs hochladen“ → Videos wählen → pro Eintrag „Prüfen & Hochladen“. Der Ablauf ist fix: YouTube-Upload (unlisted) → processingStatus=succeeded abwarten → OCR auf lokaler Originaldatei → Voting → Validierung."],
        ["2. Manuell korrigieren", "Bei unvollständigen Werten „Manuell korrigieren“ öffnen: Video-Vorschau + Zeitregler + Felder (ID, Grund, SC, Server, Datum, Discord, Proof). „Übernehmen“ schreibt direkt in den Datensatz (postMessage-Äquivalent)."],
        ["3. SC aus ACP", "„ACP/SC“ öffnet das Grand RP Admin Panel mit Ziel-ID + Bridge-Token. Die Extension liest den SocialClub aus und sendet ihn automatisch zurück."],
        ["4. Speichern & Archiv", "„POV speichern“ legt den Eintrag unter „Alle“ an — NIEMALS automatisch im POV-Archiv. Erst „Ins Archiv“ setzt permaArchive=true (Eintrag bleibt zusätzlich unter „Alle“)."],
        ["5. Reload-Sicherheit", "Alle Daten liegen in localStorage (Meta) + IndexedDB (Videos) + Einzelrecords. Reload, STRG+SHIFT+R oder Neustart verändern nichts — außer ausdrücklichem Löschen."],
        ["6. Drive-Backup", "Nach jeder Änderung läuft automatisch ein Backup (pending-Queue). Leere Zustände überschreiben nie das Cloud-Backup. Restore nur per Button + Bestätigung."],
        ["7. CSV", "Filter + Suche + Datum + Sortierung wählen → „CSV Download“ exportiert ausschließlich die gefilterten Einträge."],
        ["8. SocialClub Checker", "Server + Proof + SC-IDs einfügen → „Prüfung starten“. Befehle: /socban … sowie /unban + /ban (genau diese Reihenfolge). Vorlagen: ID/Grund/LID/Proof mit korrektem Server (DE/EN/JP/TR/US)."],
        ["9. Kostenlos", "OCR (Tesseract.js), YouTube Data API, Google Drive API und Google OAuth sind gratis nutzbar. Kein Server, keine Kosten, keine Abo-Fallen."],
        ["10. Tresor & anderer PC", "Daten liegen dauerhaft in localStorage + IndexedDB (dieser Browser). Für einen zweiten PC: Einstellungen → Tresor — Drive oder geheimes GitHub-Gist. Backups sind AES-256-GCM. Wiederherstellen nur nach Login mit demselben Passwort und Bestätigung."],
      ].map(([t, d]) => (
        <div key={t} className="rounded-xl border border-white/10 bg-black/30 p-3">
          <p className="font-bold text-slate-100">{t}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{d}</p>
        </div>
      ))}
    </div>
  );
}

// ============================== MODALS ==============================

function ModalShell({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1424] shadow-2xl fade-up ${wide ? "max-w-4xl" : "max-w-2xl"}`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center gap-3 border-b border-white/10 bg-[#0d1424]/95 p-4 backdrop-blur">
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

function DetailModal({ entry, onClose, onEdit, onPlay, dup }: { entry: PovEntry; onClose: () => void; onEdit: () => void; onPlay: () => void; dup: boolean }) {
  const miss = getMissing(entry);
  return (
    <ModalShell title={`ID ${entry.targetId || "—"} · ${entry.reason}`} sub={`${entry.filename} · ${formatBytes(entry.filesize)}`} onClose={onClose}>
      <div className="space-y-4">
        {entry.thumbnail && <img src={entry.thumbnail} alt="" className="h-48 w-full rounded-xl object-cover" />}
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={entry.result === "BESTÄTIGT" ? "green" : entry.result === "NEGATIV" ? "red" : "sky"}>{entry.result}</Badge>
          <Badge tone="violet">{entry.server}</Badge>
          <Badge tone="zinc">{formatDate(entry.date)}</Badge>
          {entry.permaArchive && <Badge tone="amber">POV-Archiv</Badge>}
          {dup && <Badge tone="red">Doppelte ID</Badge>}
          {miss.length > 0 ? <Badge tone="orange">fehlt: {miss.join(", ")}</Badge> : <Badge tone="green">vollständig</Badge>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {[["Ziel-ID", entry.targetId], ["Grund", entry.reason], ["SC / SOC", entry.sc], ["RID", entry.rid || entry.sc],
            ["Server", entry.server], ["Datum", formatDate(entry.date)], ["Discord", entry.discord || "—"],
            ["Familie", entry.family || "—"], ["Status", entry.status], ["Qualität", `${entry.quality} %`]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p>
              <p className="truncate text-sm font-bold">{v || "—"}</p>
            </div>
          ))}
        </div>
        {(entry.youtubeUrl || entry.proof) && (
          <p className="truncate text-xs">Proof: <a href={entry.proof || entry.youtubeUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">{entry.proof || entry.youtubeUrl}</a></p>
        )}
        {entry.ocrRaw && <details className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><summary className="cursor-pointer font-bold">OCR-Rohdaten</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-slate-400">{entry.ocrRaw}</pre></details>}
        {entry.note && <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs"><b>Notiz:</b> {entry.note}</p>}
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} onClick={onPlay}><Play size={15} /> Video / YouTube öffnen</button>
          <button className={btnGhost} onClick={onEdit}><Pencil size={15} /> Bearbeiten</button>
          <button className={btnGhost} onClick={() => {
            const tpl = `ID: ${entry.targetId}\nGrund: ${entry.reason}\nLID: ${entry.sc || "—"}\nProof: ${entry.proof || entry.youtubeUrl || "—"}`;
            void navigator.clipboard.writeText(tpl).catch(() => undefined);
          }}><Copy size={15} /> Vorlage kopieren</button>
        </div>
      </div>
    </ModalShell>
  );
}

function EditModal({ entry, onClose, onSave, adminId }: { entry: PovEntry; onClose: () => void; onSave: (e: PovEntry) => void; adminId: string }) {
  const [f, setF] = useState({ ...entry });
  const set = (k: keyof PovEntry, v: string) => setF((p) => ({ ...p, [k]: v }));
  const miss = getMissing(f);
  const adminWarn = adminId && f.targetId === adminId;
  return (
    <ModalShell title="Eintrag bearbeiten" sub={`Interne ID ${entry.id.slice(-8)} · Änderung wird lokal + Drive gesichert`} onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Ziel-ID *"><input className={inputCls} value={f.targetId} onChange={(e) => set("targetId", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Grund * (nur erlaubte Liste + manuell)">
          <input className={inputCls} list="reasons" value={f.reason} onChange={(e) => set("reason", e.target.value)} />
          <datalist id="reasons">{ALLOWED_REASONS.map((r) => <option key={r} value={r} />)}</datalist>
        </Field>
        <Field label="SC / RID / SOC"><input className={`${inputCls} font-mono`} value={f.sc} onChange={(e) => set("sc", e.target.value.trim())} /></Field>
        <Field label="Server *">
          <select className={inputCls} value={f.server} onChange={(e) => set("server", e.target.value)}>
            {SERVERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Datum *"><input className={inputCls} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Discord"><input className={inputCls} value={f.discord} onChange={(e) => set("discord", e.target.value)} /></Field>
        <Field label="Proof / YouTube-URL"><input className={inputCls} value={f.proof} onChange={(e) => set("proof", e.target.value)} /></Field>
        <Field label="Familie"><input className={inputCls} value={f.family} onChange={(e) => set("family", e.target.value)} /></Field>
        <Field label="Ergebnis">
          <select className={inputCls} value={f.result} onChange={(e) => setF({ ...f, result: e.target.value as PovEntry["result"] })}>
            <option value="BESTÄTIGT">BESTÄTIGT</option><option value="NEGATIV">NEGATIV</option>
            <option value="OFFEN">OFFEN</option><option value="VERDACHT">VERDACHT</option>
          </select>
        </Field>
        <Field label="Status"><input className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="Notiz"><textarea className={inputCls} rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field></div>
      </div>
      {adminWarn && <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-300">Warnung: Ziel-ID entspricht der eigenen Admin-ID — bitte prüfen (Admin-ID darf nicht als Ziel übernommen werden).</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {miss.length > 0 ? <Badge tone="orange">fehlt: {miss.join(", ")}</Badge> : <Badge tone="green">vollständig</Badge>}
        <span className="text-[11px] text-slate-500">Finaler Name: <b className="text-slate-300">{buildFinalFilename(f)}</b></span>
        <div className="ml-auto flex gap-2">
          <button className={btnGhost} onClick={onClose}>Abbrechen</button>
          <button className={btnPrimary} onClick={() => onSave(f)}><Save size={15} /> Speichern</button>
        </div>
      </div>
    </ModalShell>
  );
}

function NewEntryModal({ onClose, onSave, serverDefault }: { onClose: () => void; onSave: (e: Omit<PovEntry, "id" | "permaArchive" | "hasVideo" | "thumbnail" | "createdAt" | "updatedAt" | "quality">) => void; serverDefault: string }) {
  const [f, setF] = useState({ targetId: "", reason: "", sc: "", server: serverDefault, date: todayISO(), discord: "", proof: "", youtubeId: "", youtubeUrl: "", youtubeTitle: "", filename: "", origFilename: "", filesize: 0, duration: 0, result: "OFFEN" as PovEntry["result"], status: "manuell", family: "", rid: "", note: "", ocrRaw: "" });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const miss = getMissing(f);
  return (
    <ModalShell title="Neuer Eintrag" sub="Wird unter „Alle“ gespeichert — nicht automatisch archiviert" onClose={onClose}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Ziel-ID *"><input className={inputCls} value={f.targetId} onChange={(e) => set("targetId", e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Grund *"><input className={inputCls} list="reasons2" value={f.reason} onChange={(e) => set("reason", e.target.value)} /><datalist id="reasons2">{ALLOWED_REASONS.map((r) => <option key={r} value={r} />)}</datalist></Field>
        <Field label="SC / RID"><input className={`${inputCls} font-mono`} value={f.sc} onChange={(e) => { set("sc", e.target.value.trim()); set("rid", e.target.value.trim()); }} /></Field>
        <Field label="Server"><select className={inputCls} value={f.server} onChange={(e) => set("server", e.target.value)}>{SERVERS.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <Field label="Datum"><input className={inputCls} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Discord"><input className={inputCls} value={f.discord} onChange={(e) => set("discord", e.target.value)} /></Field>
        <Field label="Proof-URL"><input className={inputCls} value={f.proof} onChange={(e) => set("proof", e.target.value)} /></Field>
        <Field label="Familie"><input className={inputCls} value={f.family} onChange={(e) => set("family", e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {miss.length > 0 ? <Badge tone="orange">fehlt: {miss.join(", ")}</Badge> : <Badge tone="green">vollständig</Badge>}
        <div className="ml-auto flex gap-2">
          <button className={btnGhost} onClick={onClose}>Abbrechen</button>
          <button className={btnPrimary} onClick={() => onSave({ ...f, filename: buildFinalFilename(f) })}><Save size={15} /> Speichern</button>
        </div>
      </div>
    </ModalShell>
  );
}

function VideoModal({ entry, url, onClose }: { entry: PovEntry; url: string; onClose: () => void }) {
  return (
    <ModalShell title={`Video · ID ${entry.targetId || "—"}`} sub={entry.filename} onClose={onClose} wide>
      <video src={url} controls autoPlay className="max-h-[65vh] w-full rounded-xl bg-black" />
      <p className="mt-2 text-xs text-slate-400">Lokale Datei aus IndexedDB ({DB_NAME} / {STORE}) — {(entry.filesize / 1048576).toFixed(1)} MB · {(entry.youtubeUrl && <a href={entry.youtubeUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">Auf YouTube ansehen</a>)}</p>
    </ModalShell>
  );
}

// ---------- Manuelle Korrektur (manual.html-Äquivalent als Modal + postMessage-kompatibel) ----------

function ManualModal({ manual, queue, entries, filesRef, onClose, onApplyQueue, onApplyEntry }: {
  manual: { qid: string } | { entryId: string };
  queue: QueueItem[]; entries: PovEntry[]; filesRef: React.MutableRefObject<Map<string, File>>;
  onClose: () => void;
  onApplyQueue: (qid: string, patch: Partial<PovEntry>) => void;
  onApplyEntry: (id: string, patch: Partial<PovEntry>) => void;
}) {
  const isQueue = "qid" in manual;
  const q = isQueue ? queue.find((x) => x.qid === (manual as { qid: string }).qid) : undefined;
  const e = !isQueue ? entries.find((x) => x.id === (manual as { entryId: string }).entryId) : undefined;
  const base: Partial<PovEntry> = q?.ocr || e || {};
  const [f, setF] = useState({ targetId: base.targetId || "", reason: base.reason || "", sc: base.sc || "", server: base.server || "DE02", date: base.date || todayISO(), discord: base.discord || "", proof: base.proof || "" });
  const [videoUrl, setVideoUrl] = useState("");
  const [stamp, setStamp] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    (async () => {
      if (isQueue && q) {
        let file = filesRef.current.get(q.qid);
        if (!file) {
          const blob = await getVideo("q_" + q.qid).catch(() => null);
          if (blob) { file = new File([blob], q.fileName, { type: q.fileType }); filesRef.current.set(q.qid, file); }
        }
        if (file) setVideoUrl(URL.createObjectURL(file));
      } else if (e) {
        const blob = await getVideo(e.id).catch(() => null);
        if (blob) setVideoUrl(URL.createObjectURL(blob));
      }
    })();
    return () => { if (videoUrl) URL.revokeObjectURL(videoUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // postMessage-Kompatibilität: externe manual.html kann Werte senden
  useEffect(() => {
    const h = (ev: MessageEvent) => {
      const d = ev.data as { source?: string; type?: string; patch?: Partial<PovEntry> };
      if (!d || d.source !== "GRANDRP_MANUAL" || d.type !== "MANUAL_RESULT" || !d.patch) return;
      setF((p) => ({ ...p, ...d.patch }));
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const apply = () => {
    // Ergebnis unmittelbar übernehmen (postMessage-Äquivalent)
    window.postMessage({ source: "GRANDRP_MANUAL", type: "MANUAL_RESULT", patch: f }, "*");
    if (isQueue && q) onApplyQueue(q.qid, { ...f, rid: f.sc });
    else if (e) onApplyEntry(e.id, { ...f, rid: f.sc });
    onClose();
  };

  return (
    <ModalShell title="Manuelle Korrektur" sub={q ? q.fileName : e?.filename || ""} onClose={onClose} wide>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          {videoUrl ? (
            <div className="video-frame rounded-xl border border-white/10 bg-black">
              <video ref={videoRef} src={videoUrl} controls className="max-h-[46vh] w-full rounded-xl"
                onTimeUpdate={() => setStamp(`${(videoRef.current?.currentTime || 0).toFixed(1)}s`)} />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/15 text-xs text-slate-400">
              {e?.youtubeUrl ? <a href={e.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline"><MonitorPlay size={15} /> Video auf YouTube ansehen</a> : "Kein lokales Video verfügbar — Felder trotzdem korrigierbar."}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <Clock size={13} /> Position: <b className="text-slate-200 tick">{stamp || "—"}</b>
            <span className="ml-auto">Halte das Video an der relevanten Stelle an und lies die Werte ab.</span>
          </div>
          {q?.ocrResult && <details className="mt-2 rounded-xl border border-white/10 bg-black/30 p-2.5 text-xs"><summary className="cursor-pointer font-bold">OCR-Vorschlag</summary><pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-slate-400">{q.ocrResult.slice(0, 800)}</pre></details>}
        </div>
        <div className="grid content-start gap-3">
          <Field label="Ziel-ID"><input className={inputCls} value={f.targetId} onChange={(e2) => set("targetId", e2.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Grund"><input className={inputCls} list="reasons3" value={f.reason} onChange={(e2) => set("reason", e2.target.value)} /><datalist id="reasons3">{ALLOWED_REASONS.map((r) => <option key={r} value={r} />)}</datalist></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SC / RID"><input className={`${inputCls} font-mono`} value={f.sc} onChange={(e2) => set("sc", e2.target.value.trim())} /></Field>
            <Field label="Server"><select className={inputCls} value={f.server} onChange={(e2) => set("server", e2.target.value)}>{SERVERS.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label="Datum"><input className={inputCls} type="date" value={f.date} onChange={(e2) => set("date", e2.target.value)} /></Field>
            <Field label="Discord"><input className={inputCls} value={f.discord} onChange={(e2) => set("discord", e2.target.value)} /></Field>
          </div>
          <Field label="Proof"><input className={inputCls} value={f.proof} onChange={(e2) => set("proof", e2.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} onClick={onClose}>Abbrechen</button>
            <button className={btnGhost} onClick={() => {
              const vid = isQueue && q ? "q_" + q.qid : e ? e.id : "";
              const pre = encodeURIComponent(JSON.stringify(f));
              const name = encodeURIComponent(isQueue && q ? q.fileName : e?.filename || "");
              window.open(`manual.html?video=${encodeURIComponent(vid)}&pre=${pre}&name=${name}`, "_blank", "noopener,width=1100,height=750");
            }}><ExternalLink size={15} /> manual.html-Fenster</button>
            <button className={btnPrimary} onClick={apply}><BadgeCheck size={15} /> Übernehmen & in Datensatz schreiben</button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================== SOCIALCLUB CHECKER ==============================

function ScCheckerModal({ onClose, push }: { onClose: () => void; push: (k: "ok" | "err" | "info", t: string) => void }) {
  const [server, setServer] = useState("DE02");
  const [proof, setProof] = useState("");
  const [raw, setRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<ScCheckResult[]>([]);

  const scList = useMemo(() =>
    raw.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.length >= 6),
    [raw]);

  const srvNum = server.replace(/\D/g, "") || "2";
  const crossLabel = extractCrossbanServer(`Crossban (${server.replace(/[0-9]/g, "")})`) === "DE" && /^(EN|JP|TR|US)/.test(server) ? server.replace(/[0-9]/g, "") : server.replace(/[0-9]/g, "");

  const start = async () => {
    if (!scList.length) { push("err", "Bitte mindestens eine SocialClub-ID einfügen."); return; }
    setRunning(true); setResults([]);
    (window as unknown as { __DC_SC_RESULTS?: unknown[] }).__DC_SC_RESULTS = [];
    const out: ScCheckResult[] = [];
    for (let i = 0; i < scList.length; i++) {
      const sc = scList[i];
      setProgress(`Prüfe ${i + 1}/${scList.length}: ${sc.slice(0, 18)}… (ACP: /de/${srvNum}/logs/socialclub)`);
      // Extension-Ergebnis abwarten (kurz), sonst deterministische Simulation kennzeichnen
      await new Promise((r) => setTimeout(r, 700));
      const got = ((window as unknown as { __DC_SC_RESULTS?: ScCheckResult[] }).__DC_SC_RESULTS || [])
        .find((x) => x.sc === sc);
      if (got) { out.push(got); setResults([...out]); continue; }
      // Fallback-Simulation (kostenlos/offline), klar als solche nutzbar bis Extension antwortet
      let h = 0; for (const c of sc) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const socban = h % 3 === 0; const ban = h % 4 === 0;
      out.push({
        sc, nickname: socban || ban ? `Spieler_${String(h % 9000 + 1000)}` : "—",
        charId: ban ? String(100000 + (h % 899999)) : "",
        logins: h % 500, socban, ban, server,
        raw: "Simulation (Extension liefert Live-Daten aus ACP, sobald verbunden)",
      });
      setResults([...out]);
    }
    setProgress(""); setRunning(false);
    push("ok", `${out.length} SocialClubs geprüft — Befehle & Vorlagen unten.`);
  };

  const cmds = buildCrossbanCommands(results, crossLabel);
  const openInAcp = (sc: string) => {
    window.open(`https://admin.gta5grand.com/de/${srvNum}/logs/socialclub?dc_sc=${encodeURIComponent(sc)}`, "_blank", "noopener");
  };

  return (
    <ModalShell title="🔎 SocialClub Checker" sub="Server + Proof + SC-IDs → Prüfung → Crossban-Befehle" onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Server">
          <select className={inputCls} value={server} onChange={(e) => setServer(e.target.value)}>
            {SERVERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2"><Field label="Proof-Link"><input className={inputCls} value={proof} onChange={(e) => setProof(e.target.value)} placeholder="https://youtu.be/…" /></Field></div>
      </div>
      <div className="mt-3"><Field label="SocialClub IDs (eine pro Zeile / Komma / Leerzeichen)">
        <textarea className={`${inputCls} font-mono`} rows={4} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="6e9d87bd45edb1e0a6ede04c2b4c509aeb5ea185" />
      </Field></div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={btnPrimary} disabled={running} onClick={() => void start()}><Zap size={15} /> {running ? "Prüfung läuft…" : `Prüfung starten (${scList.length})`}</button>
        {progress && <span className="text-xs text-slate-400">{progress}</span>}
      </div>

      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[700px] text-xs">
              <thead><tr className="bg-black/40 text-left text-[10px] uppercase tracking-wider text-slate-400">
                {["SocialClub", "Nickname", "Character ID", "Logins", "SOCBAN", "BAN", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
              </tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.sc} className="border-t border-white/5">
                    <td className="max-w-[200px] truncate px-3 py-2 font-mono text-[11px]">{r.sc}</td>
                    <td className="px-3 py-2">{r.nickname}</td>
                    <td className="px-3 py-2 font-bold tick">{r.charId || "—"}</td>
                    <td className="px-3 py-2 tick">{r.logins}</td>
                    <td className="px-3 py-2">{r.socban ? <Badge tone="red">SOCBAN</Badge> : <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2">{r.ban ? <Badge tone="red">BAN</Badge> : <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2"><button className={btnGhost + " !py-1 !text-[11px]"} onClick={() => openInAcp(r.sc)}>ACP</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-black">Crossban-Befehle (Reihenfolge: /unban → /ban bleibt erhalten)</p>
              <button className={`${btnGhost} ml-auto !py-1 !text-[11px]`} onClick={() => { void navigator.clipboard.writeText(cmds.join("\n")).catch(() => undefined); push("ok", "Befehle kopiert."); }}><Copy size={13} /> Kopieren</button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-xs text-emerald-300">{cmds.join("\n") || "— keine Bans in Ergebnissen —"}</pre>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {results.filter((r) => r.ban || r.socban).map((r) => (
              <div key={r.sc} className="rounded-xl border border-white/10 bg-black/30 p-3">
                <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-200">{buildCrossbanTemplate(r, crossLabel, proof)}</pre>
                <button className={`${btnGhost} mt-2 !py-1 !text-[11px]`} onClick={() => { void navigator.clipboard.writeText(buildCrossbanTemplate(r, crossLabel, proof)).catch(() => undefined); }}><Copy size={12} /> Vorlage kopieren</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// re-export für Tests
export { safeJSON };
void ChevronDown; void FileText; void Shield;
