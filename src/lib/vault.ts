// ============================================================
// Grand RP DC Checker — VERSCHLÜSSELTER TRESOR
// AES-256-GCM · PBKDF2 (180k) · Schlüssel nur im RAM / sessionStorage
// Cloud sieht ausschließlich Ciphertext. Ohne Login-Passwort unlesbar.
// ============================================================
import { loadDeleted, loadDrive, loadLastKnown, loadMeta, saveDrive, loadYT, loadSettings } from "./core";
import { denormalizeEntry } from "./legacy";

export const VAULT_LS = "grandrp_vault_enc_v42";
export const VAULT_IDB = "__vault_enc__";
export const VAULT_SESSION = "grandrp_vk_v42";
export const VAULT_SESSION_USER = "grandrp_vk_user_v42";
export const LOCK_KEY = "grandrp_lock_v42";
export const GIST_FILE = "grandrp-dc-vault.enc.json";
export const DRIVE_FILE_ENC = "grandrp-dc-checker-vault.enc.json";
export const DRIVE_FILE_OLD = "grandrp-dc-checker-backup.json";

const ITER = 180_000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

// Backup-Format = Format der alten App ("grandrp-cloud-archive" v3) + Zusatzfelder.
// Einträge liegen im alten Schema (unknown[]) — beide App-Versionen können die Datei lesen.
export interface VaultPayload {
  format?: string;
  version: number;
  backupType?: string;
  createdAt?: string;
  reason?: string;
  note?: string;
  at: number;
  entries: unknown[];
  deleted: string[];
  youtubeConnections?: Array<{ slot: number; clientId: string; connected?: boolean }>;
  settings?: Record<string, unknown>;
}

export interface Envelope {
  v: 1;
  alg: "AES-GCM";
  user: string;
  iv: string;
  ct: string;
  at: number;
  n: number;
}

let memKey: CryptoKey | null = null;
let memUser = "";

function b64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export async function deriveVaultKey(username: string, password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = enc.encode(`dc-checker-v42|${username.trim().toLowerCase()}|grandrp`);
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function unlockVault(username: string, password: string): Promise<void> {
  const key = await deriveVaultKey(username, password);
  memKey = key;
  memUser = username;
  const raw = await crypto.subtle.exportKey("raw", key);
  try {
    sessionStorage.setItem(VAULT_SESSION, b64(raw));
    sessionStorage.setItem(VAULT_SESSION_USER, username);
  } catch { /* private mode */ }
}

export function lockVault(): void {
  memKey = null;
  memUser = "";
  try {
    sessionStorage.removeItem(VAULT_SESSION);
    sessionStorage.removeItem(VAULT_SESSION_USER);
  } catch { /* noop */ }
}

export function vaultUser(): string {
  return memUser || (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(VAULT_SESSION_USER) || "" : "");
}

export async function restoreVaultKey(): Promise<boolean> {
  if (memKey) return true;
  try {
    const raw = sessionStorage.getItem(VAULT_SESSION);
    const user = sessionStorage.getItem(VAULT_SESSION_USER) || "";
    if (!raw || !user) return false;
    memKey = await crypto.subtle.importKey("raw", unb64(raw) as BufferSource, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    memUser = user;
    return true;
  } catch { return false; }
}

export function vaultUnlocked(): boolean {
  return !!memKey || (typeof sessionStorage !== "undefined" && !!sessionStorage.getItem(VAULT_SESSION));
}

export async function encryptPayload(payload: VaultPayload, user: string): Promise<Envelope> {
  if (!memKey) throw new Error("Tresor gesperrt — bitte neu anmelden.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, memKey, pt);
  return { v: 1, alg: "AES-GCM", user, iv: b64(iv), ct: b64(ct), at: Date.now(), n: payload.entries.length };
}

export async function decryptEnvelope(env: Envelope): Promise<VaultPayload> {
  if (!memKey) throw new Error("Tresor gesperrt — bitte neu anmelden.");
  const iv = unb64(env.iv);
  const ct = unb64(env.ct);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, memKey, ct as BufferSource);
    return JSON.parse(new TextDecoder().decode(pt)) as VaultPayload;
  } catch {
    throw new Error("Entschlüsselung fehlgeschlagen. Falsches Passwort oder beschädigte Datei.");
  }
}

export function isEnvelope(x: unknown): x is Envelope {
  if (!x || typeof x !== "object") return false;
  const o = x as Envelope;
  return o.v === 1 && o.alg === "AES-GCM" && typeof o.ct === "string" && typeof o.iv === "string";
}

export function buildVaultPayload(reason = "Archiv gespeichert"): VaultPayload {
  const s = loadSettings();
  return {
    format: "grandrp-cloud-archive",
    version: 3,
    backupType: "metadata-only",
    createdAt: new Date().toISOString(),
    reason,
    note: "Archiv-Metadaten, Proof-/YouTube-Links und sichere App-Einstellungen. Keine POV-Videodateien und keine OAuth-Tokens.",
    at: Date.now(),
    entries: loadMeta().map(denormalizeEntry),
    deleted: loadDeleted(),
    youtubeConnections: loadYT().map((y) => ({ slot: y.slot + 1, clientId: y.clientId, connected: !!y.accessToken && y.expiry > Date.now() })),
    settings: { frames: s.ocrFrames, serverDefault: s.serverDefault },
  };
}

export async function saveLocalEncrypted(env: Envelope): Promise<void> {
  const json = JSON.stringify(env);
  try { localStorage.setItem(VAULT_LS, json); } catch { /* quota */ }
  try { localStorage.removeItem("grandrp_local_snapshot_v42"); } catch { /* wipe old plaintext snapshot */ }
  try {
    const { putVideo } = await import("./core");
    await putVideo(VAULT_IDB, new Blob([json], { type: "application/json" }), { kind: "vault" });
  } catch { /* idb optional */ }
}

export async function loadLocalEncrypted(): Promise<Envelope | null> {
  const ls = localStorage.getItem(VAULT_LS);
  if (ls) {
    try { const j = JSON.parse(ls); if (isEnvelope(j)) return j; } catch { /* noop */ }
  }
  try {
    const { getVideo } = await import("./core");
    const blob = await getVideo(VAULT_IDB);
    if (blob) {
      const j = JSON.parse(await blob.text());
      if (isEnvelope(j)) return j;
    }
  } catch { /* noop */ }
  return null;
}

// ---------------- Login-Sperre ----------------

export function lockStatus(): { locked: boolean; fails: number; until: number; remainMs: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCK_KEY) || "{}") as { fails?: number; until?: number };
    const until = raw.until || 0;
    const locked = until > Date.now();
    return { locked, fails: raw.fails || 0, until, remainMs: Math.max(0, until - Date.now()) };
  } catch {
    return { locked: false, fails: 0, until: 0, remainMs: 0 };
  }
}

export function noteLoginFail(): { locked: boolean; remainMs: number; fails: number } {
  const cur = lockStatus();
  if (cur.locked) return cur;
  const fails = cur.fails + 1;
  const until = fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
  localStorage.setItem(LOCK_KEY, JSON.stringify({ fails, until }));
  return { locked: until > Date.now(), remainMs: Math.max(0, until - Date.now()), fails };
}

export function noteLoginOk(): void {
  localStorage.removeItem(LOCK_KEY);
}

export function formatRemain(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} min ${r} s` : `${r} s`;
}

// ---------------- GitHub Gist (kostenlos, secret, verschlüsselt) ----------------

async function gistHeaders(token: string): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function gistSave(env: Envelope, token: string, gistId: string): Promise<string> {
  const body = {
    description: "GrandRP DC Checker Vault (AES-256-GCM, nicht im Klartext)",
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(env) } },
  };
  if (gistId) {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH", headers: await gistHeaders(token), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Gist-Update ${r.status}`);
    return gistId;
  }
  const r = await fetch("https://api.github.com/gists", {
    method: "POST", headers: await gistHeaders(token), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gist-Anlage ${r.status} — Token braucht Recht „gist“.`);
  const j = await r.json();
  return j.id as string;
}

export async function gistLoad(token: string, gistId: string): Promise<Envelope | VaultPayload | null> {
  if (!token) return null;
  let id = gistId;
  if (!id) {
    const r = await fetch("https://api.github.com/gists?per_page=50", { headers: await gistHeaders(token) });
    if (!r.ok) throw new Error(`Gist-Liste ${r.status}`);
    const list = await r.json() as Array<{ id: string; files: Record<string, unknown> }>;
    const hit = list.find((g) => g.files && GIST_FILE in g.files);
    if (!hit) return null;
    id = hit.id;
  }
  const r = await fetch(`https://api.github.com/gists/${id}`, { headers: await gistHeaders(token) });
  if (!r.ok) throw new Error(`Gist-Lesen ${r.status}`);
  const j = await r.json();
  const file = j.files?.[GIST_FILE] || j.files?.[DRIVE_FILE_OLD] || Object.values(j.files || {})[0] as { content?: string; raw_url?: string } | undefined;
  let text = file && "content" in file ? (file as { content?: string }).content : "";
  if (!text && file && (file as { raw_url?: string }).raw_url) {
    const rr = await fetch((file as { raw_url: string }).raw_url);
    text = await rr.text();
  }
  if (!text) return null;
  return JSON.parse(text) as Envelope | VaultPayload;
}

// ---------------- Drive (verschlüsselt) ----------------

async function drivePutEnc(env: Envelope, cfg: { accessToken: string; fileId: string; folderId: string }): Promise<string> {
  const blob = new Blob([JSON.stringify(env)], { type: "application/json" });
  const metadata: Record<string, unknown> = { name: DRIVE_FILE_ENC, mimeType: "application/json" };
  if (!cfg.fileId && cfg.folderId) metadata.parents = [cfg.folderId];
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
  form.append("media", blob, DRIVE_FILE_ENC);
  if (cfg.fileId) {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${cfg.fileId}?uploadType=multipart`, {
      method: "PATCH", headers: { Authorization: `Bearer ${cfg.accessToken}` }, body: form,
    });
    if (!r.ok) throw new Error(`Drive-Update ${r.status}`);
    return cfg.fileId;
  }
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST", headers: { Authorization: `Bearer ${cfg.accessToken}` }, body: form,
  });
  if (!r.ok) throw new Error(`Drive-Upload ${r.status}`);
  const j = await r.json();
  return j.id as string;
}

async function driveGetJson(accessToken: string, fileId: string): Promise<unknown> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Drive-Download ${r.status}`);
  return r.json();
}

async function driveFind(accessToken: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name}' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.files?.[0]?.id as string) || null;
}

export async function decodeCloudObject(obj: unknown): Promise<VaultPayload> {
  if (isEnvelope(obj)) return decryptEnvelope(obj);
  // altes Klartext-Backup der alten App ("grandrp-cloud-archive") oder eigenes Format
  if (obj && typeof obj === "object" && Array.isArray((obj as VaultPayload).entries)) {
    const p = obj as VaultPayload;
    return { ...p, deleted: Array.isArray(p.deleted) ? p.deleted : [], at: p.at || Date.parse(p.createdAt || "") || Date.now() };
  }
  if (Array.isArray(obj)) return { version: 3, at: Date.now(), entries: obj, deleted: [] };
  throw new Error("Unbekanntes Backup-Format.");
}

let backupRunning = false;
let backupPending: string | null = null;

export async function vaultBackup(reason: string): Promise<{ ok: boolean; msg: string; localOnly?: boolean }> {
  if (backupRunning) { backupPending = reason; return { ok: true, msg: "Backup läuft — als pending markiert." }; }
  backupRunning = true;
  try {
    const payload = buildVaultPayload();
    const lastKnown = loadLastKnown();
    if (payload.entries.length === 0 && lastKnown.count > 0) {
      return { ok: false, msg: `SICHERHEITSSTOPP: Lokal 0 Einträge, zuletzt bekannt ${lastKnown.count}. Cloud-Tresor wird NICHT überschrieben.` };
    }
    if (!memKey) await restoreVaultKey();
    if (!memKey) {
      return { ok: true, msg: `Lokal unverschlüsselt im Browser (${payload.entries.length}). Für Cloud-Tresor bitte anmelden.`, localOnly: true };
    }
    const env = await encryptPayload(payload, memUser || vaultUser() || "Adam");
    await saveLocalEncrypted(env);

    const cfg = loadDrive();
    const parts: string[] = [`Tresor lokal (${payload.entries.length}, AES-256)`];

    if (cfg.connected && cfg.accessToken && cfg.expiry > Date.now()) {
      try {
        const fileId = await drivePutEnc(env, cfg);
        saveDrive({ ...cfg, fileId, lastBackup: Date.now(), lastBackupCount: payload.entries.length });
        parts.push("Drive ✓");
      } catch (e) {
        parts.push(`Drive ✗ ${e instanceof Error ? e.message : ""}`);
      }
    }

    if (cfg.gistToken) {
      try {
        const gid = await gistSave(env, cfg.gistToken, cfg.gistId);
        saveDrive({ ...loadDrive(), gistId: gid, gistLast: Date.now(), lastBackup: Date.now(), lastBackupCount: payload.entries.length });
        parts.push("Gist ✓");
      } catch (e) {
        parts.push(`Gist ✗ ${e instanceof Error ? e.message : ""}`);
      }
    }

    return { ok: true, msg: `${parts.join(" · ")} — ${reason}.`, localOnly: parts.length === 1 };
  } catch (e) {
    return { ok: false, msg: `Tresor-Backup fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}. Lokale Daten bleiben erhalten.` };
  } finally {
    backupRunning = false;
    if (backupPending) {
      const r = backupPending; backupPending = null;
      setTimeout(() => { void vaultBackup(r); }, 400);
    }
  }
}

export async function vaultRestore(): Promise<{ ok: boolean; msg: string; entries?: unknown[]; deleted?: string[]; youtubeConnections?: VaultPayload["youtubeConnections"] }> {
  if (!memKey) await restoreVaultKey();
  const cfg = loadDrive();
  const errors: string[] = [];

  // 1) Drive (verschlüsselt, dann altes Klartext-Backup)
  if (cfg.connected && cfg.accessToken) {
    try {
      let id = cfg.fileId || await driveFind(cfg.accessToken, DRIVE_FILE_ENC) || await driveFind(cfg.accessToken, DRIVE_FILE_OLD);
      if (id) {
        const obj = await driveGetJson(cfg.accessToken, id);
        const payload = await decodeCloudObject(obj);
        if (!cfg.fileId) saveDrive({ ...loadDrive(), fileId: id });
        return { ok: true, msg: `Drive-Tresor: ${payload.entries.length} Einträge (AES-256).`, entries: payload.entries, deleted: payload.deleted, youtubeConnections: payload.youtubeConnections };
      }
    } catch (e) { errors.push(`Drive: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 2) GitHub Gist
  if (cfg.gistToken) {
    try {
      const obj = await gistLoad(cfg.gistToken, cfg.gistId);
      if (obj) {
        const payload = await decodeCloudObject(obj);
        return { ok: true, msg: `Gist-Tresor: ${payload.entries.length} Einträge (AES-256).`, entries: payload.entries, deleted: payload.deleted, youtubeConnections: payload.youtubeConnections };
      }
    } catch (e) { errors.push(`Gist: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // 3) Lokaler verschlüsselter Tresor
  try {
    const env = await loadLocalEncrypted();
    if (env) {
      const payload = await decryptEnvelope(env);
      return { ok: true, msg: `Lokaler Tresor: ${payload.entries.length} Einträge.`, entries: payload.entries, deleted: payload.deleted };
    }
  } catch (e) { errors.push(`Lokal: ${e instanceof Error ? e.message : String(e)}`); }

  // 4) Altes Klartext-Snapshot (Migration)
  try {
    const raw = localStorage.getItem("grandrp_local_snapshot_v42");
    if (raw) {
      const snap = JSON.parse(raw) as VaultPayload;
      return { ok: true, msg: `Altes Klartext-Snapshot (bitte Tresor verbinden, wird künftig verschlüsselt): ${snap.entries?.length || 0}.`, entries: snap.entries || [] };
    }
  } catch { /* noop */ }

  return { ok: false, msg: errors.length ? errors.join(" · ") : "Kein Tresor gefunden. Drive oder GitHub-Gist verbinden." };
}

export async function downloadEncryptedVault(): Promise<void> {
  if (!memKey) await restoreVaultKey();
  if (!memKey) throw new Error("Tresor gesperrt.");
  const env = await encryptPayload(buildVaultPayload(), memUser || vaultUser() || "Adam");
  const blob = new Blob([JSON.stringify(env, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `grandrp-vault-aes256-${new Date().toISOString().slice(0, 10)}.enc.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function importEncryptedFile(file: File): Promise<VaultPayload> {
  if (!memKey) await restoreVaultKey();
  const obj = JSON.parse(await file.text()) as unknown;
  return decodeCloudObject(obj);
}
