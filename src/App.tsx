import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, AlertTriangle, Upload, FileSpreadsheet, Settings as SettingsIcon, Search, Plus, RefreshCw, LogOut, Shield, Database, KeyRound, User } from "lucide-react";
import {
  APP_VERSION, META_KEY, DB_NAME, PovEntry, QueueItem, YTConnection, DriveConfig, AppSettings,
  uid, sha256, todayISO, dateFromFilename, buildFinalFilename, entryQuality, deriveResult, getMissing, findDuplicateIds,
  isHardbann, isSocBan, isCheater, isPcCheck, isBan, isNegative, isVerweigert, checkerPool, loadCustomCheckers, saveCustomCheckers,
  PC_CHECKER_LEAD, DOCUMENT_STATUS,
  getVideo, putVideo, delVideo, hasVideo, findVideo,
  loadMeta, saveMeta, loadMirror, loadDeleted, markDeleted, saveRecord, loadAllRecords, deleteRecord, mergeEntries,
  loadSettings, saveSettings, loadYT, saveYT, loadDrive, saveDrive, loadUsers, saveUsers, loadSession, saveSession,
  loadBridgeToken, loadQueueMeta, saveQueueMeta, applyCsvFilters, sortCsv, toCSV, VIEW_KEY, classifyReason, autoTypes, autoPerma, autoResult, savePhoto,
} from "./lib/core";
import { captureThumbnail, captureFrameAt, runOcrOnFile, youtubeUpload, youtubeWaitProcessing, youtubeSetTitle, driveBackup, openAcpForId, installAcpListener, YtQuotaError } from "./lib/services";
import { unlockVault, lockVault, restoreVaultKey, lockStatus, noteLoginFail, noteLoginOk, formatRemain } from "./lib/vault";
import { Badge, Field, Toast, Toasts, btnGhost, btnPrimary, inputCls } from "./ui";
import { ArchiveView, CasesView, DetailModal, type ArchiveFilter } from "./views/Archive";
import UploadView from "./views/Upload";
import CsvView from "./views/Csv";
import SettingsView from "./views/Settings";
import { EditModal, NewEntryModal, VideoModal, ForceChangeModal } from "./views/Modals";

// Öffentlicher Standard-Zugang — Änderung wird beim ersten Login erzwungen. Kein persönliches Passwort im Code.
const DEFAULT_USER = "Adam";
const DEFAULT_PW = "Admin";
type View = "archive" | "cases" | "upload" | "csv" | "settings";

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = uid("t");
    setToasts((p) => [...p.slice(-4), { id, kind, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5600);
  }, []);
  return { toasts, push };
}

export default function App() {
  const { toasts, push } = useToasts();
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState("");
  // Beim Aktualisieren beim zuletzt geöffneten Tab bleiben
  const [view, setViewRaw] = useState<View>(() => {
    const v = localStorage.getItem(VIEW_KEY) || "";
    return (["archive", "cases", "upload", "csv", "settings"] as const).includes(v as View) ? (v as View) : "archive";
  });
  const setView = useCallback((v: View) => { setViewRaw(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* egal */ } }, []);
  const [entries, setEntries] = useState<PovEntry[]>([]);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("alle");
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [ytConns, setYtConns] = useState<YTConnection[]>(() => loadYT());
  const [drive, setDrive] = useState<DriveConfig>(() => loadDrive());
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [expanded, setExpanded] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [driveMsg, setDriveMsg] = useState("");
  const [pool, setPool] = useState<string[]>(() => checkerPool());
  const [acpStatus, setAcpStatus] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<PovEntry | null>(null);
  const [editing, setEditing] = useState<PovEntry | null>(null);
  const [videoPlay, setVideoPlay] = useState<{ entry: PovEntry; url: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [csvActive, setCsvActive] = useState<Set<string>>(new Set());
  const [csvSearch, setCsvSearch] = useState("");
  const [csvFrom, setCsvFrom] = useState("");
  const [csvTo, setCsvTo] = useState("");
  const [csvSort, setCsvSort] = useState("new");
  const [loginU, setLoginU] = useState("");
  const [loginP, setLoginP] = useState("");
  const [forceChange, setForceChange] = useState(false);

  const filesRef = useRef<Map<string, File>>(new Map());
  const abortRef = useRef<Map<string, AbortController>>(new Map());
  const queueRef = useRef<QueueItem[]>([]);
  const entriesRef = useRef<PovEntry[]>([]);
  const autoBackupTimer = useRef<number | null>(null);
  const blockedSlots = useRef<number[]>([0, 0, 0]);   // Kanal gesperrt bis (Zeitstempel)
  const autoRunning = useRef(false);
  const bridgeToken = useMemo(() => loadBridgeToken(), []);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // ---------- START: nur LESEN, niemals zurücksetzen ----------
  useEffect(() => {
    (async () => {
      try {
        try { void navigator.storage?.persist?.(); } catch { /* egal */ }
        const meta = loadMeta();
        const recs = loadAllRecords();
        const mirror = await loadMirror();
        const merged = mergeEntries(mergeEntries(meta, recs), mirror);
        const deleted = new Set(loadDeleted());
        const visible = merged.filter((e) => !deleted.has(e.id));
        setEntries(visible);
        if (visible.length > meta.length) { try { saveMeta(visible); visible.forEach(saveRecord); } catch { /* egal */ } }
        // Queue wiederherstellen (Blobs liegen in IndexedDB unter q_<qid>)
        const qm = loadQueueMeta().filter((q) => q.status !== "gespeichert");
        setQueue(qm.map((q) => ({ ...q, status: q.youtubeId ? "fertig" : "wartet", progress: q.youtubeId ? 100 : 0, error: "" })));
        if (loadUsers().length === 0) {
          const salt = uid("s");
          const p = await sha256(salt + "::" + DEFAULT_PW);
          saveUsers([{ u: DEFAULT_USER, p, salt, created: Date.now(), role: "admin", mustChange: true }]);
        }
        const unlocked = await restoreVaultKey();
        const s = loadSession();
        if (s && unlocked) { setUser(s); if (loadUsers().find((x) => x.u === s)?.mustChange) setForceChange(true); }
      } catch (e) {
        push("err", `Start-Fehler: ${e instanceof Error ? e.message : String(e)} — lokale Daten wurden NICHT verändert.`);
      } finally { setBooted(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Persistenz ----------
  const persist = useCallback((next: PovEntry[], reason: string, skipBackup = false): boolean => {
    try { saveMeta(next); for (const e of next) saveRecord(e); }
    catch (e) { push("err", `Lokales Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); return false; }
    setEntries(next);
    if (!skipBackup && loadSettings().autoBackup) {
      if (autoBackupTimer.current) window.clearTimeout(autoBackupTimer.current);
      autoBackupTimer.current = window.setTimeout(() => { void driveBackup(reason).then((r) => setDriveMsg(r.msg)); }, 1200);
    }
    return true;
  }, [push]);

  // ---------- ACP Bridge: SocialClub (Stufe 1) + BannGrund (Stufe 2) ----------
  useEffect(() => installAcpListener((m) => {
    if (m.type !== "SC_RESULT" && m.type !== "REASON_RESULT") return;
    (window as unknown as { __DC_LAST_SC?: unknown }).__DC_LAST_SC = m;
    const time = new Date().toLocaleTimeString("de-DE");
    // Nur leere Felder füllen — manuelle Eingaben werden nie überschrieben
    const patch = (cur: Partial<PovEntry>): Partial<PovEntry> => {
      const out: Partial<PovEntry> = {};
      if (m.type === "SC_RESULT" && m.sc && !cur.sc) out.sc = m.sc;
      const rawReason = m.type === "REASON_RESULT" ? (m.reason || m.rawReason) : (m.reason || "");
      if (rawReason && !cur.reason) {
        const r = classifyReason(rawReason) || rawReason;
        out.reason = r;
        if (!cur.types?.length) out.types = autoTypes(r);
        const ap = autoPerma(r); if (ap !== undefined && !cur.perma) out.perma = ap;
        if (!cur.manualResult) out.manualResult = autoResult(r);
      }
      return out;
    };
    if (m.type === "SC_RESULT") push("ok", `ACP: SC „${m.sc.slice(0, 12)}…“ empfangen${m.targetId ? ` für ID ${m.targetId}` : ""}.`);
    else push("ok", `ACP: BannGrund „${m.reason || m.rawReason}“ empfangen${m.admin ? ` (Admin: ${m.admin})` : ""}.`);
    setAcpStatus((s) => ({ ...s, [m.targetId || "*"]: m.type === "SC_RESULT" ? `✓ SC übernommen (${time}) — Character-Info wird für den BannGrund geöffnet …` : `✓ BannGrund übernommen (${time})` }));
    setQueue((prev) => prev.map((q) => (m.targetId && q.ocr.targetId === m.targetId) || (!m.targetId && expanded === q.qid)
      ? { ...q, ocr: { ...q.ocr, ...patch(q.ocr) } } : q));
    if (m.targetId) {
      const cur = entriesRef.current;
      const next = cur.map((e) => { if (e.targetId !== m.targetId) return e; const p = patch(e); return Object.keys(p).length ? { ...e, ...p, updatedAt: Date.now(), quality: entryQuality({ ...e, ...p }) } : e; });
      if (next.some((e, i) => e !== cur[i])) persist(next, "ACP-Daten übernommen");
      setEditing((ed) => ed && ed.targetId === m.targetId ? { ...ed, ...patch(ed) } : ed);
    }
  }), [expanded, persist, push]);

  // Nach dem Start bzw. Login offene POVs automatisch weiterverarbeiten
  useEffect(() => {
    if (!booted || (settings.loginRequired && !user)) return;
    if (queue.some((q) => (!q.ocrDone || !q.youtubeId) && q.status !== "fehler")) void runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, user, queue.length]);

  const reloadFromDisk = useCallback(async () => {
    const meta = loadMeta(); const recs = loadAllRecords(); const mirror = await loadMirror();
    const merged = mergeEntries(mergeEntries(meta, recs), mirror); const deleted = new Set(loadDeleted());
    setEntries(merged.filter((e) => !deleted.has(e.id)));
    setYtConns(loadYT()); setDrive(loadDrive()); setSettings(loadSettings()); setPool(checkerPool());
    push("info", `Neu geladen: ${merged.length} Einträge aus ${META_KEY} + ${DB_NAME}.`);
  }, [push]);

  // ---------- Archiv (Filter = reine Anzeige) ----------
  const dupIds = useMemo(() => findDuplicateIds(entries), [entries]);
  // Ins POV-Archiv verschobene Einträge erscheinen NUR noch unter „POV Archiv“,
  // nicht mehr unter „Alle“ und den übrigen Filtern.
  const active = useMemo(() => entries.filter((e) => !e.permaArchive), [entries]);
  const archived = useMemo(() => entries.filter((e) => e.permaArchive), [entries]);
  const counts = useMemo(() => ({
    alle: active.length, bans: active.filter(isBan).length, pc: active.filter(isPcCheck).length, soc: active.filter(isSocBan).length,
    hard: active.filter(isHardbann).length, cheater: active.filter(isCheater).length, negativ: active.filter(isNegative).length,
    verweigert: active.filter(isVerweigert).length, ohneVideo: active.filter((e) => !e.hasVideo).length,
    archiv: archived.length, doppelt: entries.filter((e) => dupIds.has(e.targetId)).length,
  }), [entries, active, archived, dupIds]);
  const archiveList = useMemo(() => {
    const s = search.trim().toLowerCase();
    // „POV Archiv“ und „Doppelte IDs“ sehen alles, alle anderen nur die nicht archivierten
    let list = archiveFilter === "archiv" ? archived : archiveFilter === "doppelt" ? entries : active;
    switch (archiveFilter) {
      case "bans": list = list.filter(isBan); break; case "pc": list = list.filter(isPcCheck); break;
      case "soc": list = list.filter(isSocBan); break; case "hard": list = list.filter(isHardbann); break;
      case "cheater": list = list.filter(isCheater); break; case "negativ": list = list.filter(isNegative); break;
      case "verweigert": list = list.filter(isVerweigert); break; case "ohne-video": list = list.filter((e) => !e.hasVideo); break;
      case "doppelt": list = list.filter((e) => dupIds.has(e.targetId)); break;
      default: break;
    }
    if (s) list = list.filter((e) => `${e.targetId} ${e.sc} ${e.reason} ${e.manualResult} ${e.discord} ${(e.pcCheckers || []).join(" ")}`.toLowerCase().includes(s));
    return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [entries, active, archived, archiveFilter, search, dupIds]);
  const casesList = useMemo(() => active.filter((e) => getMissing(e).length > 0 || e.result === "VERDACHT"), [active]);

  // ---------- Aktionen ----------
  const addPool = (n: string) => { const c = [...new Set([...loadCustomCheckers(), n])]; saveCustomCheckers(c); setPool(checkerPool()); };
  const openAcp = (targetId: string, key: string) => {
    if (!targetId) { push("err", "Zuerst Ziel-ID eintragen."); return; }
    openAcpForId(targetId);
    setAcpStatus((s) => ({ ...s, [key]: `ACP-Scan · warte auf Authorization-Daten für ID ${targetId} … (Extension sendet SC automatisch)`, [targetId]: `ACP-Scan läuft für ID ${targetId} …` }));
    push("info", `ACP geöffnet für ID ${targetId} — SC wird automatisch übernommen.`);
  };
  const doArchive = (ids: string[], to: boolean) => {
    persist(entries.map((e) => ids.includes(e.id) ? { ...e, permaArchive: to, updatedAt: Date.now() } : e), to ? "POV archiviert" : "POV aus Archiv entfernt");
    push("ok", to ? `${ids.length} POV(s) ins POV-Archiv verschoben — ab jetzt nur noch dort sichtbar.` : `${ids.length} POV(s) zurück in die aktive Liste.`);
    setSelected(new Set());
  };
  const doDelete = async (ids: string[]) => {
    if (!window.confirm(`${ids.length} POV(s) endgültig löschen? Metadaten + lokales Video werden entfernt.`)) return;
    const next = entries.filter((e) => !ids.includes(e.id));
    try {
      saveMeta(next);
      for (const id of ids) { markDeleted(id); deleteRecord(id); try { await delVideo(id); await delVideo("thumb_" + id); } catch { /* ok */ } }
      setEntries(next); setSelected(new Set()); setDetail(null);
      push("ok", `${ids.length} POV(s) gelöscht — Löschmarkierung gesetzt, kein Auto-Restore.`);
      void driveBackup("POV gelöscht").then((r) => setDriveMsg(r.msg));
    } catch (e) { push("err", `Löschen fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const openVideo = async (entry: PovEntry) => {
    const blob = await findVideo(entry).catch(() => null);
    if (blob) { setVideoPlay({ entry, url: URL.createObjectURL(blob) }); return; }
    if (entry.youtubeUrl || entry.proof) { window.open(entry.youtubeUrl || entry.proof, "_blank", "noopener"); return; }
    push("err", "Kein lokales Video und kein Proof-Link vorhanden.");
  };
  const saveEditedEntry = (e: PovEntry) => {
    const fixed: PovEntry = { ...e, filename: buildFinalFilename(e), updatedAt: Date.now(), quality: entryQuality(e), result: deriveResult(e), status: getMissing(e).length ? `unvollständig: ${getMissing(e).join(", ")}` : "vollständig", rid: e.rid || "" };
    persist(entries.map((x) => x.id === e.id ? fixed : x), "POV bearbeitet");
    if (fixed.youtubeId) void youtubeSetTitle(fixed.youtubeId, fixed.filename, ytConns[(fixed.ytSlot || 1) - 1]?.accessToken || "");
    setEditing(null); setDetail(null);
    push("ok", `ID ${fixed.targetId || "—"} gespeichert — bleibt nach Reload erhalten.`);
  };

  // ---------- Upload-Pipeline ----------
  const getFile = async (qid: string): Promise<File | null> => {
    const f = filesRef.current.get(qid); if (f) return f;
    const q = queueRef.current.find((x) => x.qid === qid); if (!q) return null;
    const blob = await getVideo("q_" + qid).catch(() => null);
    if (!blob) return null;
    const file = new File([blob], q.fileName, { type: q.fileType }); filesRef.current.set(qid, file); return file;
  };
  const addFiles = async (files: FileList | File[]) => {
    const arr = [...files].filter((f) => f.size > 0); if (!arr.length) return;
    const items: QueueItem[] = [];
    for (const f of arr) {
      const qid = uid("q"); filesRef.current.set(qid, f);
      const thumb = await captureThumbnail(f).catch(() => ({ url: "", duration: 0, width: 0, height: 0 }));
      items.push({
        qid, fileName: f.name, fileSize: f.size, fileType: f.type || "video/mp4", status: "wartet", progress: 0, ocrProgress: 0, ocrResult: "",
        youtubeStatus: "wartet", youtubeId: "", youtubeUrl: "", processingStatus: "", error: "", ytSlot: settings.ytDefaultSlot, ocrDone: false,
        ocr: { server: settings.serverDefault, date: dateFromFilename(f.name) || todayISO(), pcCheckers: [PC_CHECKER_LEAD], types: [], perma: false, permaArchive: false, notBanned: false, documentStatus: DOCUMENT_STATUS[0], manualResult: "", timestamps: {} },
        createdAt: Date.now(), thumbUrl: thumb.url, duration: thumb.duration,
      });
      try { await putVideo("q_" + qid, f, { name: f.name }); } catch { /* Quota */ }
    }
    const next = [...queueRef.current, ...items]; setQueue(next); saveQueueMeta(next);
    queueRef.current = next;
    if (!expanded) setExpanded(items[0].qid);
    push("info", `${items.length} Datei(en) — Upload startet automatisch, eine nach der anderen.`);
    void runAll();
  };

  // Arbeitet die Warteschlange der Reihe nach ab (Upload → Verarbeitung → OCR → Bannscreen).
  // Läuft immer nur EINE Pipeline gleichzeitig, damit Uploads sich nicht gegenseitig bremsen.
  const runAll = useCallback(async () => {
    if (autoRunning.current) return;
    autoRunning.current = true;
    try {
      for (;;) {
        // Zuerst alles analysieren (schnell), danach die Uploads
        const toAnalyse = queueRef.current.find((q) => !q.ocrDone && q.status !== "fehler");
        const toUpload = queueRef.current.find((q) => q.ocrDone && !q.youtubeId && q.status !== "fehler");
        const nextItem = toAnalyse || toUpload;
        if (!nextItem) break;
        setExpanded((cur) => cur || nextItem.qid);
        const ok = await runPipeline(nextItem.qid);
        if (!ok) {
          const after = queueRef.current.find((q) => q.qid === nextItem.qid);
          if (after && after.status === "fehler") break;   // echter Fehler → Automatik anhalten
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    } finally { autoRunning.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const patchQ = (qid: string, patch: Partial<QueueItem> | ((q: QueueItem) => Partial<QueueItem>)) =>
    setQueue((p) => p.map((q) => q.qid === qid ? { ...q, ...(typeof patch === "function" ? patch(q) : patch) } : q));

  // Nächster Kanal mit freiem Kontingent (gesperrte Kanäle werden übersprungen)
  const pickSlot = (preferred: number): number => {
    const blocked = blockedSlots.current;
    for (let i = 0; i < 3; i++) {
      const s = (preferred + i) % 3;
      if (ytConns[s]?.enabled !== false && !(blocked[s] > Date.now())) return s;
    }
    return -1;
  };

  const runPipeline = async (qid: string): Promise<boolean> => {
    let item = queueRef.current.find((q) => q.qid === qid); if (!item) return false;
    const file = await getFile(qid);
    if (!file) { patchQ(qid, { status: "fehler", error: "Datei nach Reload nicht gefunden — bitte erneut auswählen." }); return false; }
    const ctrl = new AbortController(); abortRef.current.set(qid, ctrl);
    try {
      // ---- SCHRITT 1: Analyse zuerst (lokal & schnell) — Ziel-ID sofort sichtbar ----
      if (!item.ocrDone) {
        patchQ(qid, { status: "ocr", error: "", ocrProgress: 5, ocrResult: "Bannblock wird gesucht…" });
        const ocr = await runOcrOnFile(file, item.fileName, settings.adminId, settings.ocrFrames, settings.ocrLanguage,
          (p) => patchQ(qid, { ocrProgress: Math.min(90, 10 + Math.round((p.frame / p.frames) * 78)), ocrResult: `[${p.variant}] ${p.text.slice(0, 160)}` }));
        patchQ(qid, { ocrProgress: 94, ocrResult: "Bannscreen wird aufgenommen…" });
        const bannerAt = ocr.timestamps.banner ?? Math.max(0.2, (item.duration || 2) - 2);
        const photo = await captureFrameAt(file, bannerAt).catch(() => "");
        patchQ(qid, (q) => {
          const o = { ...q.ocr };
          for (const k of ["targetId", "reason", "sc", "server", "date", "discord"] as const) if (!o[k] && ocr.data[k]) (o as Record<string, unknown>)[k] = ocr.data[k];
          // Auto-Regeln auch bei OCR anwenden: Bann-Typen, Perma-Bann und Ergebnis
          if (o.reason) {
            if (!o.types?.length) o.types = autoTypes(o.reason);
            const ap = autoPerma(o.reason); if (ap !== undefined && !o.perma) o.perma = ap;
            if (!o.manualResult) o.manualResult = autoResult(o.reason);
          }
          o.timestamps = { ...ocr.timestamps, ...(o.timestamps || {}) };
          return { ocrProgress: 100, ocrDone: true, ocr: o, bannerPhoto: photo || q.bannerPhoto, ocrResult: ocr.raw.slice(0, 1500) || "Analyse abgeschlossen." };
        });
        const miss = getMissing({ ...item.ocr, ...ocr.data });
        push(miss.length ? "info" : "ok", miss.length
          ? `${item.fileName}: Analyse fertig — bitte prüfen: ${miss.join(", ")}.`
          : `${item.fileName}: ID ${ocr.data.targetId} · ${ocr.data.reason} erkannt.`);
        setExpanded((cur) => cur || qid);
        item = queueRef.current.find((q) => q.qid === qid) || item;
      }

      // ---- SCHRITT 2: YouTube-Upload (Kanalwechsel bei vollem Limit) ----
      let videoId = item.youtubeId, url = item.youtubeUrl;
      if (!videoId) {
        const title = buildFinalFilename({ ...item.ocr, date: item.ocr.date || dateFromFilename(item.fileName) });
        let slotIdx = pickSlot(item.ytSlot);
        let lastQuota = "";
        for (let tries = 0; tries < 3 && slotIdx >= 0; tries++) {
          const slot = ytConns[slotIdx];
          patchQ(qid, { status: "youtube-upload", error: "", progress: 0, ytSlot: slotIdx, youtubeStatus: `Kanal ${slotIdx + 1} · Upload startet…` });
          try {
            const r = await youtubeUpload(file, title, slotIdx, slot.accessToken || "", (pr) => patchQ(qid, { progress: pr.percent, youtubeStatus: pr.status }), ctrl.signal);
            videoId = r.videoId; url = r.url;
            patchQ(qid, { youtubeId: videoId, youtubeUrl: url, youtubeStatus: `Upload 100 % · Kanal ${slotIdx + 1}`, progress: 100, status: "youtube-wartet", processingStatus: "uploaded" });
            const proc = await youtubeWaitProcessing(videoId, slot.accessToken || "", r.simulated, (s) => patchQ(qid, { processingStatus: s }), ctrl.signal);
            if (proc === "failed") throw new Error("YouTube meldet: Verarbeitung fehlgeschlagen.");
            break;
          } catch (err) {
            if (err instanceof YtQuotaError) {
              lastQuota = err.message;
              blockedSlots.current[slotIdx] = Date.now() + 30 * 60 * 1000;  // 30 Min sperren
              const nextSlot = pickSlot(slotIdx + 1);
              if (nextSlot < 0) { slotIdx = -1; break; }
              push("info", `${err.message} → wechsle auf Kanal ${nextSlot + 1}.`);
              slotIdx = nextSlot;
              continue;
            }
            throw err;
          }
        }
        if (!videoId) throw new Error(lastQuota ? `${lastQuota} Alle Kanäle ausgelastet — POV bleibt in der Warteschlange (Analyse ist gespeichert).` : "Kein YouTube-Kanal verfügbar.");
      }
      patchQ(qid, (q) => ({ status: "fertig", ocr: { ...q.ocr, proof: q.ocr.proof || url } }));
      saveQueueMeta(queueRef.current.map((q) => q.qid === qid ? { ...q, status: "fertig", youtubeId: videoId, youtubeUrl: url } : q));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      patchQ(qid, msg.includes("abgebrochen") || msg === "aborted" ? { status: "wartet", error: "Abgebrochen.", progress: 0 } : { status: "fehler", error: msg });
      push("err", `${item.fileName}: ${msg}`);
      return false;
    } finally { abortRef.current.delete(qid); }
  };

  const saveQueueItem = async (qid: string, next: boolean) => {
    let item = queueRef.current.find((q) => q.qid === qid); if (!item) return;
    setBusy(qid);
    try {
      if (!item.youtubeId) {
        const ok = await runPipeline(qid);
        if (!ok) return;
        item = queueRef.current.find((q) => q.qid === qid)!;
      }
      const file = await getFile(qid);
      const id = uid("pov"); const now = Date.now(); const o = item.ocr;
      const base: PovEntry = {
        id, targetId: String(o.targetId || "").trim(), reason: String(o.reason || "").trim(), manualResult: String(o.manualResult || "").trim(),
        sc: String(o.sc || "").trim(), rid: "", server: o.server || settings.serverDefault, date: o.date || dateFromFilename(item.fileName) || todayISO(),
        discord: String(o.discord || "").trim(), proof: o.proof || item.youtubeUrl, youtubeId: item.youtubeId, youtubeUrl: item.youtubeUrl,
        youtubeTitle: "", filename: "", origFilename: item.fileName, filesize: item.fileSize, sourceType: item.fileType || "video/mp4", duration: item.duration || 0,
        types: o.types || [], perma: !!o.perma, permaArchive: !!o.permaArchive, notBanned: !!o.notBanned, documentStatus: o.documentStatus || DOCUMENT_STATUS[0],
        pcCheckers: (o.pcCheckers && o.pcCheckers.length ? o.pcCheckers : [PC_CHECKER_LEAD]).filter(Boolean), timestamps: o.timestamps || {}, ytSlot: item.ytSlot + 1,
        result: "OFFEN", status: "", family: "", note: "", hasVideo: !!file, createdAt: now, updatedAt: now, quality: entryQuality(o), ocrRaw: item.ocrResult.slice(0, 2000), adminId: settings.adminId,
      };
      const filename = buildFinalFilename(base);
      const entry: PovEntry = { ...base, filename, youtubeTitle: filename, result: deriveResult(base), status: getMissing(base).length ? `unvollständig: ${getMissing(base).join(", ")}` : "vollständig" };
      // 1) Video dauerhaft  2) Thumbnail  3) Meta  4) verifizieren  5) Queue bereinigen
      if (file) await putVideo(id, file, { name: filename });
      if (item.thumbUrl) { try { await putVideo("thumb_" + id, await (await fetch(item.thumbUrl)).blob(), { thumb: true }); } catch { /* egal */ } }
      if (item.bannerPhoto) { try { await savePhoto(id, item.bannerPhoto); } catch { /* egal */ } }
      const nextEntries = [entry, ...entriesRef.current];
      saveMeta(nextEntries); saveRecord(entry);
      const okMeta = loadMeta().some((e) => e.id === id); const okVideo = file ? await hasVideo(id) : true;
      if (!okMeta || !okVideo) throw new Error("Verifizierung fehlgeschlagen — Eintrag NICHT als gespeichert markiert.");
      try { await delVideo("q_" + qid); } catch { /* ok */ }
      filesRef.current.delete(qid);
      setEntries(nextEntries);
      const rest = queueRef.current.filter((q) => q.qid !== qid); setQueue(rest); saveQueueMeta(rest);
      push("ok", `Gespeichert: ${filename}${entry.permaArchive ? " · POV-Archiv" : " · unter „Alle“"}.`);
      void driveBackup("POV gespeichert").then((r) => setDriveMsg(r.msg));
      if (item.youtubeId) void youtubeSetTitle(item.youtubeId, filename, ytConns[item.ytSlot]?.accessToken || "");
      const idx = queueRef.current.findIndex((q) => q.qid === qid);
      setExpanded(next && rest.length ? (rest[Math.min(idx, rest.length - 1)] || rest[0]).qid : "");
      if (next && !rest.length) { setView("archive"); push("info", "Warteschlange abgearbeitet."); }
    } catch (e) {
      push("err", `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(""); }
  };

  // ---------- CSV ----------
  const csvFiltered = useMemo(() => sortCsv(applyCsvFilters(entries, { active: csvActive, search: csvSearch, from: csvFrom, to: csvTo }), csvSort), [entries, csvActive, csvSearch, csvFrom, csvTo, csvSort]);
  const exportCSV = () => {
    const blob = new Blob([toCSV(csvFiltered)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `grandrp-povs-${csvFiltered.length}-${todayISO()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    push("ok", `CSV exportiert: ${csvFiltered.length} Einträge (nur gefilterte).`);
  };

  // ---------- Login ----------
  const changeOwnPassword = async (username: string, oldPw: string, newPw: string): Promise<string> => {
    const users = loadUsers(); const me = users.find((x) => x.u.toLowerCase() === username.toLowerCase());
    if (!me) return "Benutzer nicht gefunden.";
    if ((await sha256(me.salt + "::" + oldPw)) !== me.p) return "Aktuelles Passwort ist falsch.";
    if (newPw.length < 8) return "Neues Passwort muss mindestens 8 Zeichen haben.";
    if (newPw === DEFAULT_PW) return "Das Standardpasswort darf nicht beibehalten werden.";
    if (!/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) return "Neues Passwort braucht Buchstaben und Zahlen.";
    if (newPw === oldPw) return "Neues Passwort muss sich vom alten unterscheiden.";
    if (newPw.toLowerCase().includes(username.toLowerCase())) return "Passwort darf den Benutzernamen nicht enthalten.";
    const salt = uid("s"); const hash = await sha256(salt + "::" + newPw);
    saveUsers(users.map((x) => x.u === me.u ? { ...x, p: hash, salt, mustChange: false } : x));
    await unlockVault(me.u, newPw);
    return "";
  };
  const doLogin = async () => {
    const lock = lockStatus();
    if (lock.locked) { push("err", `Konto gesperrt. Nochmal in ${formatRemain(lock.remainMs)}.`); return; }
    const users = loadUsers();
    const found = users.find((x) => x.u.toLowerCase() === loginU.trim().toLowerCase());
    const h = found ? await sha256(found.salt + "::" + loginP) : "";
    if (!found || h !== found.p) {
      const f = noteLoginFail();
      push("err", f.locked ? `Zu viele Fehlversuche. Gesperrt für ${formatRemain(f.remainMs)}.` : `Benutzername oder Passwort falsch (${f.fails}/5).`);
      return;
    }
    await unlockVault(found.u, loginP); noteLoginOk(); saveSession(found.u); setUser(found.u); setLoginP("");
    if (found.mustChange) { setForceChange(true); push("info", "Standardpasswort erkannt — bitte jetzt ein eigenes Passwort setzen."); return; }
    push("ok", `Angemeldet als ${found.u}. Tresor entsperrt.`);
    void driveBackup("login").then((r) => setDriveMsg(r.msg));
  };

  // ============================== RENDER ==============================
  if (!booted) {
    return (
      <div className="flex h-full items-center justify-center bg-[#070b14]">
        <div className="text-center"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-500/30 border-t-amber-500" /><p className="text-sm text-slate-400">Lade persistenten Speicher… ({META_KEY})</p></div>
      </div>
    );
  }
  if (settings.loginRequired && !user) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#070b14] p-6" style={{ backgroundImage: "radial-gradient(800px 400px at 20% 10%, rgba(245,158,11,.12), transparent), radial-gradient(800px 400px at 90% 90%, rgba(236,72,153,.08), transparent)" }}>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1424]/90 p-8 shadow-2xl fade-up">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-xl font-black text-black">DC</div>
            <div><h1 className="text-xl font-black tracking-tight">Grand RP · DC Checker</h1><p className="text-xs text-slate-400">POV · OCR · YouTube · {APP_VERSION}</p></div>
          </div>
          <h2 className="mb-1 text-lg font-bold">Sicherer Zugang</h2>
          <p className="mb-5 text-xs text-slate-400">Passwort nur als Hash gespeichert; daraus entsteht der AES-256-Tresor-Schlüssel. Nach 5 Fehlversuchen 15 Minuten Sperre.</p>
          <div className="space-y-3">
            <Field label="Benutzername"><input className={inputCls} value={loginU} onChange={(e) => setLoginU(e.target.value)} placeholder="Benutzername" autoComplete="username" /></Field>
            <Field label="Passwort"><input className={inputCls} type="password" value={loginP} onChange={(e) => setLoginP(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void doLogin()} placeholder="••••••••" autoComplete="current-password" /></Field>
            <button className={`${btnPrimary} w-full justify-center`} onClick={() => void doLogin()}><KeyRound size={16} /> Anmelden</button>
            <p className="text-center text-[11px] text-slate-500">Lokal dauerhaft · AES-256-Tresor · kompatibel mit dem alten Archiv</p>
          </div>
        </div>
        <Toasts toasts={toasts} />
      </div>
    );
  }

  const titles: Record<View, { t: string; d: string }> = {
    archive: { t: "Archiv", d: `${counts.alle} aktiv · ${counts.archiv} im POV-Archiv · ${entries.length} gesamt` },
    cases: { t: "Verdachtsfälle", d: `Fehlende oder widersprüchliche Informationen · ${casesList.length}` },
    upload: { t: "POVs hochladen", d: "Mehrere Aufnahmen gleichzeitig verarbeiten" },
    csv: { t: "CSV erstellen", d: "Proof · Datum · ID · SOC · RID · Discord ID · Familie · Ergebnis · Grund · Admin 1–5" },
    settings: { t: "Einstellungen", d: "OCR · PC-Checker · YouTube ×3 · Tresor · ACP · Benutzer" },
  };
  const filters: Array<{ id: ArchiveFilter; label: string; count: number }> = [
    { id: "alle", label: "Alle", count: counts.alle }, { id: "bans", label: "Bans", count: counts.bans }, { id: "pc", label: "PC-Checks", count: counts.pc },
    { id: "verweigert", label: "Verweigert", count: counts.verweigert }, { id: "soc", label: "Soc-Ban", count: counts.soc }, { id: "hard", label: "Hardbann", count: counts.hard },
    { id: "cheater", label: "Cheater", count: counts.cheater }, { id: "negativ", label: "Negativ", count: counts.negativ }, { id: "ohne-video", label: "Ohne Video", count: counts.ohneVideo },
    { id: "archiv", label: "POV Archiv", count: counts.archiv }, { id: "doppelt", label: "Doppelte IDs", count: counts.doppelt },
  ];
  const nav = [
    { id: "archive" as View, label: "Archiv", icon: <Archive size={17} />, n: entries.length },
    { id: "cases" as View, label: "Verdachtsfälle", icon: <AlertTriangle size={17} />, n: casesList.length, alert: casesList.length > 0 },
    { id: "upload" as View, label: "POVs hochladen", icon: <Upload size={17} />, n: queue.length },
    { id: "csv" as View, label: "CSV erstellen", icon: <FileSpreadsheet size={17} /> },
    { id: "settings" as View, label: "Einstellungen", icon: <SettingsIcon size={17} /> },
  ];

  return (
    <div className="flex h-full bg-[#070b14] text-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-[#0a101f]">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-lg font-black text-black">DC</div>
            <div><p className="text-sm font-black leading-tight">Archiv</p><p className="text-[11px] text-slate-400">Grand RP · DC Checker</p></div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((it) => (
            <button key={it.id} onClick={() => setView(it.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${view === it.id ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30" : "text-slate-300 hover:bg-white/5"}`}>
              <span className={view === it.id ? "text-amber-400" : "text-slate-400"}>{it.icon}</span><span className="flex-1 text-left">{it.label}</span>
              {typeof it.n === "number" && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tick ${it.alert ? "bg-red-500/20 text-red-300" : "bg-white/10 text-slate-300"}`}>{it.n}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
            <div className="flex items-center gap-2"><span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" /><p className="text-xs font-black">DC Checker</p><span className="ml-auto text-[10px] font-bold text-slate-500">{APP_VERSION}</span></div>
            <p className="mt-1 text-[11px] text-slate-400">POV · OCR · YouTube</p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500"><Database size={11} /><span className="truncate">{entries.length} lokal · {drive.connected || drive.gistToken ? "Tresor ●" : "nur dieser PC"}</span></div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a101f]/90 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0"><h1 className="text-lg font-black leading-tight">{titles[view].t}</h1><p className="truncate text-xs text-slate-400">{titles[view].d}</p></div>
            <div className="mx-auto flex w-full max-w-md items-center gap-2">
              <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input className={`${inputCls} pl-9`} placeholder="ID, SOC/SC oder Grund suchen…" value={search} onChange={(e) => { setSearch(e.target.value); if (view !== "archive") setView("archive"); }} /></div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone="amber">{APP_VERSION}</Badge>
              <span className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold md:inline-flex"><User size={13} /> {user || "Gast"} · Administrator</span>
              <button className={btnGhost} title="Abmelden" onClick={() => { lockVault(); saveSession(""); setUser(""); }}><LogOut size={15} /><span className="hidden lg:inline">Abmelden</span></button>
              <button className={btnGhost} title="Neu laden (aus persistentem Speicher)" onClick={() => void reloadFromDisk()}><RefreshCw size={15} /><span className="hidden lg:inline">Neu laden</span></button>
              <button className={btnGhost} onClick={() => setView("csv")}><FileSpreadsheet size={15} /><span className="hidden lg:inline">CSV erstellen</span></button>
              <button className={btnPrimary} onClick={() => setNewOpen(true)}><Plus size={15} /> Neuer Eintrag</button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          {!drive.connected && !drive.gistToken && view !== "settings" && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs">
              <Shield size={16} className="shrink-0 text-amber-400" />
              <p className="min-w-0 flex-1 text-slate-200"><b>Dauerhaft auf diesem PC.</b> Für einen Notfall-PC: Einstellungen → Tresor (Google Drive oder GitHub-Gist, AES-256). Altes Drive-Backup dort importierbar.</p>
              <button className={btnGhost + " !py-1.5"} onClick={() => setView("settings")}>Tresor öffnen</button>
            </div>
          )}
          {view === "archive" && <ArchiveView filters={filters} archiveFilter={archiveFilter} setArchiveFilter={setArchiveFilter} list={archiveList} dupIds={dupIds} selected={selected} setSelected={setSelected}
            onArchive={doArchive} onDelete={doDelete} onDetail={setDetail} onEdit={setEditing} onPlay={openVideo} onSc={(e) => openAcp(e.targetId, e.id)} />}
          {view === "cases" && <CasesView list={casesList} onEdit={setEditing} onDetail={setDetail} onDelete={doDelete} onSc={(e) => openAcp(e.targetId, e.id)} />}
          {view === "upload" && <UploadView queue={queue} ytConns={ytConns} busy={busy} expanded={expanded} setExpanded={setExpanded} pool={pool} onAddPool={addPool}
            acpStatus={Object.fromEntries(queue.map((q) => [q.qid, acpStatus[q.qid] || acpStatus[q.ocr.targetId || ""] || ""]))}
            onFiles={addFiles} onRun={(qid) => void runPipeline(qid)} onAbort={(qid) => abortRef.current.get(qid)?.abort()} onSave={(qid, n) => void saveQueueItem(qid, n)}
            onRemove={(qid) => { if (!window.confirm("POV aus der Warteschlange entfernen?")) return; abortRef.current.get(qid)?.abort(); filesRef.current.delete(qid); void delVideo("q_" + qid).catch(() => undefined); const rest = queueRef.current.filter((q) => q.qid !== qid); setQueue(rest); saveQueueMeta(rest); if (expanded === qid) setExpanded(""); }}
            onPatch={(qid, patch) => patchQ(qid, patch)} onPatchOcr={(qid, patch) => patchQ(qid, (q) => ({ ocr: { ...q.ocr, ...patch } }))}
            onAcp={(q) => openAcp(q.ocr.targetId || "", q.qid)} getFile={getFile}
            onRecapture={(qid, sec) => { void getFile(qid).then((f) => f && captureFrameAt(f, sec).then((d) => { if (d) patchQ(qid, { bannerPhoto: d }); })); }} />}
          {view === "csv" && <CsvView entries={entries} filtered={csvFiltered} active={csvActive} setActive={setCsvActive} search={csvSearch} setSearch={setCsvSearch} from={csvFrom} setFrom={setCsvFrom} to={csvTo} setTo={setCsvTo} sort={csvSort} setSort={setCsvSort} onExport={exportCSV} push={push} />}
          {view === "settings" && <SettingsView settings={settings} setSettings={(s) => { setSettings(s); saveSettings(s); }} ytConns={ytConns} setYtConns={(c) => { setYtConns(c); saveYT(c); }}
            drive={drive} setDrive={(d) => { setDrive(d); saveDrive(d); }} entries={entries} setEntries={(e) => persist(e, "Daten importiert")} push={push}
            driveMsg={driveMsg} setDriveMsg={setDriveMsg} bridgeToken={bridgeToken} onChangePassword={changeOwnPassword} username={user} onPoolChanged={() => setPool(checkerPool())} />}
        </main>
      </div>

      {detail && <DetailModal entry={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} onPlay={() => void openVideo(detail)} dup={dupIds.has(detail.targetId)} />}
      {editing && <EditModal entry={editing} onClose={() => setEditing(null)} onSave={saveEditedEntry} pool={pool} onAddPool={addPool} acpStatus={acpStatus[editing.id] || acpStatus[editing.targetId]} onAcp={(e) => openAcp(e.targetId, editing.id)} />}
      {videoPlay && <VideoModal entry={videoPlay.entry} url={videoPlay.url} onClose={() => { URL.revokeObjectURL(videoPlay.url); setVideoPlay(null); }} />}
      {newOpen && <NewEntryModal onClose={() => setNewOpen(false)} serverDefault={settings.serverDefault} pool={pool} onAddPool={addPool}
        onSave={(e) => {
          const now = Date.now();
          const entry: PovEntry = { ...e, id: uid("pov"), hasVideo: false, createdAt: now, updatedAt: now, quality: entryQuality(e), result: deriveResult(e), youtubeTitle: e.filename, youtubeId: e.youtubeId || (e.youtubeUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/) || [])[1] || "" };
          persist([entry, ...entries], "Neuer Eintrag"); setNewOpen(false);
          push("ok", `Eintrag gespeichert${entry.permaArchive ? " (POV-Archiv)" : " unter „Alle“"}.`);
        }} />}
      {forceChange && user && <ForceChangeModal username={user} onChange={changeOwnPassword}
        onDone={() => { setForceChange(false); push("ok", "Passwort geändert. Tresor-Schlüssel auf neues Passwort umgestellt."); }}
        onLogout={() => { lockVault(); saveSession(""); setUser(""); setForceChange(false); }} />}
      <Toasts toasts={toasts} />
    </div>
  );
}
