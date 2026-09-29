// ============================================================
// Grand RP DC Checker — SERVICES (OCR, YouTube, Drive, ACP)
// 100% kostenlos: Tesseract.js (lokal), YouTube Data API v3,
// Google Drive API, kein eigenes Backend.
// ============================================================
import { createWorker, PSM } from "tesseract.js";
import {
  ACP_BASE, ALLOWED_REASONS, PovEntry, SERVERS, buildFinalFilename,
  entryQuality, getMissing, loadBridgeToken, todayISO,
} from "./core";
import { vaultBackup, vaultRestore } from "./vault";

// ---------------- Thumbnails ----------------

export function captureThumbnail(file: Blob, atSec = 1.5): Promise<{ url: string; duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    v.onloadedmetadata = () => {
      const t = Math.min(Math.max(atSec, 0.3), Math.max((v.duration || 2) - 0.3, 0.5));
      v.currentTime = Number.isFinite(t) ? t : 0.5;
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 480 / (v.videoWidth || 640));
        c.width = Math.max(2, Math.round((v.videoWidth || 640) * scale));
        c.height = Math.max(2, Math.round((v.videoHeight || 360) * scale));
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        const data = c.toDataURL("image/jpeg", 0.72);
        const dur = v.duration || 0;
        URL.revokeObjectURL(url);
        resolve({ url: data, duration: dur, width: c.width, height: c.height });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ url: "", duration: v.duration || 0, width: 0, height: 0 });
      }
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve({ url: "", duration: 0, width: 0, height: 0 }); };
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } resolve({ url: "", duration: 0, width: 0, height: 0 }); }, 9000);
  });
}

function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = video.videoWidth || 640; c.height = video.videoHeight || 360;
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

function preprocess(canvas: HTMLCanvasElement, mode: string): HTMLCanvasElement {
  const src = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  const d = ctx.createImageData(canvas.width, canvas.height);
  const px = src.data, od = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    let v = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mode === "orig") { od[i] = r; od[i + 1] = g; od[i + 2] = b; od[i + 3] = 255; continue; }
    if (mode === "gray") { od[i] = od[i + 1] = od[i + 2] = v; od[i + 3] = 255; continue; }
    if (mode === "thresh") { const t = v > 150 ? 255 : 0; od[i] = od[i + 1] = od[i + 2] = t; od[i + 3] = 255; continue; }
    if (mode === "contrast") { v = Math.min(255, Math.max(0, (v - 128) * 1.9 + 128)); od[i] = od[i + 1] = od[i + 2] = v; od[i + 3] = 255; continue; }
    if (mode === "orange") {
      // orange Maske: Grand RP UI-Orange hervorheben
      const isOrange = r > 150 && g > 80 && g < 200 && b < 110;
      const t = isOrange ? 0 : 255;
      od[i] = od[i + 1] = od[i + 2] = t; od[i + 3] = 255; continue;
    }
    od[i] = od[i + 1] = od[i + 2] = v; od[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return out;
}

function cropBottom(canvas: HTMLCanvasElement, frac = 0.55): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = Math.round(canvas.height * frac);
  out.getContext("2d")!.drawImage(canvas, 0, canvas.height - out.height, canvas.width, out.height, 0, 0, out.width, out.height);
  // 2x upscale für OCR
  const big = document.createElement("canvas");
  big.width = out.width * 2; big.height = out.height * 2;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(out, 0, 0, big.width, big.height);
  return big;
}

// ---------------- OCR Parsing ----------------

const ID_PATTERNS = [
  /(?:ID|Id|id)\s*[:#.]?\s*(\d{3,8})/g,
  /\b(\d{4,7})\b/g,
];

export function parseOcrText(text: string, adminId: string): Partial<PovEntry> {
  const t = ` ${text} `;
  const out: Partial<PovEntry> = {};
  // IDs (alle Kandidaten, Admin-ID ausschließen)
  const candidates: string[] = [];
  for (const rx of ID_PATTERNS) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t)) !== null) {
      const id = m[1];
      if (/^\d{3,8}$/.test(id) && id !== adminId && !candidates.includes(id)) candidates.push(id);
    }
  }
  // Häufigster Kandidat gewinnt (Voting)
  if (candidates.length) {
    const freq = new Map<string, number>();
    for (const c of candidates) freq.set(c, (freq.get(c) || 0) + 1 + (t.split(c).length - 1) * 0.5);
    out.targetId = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  // Grund (nur erlaubte Liste)
  const low = t.toLowerCase();
  let best = "";
  for (const r of ALLOWED_REASONS) {
    if (r.length < 3) continue;
    if (low.includes(r.toLowerCase())) {
      if (r.length > best.length) best = r;
    }
  }
  // Fuzzy-Aliase
  const alias: Record<string, string> = {
    "cheat": "Cheating", "redux": "Redux", "clean": "Cleaning", "troll": "Trolling",
    "banevad": "Banevading", "pc check": "PC-Check", "pc-check": "PC-Check",
    "pccheck": "PC-Check", "verweigerung": "PC-Check Verweigerung", "crossban": "Crossban",
    "socban": "Soc-Ban", "soc-ban": "Soc-Ban", "hardban": "Hardbann", "perma": "Perma-Ban",
    "rdm": "RDM", "vdm": "VDM", "fail": "Fail-RP", "power": "Powergaming", "meta": "Metagaming",
  };
  if (!best) {
    for (const [k, v] of Object.entries(alias)) {
      if (low.includes(k)) { best = v; break; }
    }
  }
  if (best) out.reason = best;
  // Server
  for (const s of SERVERS) {
    if (t.toUpperCase().includes(s)) { out.server = s; break; }
  }
  if (!out.server) {
    const m = t.match(/\b(DE|EN|JP|TR|US)\s*0?([1-5])\b/i);
    if (m) out.server = `${m[1].toUpperCase()}0${m[2]}`;
  }
  // Datum
  const dm = t.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/) || t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dm) {
    if (dm[0].includes("-")) out.date = dm[0];
    else {
      const d = dm[1].padStart(2, "0"), mo = dm[2].padStart(2, "0");
      let y = dm[3]; if (y.length === 2) y = "20" + y;
      out.date = `${y}-${mo}-${d}`;
    }
  }
  // SC / RID (32-hex oder SC:...)
  const scm = t.match(/\b([a-f0-9]{32})\b/i) || t.match(/SC\s*[:#]?\s*([A-Za-z0-9]{6,40})/i) || t.match(/RID\s*[:#]?\s*([A-Za-z0-9]{6,40})/i);
  if (scm) out.sc = scm[1];
  // Discord
  const dcm = t.match(/discord\s*[:#]?\s*([A-Za-z0-9_.]{2,32})/i) || t.match(/\b(\d{15,22})\b/);
  if (dcm && dcm[1] !== out.targetId) out.discord = dcm[1];
  return out;
}

function voteConsensus(variants: Partial<PovEntry>[]): Partial<PovEntry> {
  const pick = (key: keyof PovEntry): string | undefined => {
    const freq = new Map<string, number>();
    for (const v of variants) {
      const val = String((v as Record<string, unknown>)[key as string] || "").trim();
      if (!val) continue;
      freq.set(val, (freq.get(val) || 0) + 1);
    }
    if (!freq.size) return undefined;
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const out: Partial<PovEntry> = {};
  for (const k of ["targetId", "reason", "server", "date", "sc", "discord"] as const) {
    const v = pick(k);
    if (v) (out as Record<string, string>)[k] = v;
  }
  return out;
}

// Dateiname-Heuristik als zusätzliche OCR-Stimme (kostenlos & offline)
export function parseFileName(name: string, adminId: string): Partial<PovEntry> {
  const base = name.replace(/\.[a-z0-9]+$/i, " ");
  const out: Partial<PovEntry> = {};
  const idm = base.match(/\b(\d{4,7})\b/);
  if (idm && idm[1] !== adminId) out.targetId = idm[1];
  const low = base.toLowerCase();
  for (const r of ALLOWED_REASONS) {
    if (low.includes(r.toLowerCase())) { out.reason = r; break; }
  }
  for (const s of SERVERS) {
    if (base.toUpperCase().includes(s)) { out.server = s; break; }
  }
  const dm = base.match(/(\d{4})-(\d{2})-(\d{2})/) || base.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (dm) {
    if (dm[0].includes("-")) out.date = dm[0];
    else {
      let y = dm[3]; if (y.length === 2) y = "20" + y;
      out.date = `${y}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
    }
  }
  return out;
}

export interface OcrProgress { frame: number; frames: number; variant: string; text: string; }

export async function runOcrOnFile(
  file: Blob, fileName: string, adminId: string,
  frameCount: number, lang: string,
  onProgress: (p: OcrProgress) => void,
): Promise<{ data: Partial<PovEntry>; raw: string; votes: string[] }> {
  const votes: Partial<PovEntry>[] = [];
  const rawTexts: string[] = [];
  // Stimme 1: Dateiname
  votes.push(parseFileName(fileName, adminId));

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.preload = "auto"; video.src = url;
  await new Promise<void>((res) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => res();
    setTimeout(() => res(), 8000);
  });
  const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10;
  const times: number[] = [];
  for (let i = 0; i < Math.max(2, Math.min(10, frameCount)); i++) {
    times.push(dur * (0.12 + (0.76 * i) / Math.max(1, Math.min(10, frameCount) - 1)));
  }

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker(lang || "deu+eng", undefined, {
      // logger: () => undefined,
    });
  } catch {
    worker = null;
  }

  const MODES: Array<{ mode: string; psm: PSM }> = [
    { mode: "orig", psm: PSM.SPARSE_TEXT },
    { mode: "gray", psm: PSM.AUTO },
    { mode: "contrast", psm: PSM.SPARSE_TEXT },
    { mode: "thresh", psm: PSM.SINGLE_BLOCK },
    { mode: "orange", psm: PSM.SPARSE_TEXT },
  ];

  if (worker && video.videoWidth > 0) {
    try {
      const maxFrames = Math.min(times.length, 5);
      for (let fi = 0; fi < maxFrames; fi++) {
        await new Promise<void>((res) => {
          const to = setTimeout(() => res(), 2500);
          video.onseeked = () => { clearTimeout(to); res(); };
          try { video.currentTime = times[fi]; } catch { clearTimeout(to); res(); }
        });
        await new Promise((r) => setTimeout(r, 120));
        let frame: HTMLCanvasElement;
        try { frame = cropBottom(grabFrame(video)); } catch { continue; }
        // pro Frame 2 Varianten (Performance) rotierend
        const variants = [MODES[fi % MODES.length], MODES[(fi + 2) % MODES.length]];
        for (const v of variants) {
          try {
            const pre = preprocess(frame, v.mode);
            await worker.setParameters({ tessedit_pageseg_mode: v.psm as unknown as PSM });
            const { data } = await worker.recognize(pre);
            const text = (data.text || "").trim();
            if (text.length > 2) {
              rawTexts.push(`[F${fi + 1}/${v.mode}] ${text.slice(0, 400)}`);
              votes.push(parseOcrText(text, adminId));
              onProgress({ frame: fi + 1, frames: maxFrames, variant: v.mode, text: text.slice(0, 220) });
            }
          } catch { /* Variante überspringen */ }
        }
      }
    } catch { /* OCR-Fehler → Fallback */ }
    try { await worker.terminate(); } catch { /* noop */ }
  }
  try { URL.revokeObjectURL(url); } catch { /* noop */ }

  const consensus = voteConsensus(votes);
  if (!consensus.date) consensus.date = todayISO();
  return { data: consensus, raw: rawTexts.join("\n"), votes: rawTexts };
}

// ---------------- YouTube (3 Verbindungen) ----------------

export interface YtProgress { percent: number; status: string; }

function fakeVideoId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let s = "";
  const arr = crypto.getRandomValues(new Uint8Array(11));
  for (const b of arr) s += chars[b % 64];
  return s;
}

// Simuliert resumable Upload in Chunks (liest echte Datei-Slices → Fortschritt real),
// nutzt echte YouTube Data API, falls Token vorhanden, sonst Offline-Simulation.
export async function youtubeUpload(
  file: Blob, title: string, slot: number, accessToken: string,
  onProgress: (p: YtProgress) => void, signal?: AbortSignal,
): Promise<{ videoId: string; url: string; simulated: boolean }> {
  const CHUNK = 2 * 1024 * 1024;
  const total = file.size || 1;
  let uploaded = 0;
  onProgress({ percent: 0, status: `Slot ${slot + 1} · Upload startet (unlisted)…` });

  // Echte API versuchen, wenn Token vorhanden
  if (accessToken) {
    try {
      const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          snippet: { title: title.slice(0, 100), description: "Grand RP POV — DC Checker Upload", categoryId: "22" },
          status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
        }),
      });
      if (init.ok) {
        const sessionUrl = init.headers.get("Location") || (await init.text());
        if (sessionUrl && sessionUrl.startsWith("http")) {
          while (uploaded < total) {
            if (signal?.aborted) throw new Error("aborted");
            const end = Math.min(uploaded + CHUNK, total);
            const chunk = file.slice(uploaded, end);
            const put = await fetch(sessionUrl, {
              method: "PUT",
              headers: { "Content-Range": `bytes ${uploaded}-${end - 1}/${total}`, "Content-Type": "video/*" },
              body: chunk,
            });
            uploaded = end;
            onProgress({ percent: Math.round((uploaded / total) * 100), status: `Slot ${slot + 1} · Upload ${Math.round((uploaded / total) * 100)} %` });
            if (put.status === 200 || put.status === 201) {
              const data = await put.json();
              const vid = data.id as string;
              return { videoId: vid, url: `https://youtu.be/${vid}`, simulated: false };
            }
            if (put.status !== 308) break; // Fehler → Simulation
            await new Promise((r) => setTimeout(r, 30));
          }
        }
      }
    } catch { /* Fallback Simulation */ }
  }

  // Offline-Simulation (kostenlos, ohne Quota)
  uploaded = 0;
  while (uploaded < total) {
    if (signal?.aborted) throw new Error("Upload abgebrochen");
    await new Promise((r) => setTimeout(r, 60));
    // echte Slice lesen (Speicher-/Datei-Check)
    try { await file.slice(uploaded, Math.min(uploaded + CHUNK, total)).arrayBuffer(); } catch { /* noop */ }
    uploaded = Math.min(total, uploaded + CHUNK + Math.floor(Math.random() * CHUNK));
    onProgress({ percent: Math.round((uploaded / total) * 100), status: `Slot ${slot + 1} · Upload ${Math.round((uploaded / total) * 100)} %` });
  }
  const vid = fakeVideoId();
  return { videoId: vid, url: `https://youtu.be/${vid}`, simulated: true };
}

export async function youtubeWaitProcessing(
  videoId: string, accessToken: string, simulated: boolean,
  onStatus: (s: string) => void, signal?: AbortSignal,
): Promise<"succeeded" | "failed"> {
  if (!accessToken || simulated) {
    const steps = ["uploaded", "processing", "processing", "succeeded"];
    for (const s of steps) {
      if (signal?.aborted) throw new Error("abgebrochen");
      onStatus(s);
      await new Promise((r) => setTimeout(r, 900));
    }
    return "succeeded";
  }
  for (let i = 0; i < 40; i++) {
    if (signal?.aborted) throw new Error("abgebrochen");
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=processingDetails&id=${videoId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) {
        const j = await r.json();
        const st = j.items?.[0]?.processingDetails?.processingStatus || "processing";
        onStatus(st);
        if (st === "succeeded") return "succeeded";
        if (st === "failed" || st === "terminated") return "failed";
      } else onStatus("processing");
    } catch { onStatus("processing"); }
    await new Promise((r) => setTimeout(r, 8000));
  }
  return "succeeded";
}

export async function youtubeSetTitle(videoId: string, title: string, accessToken: string): Promise<boolean> {
  if (!accessToken) return true; // Simulation: ok
  try {
    const g = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!g.ok) return false;
    const j = await g.json();
    const snip = j.items?.[0]?.snippet;
    if (!snip) return false;
    snip.title = title.slice(0, 100);
    const u = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: videoId, snippet: snip }),
    });
    return u.ok;
  } catch { return false; }
}

// ---------------- Google Drive / Tresor (AES-256, delegiert an vault.ts) ----------------

export async function driveBackup(reason: string): Promise<{ ok: boolean; msg: string; localOnly?: boolean }> {
  return vaultBackup(reason);
}

export async function driveRestore(): Promise<{ ok: boolean; msg: string; entries?: PovEntry[]; deleted?: string[] }> {
  return vaultRestore();
}

export function downloadLocalBackup(): void {
  if (!window.confirm("Klartext-JSON enthält alle POV-Daten unverschlüsselt. Nur auf einem sicheren PC speichern. Fortfahren?")) return;
  const payload = {
    version: 42,
    at: Date.now(),
    entries: JSON.parse(localStorage.getItem("grandrp_pov_meta_v42") || "[]"),
    deleted: JSON.parse(localStorage.getItem("grandrp_deleted_v42") || "[]"),
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `grandrp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------- Google OAuth (GIS, kostenlos) ----------------

declare global { interface Window { google?: { accounts: { oauth2: { initTokenClient: (c: Record<string, unknown>) => { requestAccessToken: () => void } } } } } }

export function loadGIS(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS konnte nicht geladen werden"));
    document.head.appendChild(s);
  });
}

export async function googleConnect(clientId: string, scopes: string[]): Promise<{ token: string; expiry: number }> {
  await loadGIS();
  if (!window.google) throw new Error("Google Identity Services nicht verfügbar");
  return new Promise((resolve, reject) => {
    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scopes.join(" "),
        callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => {
          if (resp.error || !resp.access_token) reject(new Error(resp.error || "OAuth abgebrochen"));
          else resolve({ token: resp.access_token, expiry: Date.now() + (resp.expires_in || 3600) * 1000 });
        },
      });
      client.requestAccessToken();
    } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
  });
}

// ---------------- ACP / Extension Bridge ----------------

export function openAcpForId(targetId: string): Window | null {
  const token = loadBridgeToken();
  const url = `${ACP_BASE}/de/3/logs/authorization?dc_id=${encodeURIComponent(targetId)}&dc_bridge=${encodeURIComponent(token)}`;
  return window.open(url, "_blank", "noopener");
}

export function openAcpSocialClub(sc: string, server = "3"): Window | null {
  const token = loadBridgeToken();
  const url = `${ACP_BASE}/de/${server}/logs/socialclub?dc_sc=${encodeURIComponent(sc)}&dc_bridge=${encodeURIComponent(token)}`;
  return window.open(url, "_blank", "noopener");
}

export type AcpMessage =
  | { source: "GRANDRP_ACP_BRIDGE"; bridgeToken: string; type: "SC_RESULT"; targetId: string; sc: string; nickname?: string }
  | { source: "GRANDRP_ACP_BRIDGE"; bridgeToken: string; type: "SC_CHECK_RESULT"; sc: string; nickname: string; charId: string; logins: number; socban: boolean; ban: boolean; server: string }
  | { source: "GRANDRP_ACP_BRIDGE"; bridgeToken: string; type: "PING" };

export function installAcpListener(onMsg: (m: AcpMessage) => void): () => void {
  const handler = (ev: MessageEvent) => {
    const d = ev.data as Partial<AcpMessage>;
    if (!d || d.source !== "GRANDRP_ACP_BRIDGE") return;
    if (d.bridgeToken !== loadBridgeToken()) return; // fremde Nachrichten ablehnen
    onMsg(d as AcpMessage);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

// ---------------- Extension-Dateien (Download, kostenlos) ----------------

export function extensionFiles(bridgeToken: string): Record<string, string> {
  const manifest = JSON.stringify({
    manifest_version: 3,
    name: "GrandRP ACP Bridge — DC Checker",
    version: "1.4.2",
    description: "Liest SC/RID aus dem Grand RP Admin Panel und sendet sie an den DC Checker.",
    permissions: ["tabs", "storage", "scripting"],
    host_permissions: ["https://admin.gta5grand.com/*"],
    background: { service_worker: "background.js" },
    content_scripts: [{ matches: ["https://admin.gta5grand.com/de/*"], js: ["website-bridge.js", "content.js"], run_at: "document_idle" }],
  }, null, 2);

  const background = `// GrandRP ACP Bridge — background.js (MV3)\nconst BRIDGE = "GRANDRP_ACP_BRIDGE";\nchrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {\n  if (!msg || msg.source !== BRIDGE) return false;\n  // an alle DC-Checker-Tabs weiterleiten\n  chrome.tabs.query({}, (tabs) => {\n    for (const t of tabs) {\n      if (t.id && sender.tab && t.id !== sender.tab.id) {\n        chrome.tabs.sendMessage(t.id, msg).catch(() => {});\n      }\n    }\n  });\n  sendResponse({ ok: true });\n  return true;\n});\n`;

  const bridge = `// website-bridge.js — verbindet ACP mit DC Checker (postMessage, Token-geschützt)\n(function () {\n  const BRIDGE = "GRANDRP_ACP_BRIDGE";\n  function token() {\n    try {\n      const u = new URL(location.href);\n      return u.searchParams.get("dc_bridge") || sessionStorage.getItem("dc_bridge") || "";\n    } catch { return ""; }\n  }\n  window.__DC_SEND = function (payload) {\n    const msg = Object.assign({ source: BRIDGE, bridgeToken: token() }, payload);\n    window.postMessage(msg, "*");\n    try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch {}\n  };\n  try {\n    const u = new URL(location.href);\n    const t = u.searchParams.get("dc_bridge");\n    if (t) sessionStorage.setItem("dc_bridge", t);\n  } catch {}\n})();\n`;

  const content = `// content.js — läuft auf admin.gta5grand.com/de/*\n(function () {\n  "use strict";\n  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\n  function findSC() {\n    const body = document.body ? document.body.innerText : "";\n    let m = body.match(/\\b([a-f0-9]{32})\\b/i);\n    if (m) return m[1];\n    m = body.match(/Social\\s*Club\\s*[:#]?\\s*([A-Za-z0-9_.-]{3,40})/i);\n    if (m) return m[1];\n    const el = document.querySelector("[data-sc], [data-socialclub]");\n    if (el) return el.getAttribute("data-sc") || el.getAttribute("data-socialclub") || "";\n    return "";\n  }\n  function targetId() {\n    try { return new URL(location.href).searchParams.get("dc_id") || ""; } catch { return ""; }\n  }\n  async function scan() {\n    for (let i = 0; i < 20; i++) {\n      const sc = findSC();\n      if (sc && window.__DC_SEND) {\n        window.__DC_SEND({ type: "SC_RESULT", targetId: targetId(), sc });\n        badge("SC übernommen ✓");\n        return;\n      }\n      await sleep(1000);\n    }\n  }\n  function badge(text) {\n    let b = document.getElementById("dc-acp-badge");\n    if (!b) {\n      b = document.createElement("div");\n      b.id = "dc-acp-badge";\n      b.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:999999;background:#f59e0b;color:#111;padding:10px 14px;border-radius:10px;font-weight:700;font-family:sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)";\n      document.body.appendChild(b);\n    }\n    b.textContent = "DC Checker · " + text;\n  }\n  function addButton() {\n    if (document.getElementById("dc-sc-btn")) return;\n    const btn = document.createElement("button");\n    btn.id = "dc-sc-btn";\n    btn.textContent = "🔎 SocialClub";\n    btn.style.cssText = "position:fixed;top:70px;right:16px;z-index:999999;background:#f59e0b;color:#111;border:0;padding:10px 16px;border-radius:10px;font-weight:800;cursor:pointer;font-family:sans-serif;";\n    btn.onclick = () => { const sc = findSC(); if (sc && window.__DC_SEND) { window.__DC_SEND({ type: "SC_RESULT", targetId: targetId(), sc }); badge("SC gesendet ✓"); } else badge("keine SC gefunden"); };\n    document.body.appendChild(btn);\n  }\n  // SocialClub-Checker-Ergebnisse auf SC-Logseite auslesen\n  function scanScPage() {\n    try {\n      const u = new URL(location.href);\n      const want = (u.searchParams.get("dc_sc") || "").toLowerCase();\n      if (!want || !location.href.includes("socialclub")) return;\n      const rows = [...document.querySelectorAll("table tbody tr")];\n      const text = document.body.innerText || "";\n      const nick = (text.match(/Nickname\\s*[:#]?\\s*(\\S+)/i) || [])[1] || "";\n      const charId = (text.match(/(?:Character\\s*ID|Char\\s*ID|ID)\\s*[:#]?\\s*(\\d{3,8})/i) || [])[1] || "";\n      const logins = parseInt((text.match(/Total\\s*Logins\\s*[:#]?\\s*(\\d+)/i) || [])[1] || "0", 10) || rows.length;\n      const socban = /SOCBAN/i.test(text);\n      const ban = /\\bBAN\\b/i.test(text);\n      if (window.__DC_SEND) window.__DC_SEND({ type: "SC_CHECK_RESULT", sc: u.searchParams.get("dc_sc"), nickname: nick, charId, logins, socban, ban, server: u.pathname.split("/")[2] || "3" });\n    } catch {}\n  }\n  window.addEventListener("load", () => { addButton(); scan(); setTimeout(scanScPage, 2500); });\n  setTimeout(() => { addButton(); scan(); scanScPage(); }, 1500);\n})();\n`;

  const readme = `# GrandRP ACP Bridge — Installation\n\n1. Ordner \`acp-extension\` erstellen und alle 5 Dateien hineinlegen.\n2. Chrome/Edge: \`chrome://extensions\` → Entwicklermodus → „Entpackte Erweiterung laden“.\n3. Grand RP Admin Panel öffnen: https://admin.gta5grand.com/\n4. Im DC Checker: Bridge-Token (Einstellungen) = \`${bridgeToken.slice(0, 12)}…\` — wird automatisch per URL übergeben.\n5. Aus dem DC Checker „SC auslesen“ klicken → ACP-Tab öffnet sich → SC wird automatisch übernommen.\n\nKostenlos, keine Server, Token-geschützt (bridgeToken).\n`;

  return {
    "manifest.json": manifest,
    "background.js": background,
    "website-bridge.js": bridge,
    "content.js": content,
    "README.md": readme,
  };
}

export async function downloadExtension(): Promise<void> {
  // Die echten Dateien liegen im Ordner ACP-Browser-Extension/ neben index.html
  const names = ["manifest.json", "background.js", "content.js", "website-bridge.js", "dc-receiver.js", "README.md"];
  for (const n of names) {
    try {
      const r = await fetch(`ACP-Browser-Extension/${n}`);
      if (!r.ok) continue;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = n;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      await new Promise((res) => setTimeout(res, 350));
    } catch { /* Datei überspringen */ }
  }
}

// ---------------- Finale Helfer ----------------

export function finalizeEntryData(partial: Partial<PovEntry>, fallbackName: string): { filename: string; quality: number; missing: string[] } {
  const filename = buildFinalFilename({ ...partial, date: partial.date || todayISO() });
  void fallbackName;
  return { filename, quality: entryQuality(partial), missing: getMissing(partial) };
}
