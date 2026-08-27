/**
 * Frictionless Google Drive backup.
 *
 * Uses the Google access token already attached to the signed-in session
 * (`provider_token`) together with the narrow `drive.file` scope, so Evermind
 * can only touch files it creates itself. Backups land in an "Evermind Vaults"
 * folder — the creator never pastes a Drive link.
 */
import { getGeminiAccessToken } from "@/lib/google-gemini-auth";
import { idbGet, idbSet, STORES } from "@/lib/store";
import { scopedKey } from "@/lib/user-scope";

/** Single-app Drive scope: Evermind sees only the files it created. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const DRIVE_FOLDER_NAME = "Evermind Vaults";

const TOGGLE_KEY = () => scopedKey("driveSyncEnabled");

export async function isDriveSyncEnabled(): Promise<boolean> {
  return (await idbGet<boolean>(STORES.SETTINGS, TOGGLE_KEY())) === true;
}

export async function setDriveSyncEnabled(on: boolean): Promise<void> {
  await idbSet(STORES.SETTINGS, TOGGLE_KEY(), on);
}

async function driveFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`https://www.googleapis.com/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google Drive rejected the request (${res.status}). ${detail.slice(0, 200)}`);
  }
  return res;
}

async function ensureFolder(token: string): Promise<string> {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER_NAME}' and trashed=false`,
  );
  const found = (await (
    await driveFetch(token, `drive/v3/files?q=${q}&fields=files(id)&spaces=drive`)
  ).json()) as { files?: { id: string }[] };
  const existing = found.files?.[0]?.id;
  if (existing) return existing;

  const created = (await (
    await driveFetch(token, "drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    })
  ).json()) as { id: string };
  return created.id;
}

export type DriveBackupResult = { ok: true; fileId: string; fileName: string } | { ok: false; reason: string };

/** Writes a structured `.mind.json` backup into the user's Evermind Vaults folder. */
export async function backupMindToDrive(title: string, mind: unknown): Promise<DriveBackupResult> {
  const token = await getGeminiAccessToken();
  if (!token) {
    return { ok: false, reason: "Sign in with Google to enable Drive backup." };
  }
  try {
    const folderId = await ensureFolder(token);
    const safe = title.trim().replace(/[^\p{L}\p{N}\-_ ]+/gu, "").slice(0, 60) || "mind";
    const fileName = `${safe}-${new Date().toISOString().slice(0, 10)}.mind.json`;

    const boundary = `evermind${Math.random().toString(36).slice(2)}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name: fileName, parents: [folderId] })}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      `${JSON.stringify(mind, null, 2)}\r\n--${boundary}--`;

    const uploaded = (await (
      await driveFetch(token, "upload/drive/v3/files?uploadType=multipart&fields=id", {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      })
    ).json()) as { id: string };

    return { ok: true, fileId: uploaded.id, fileName };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
