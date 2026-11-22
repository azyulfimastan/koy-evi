import { put, list, get, del } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";

import { defaultFull, normalizeFull } from "./types";
import type { Project } from "./types";
export type { Pt, Plot, Project } from "./types";

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const DIR = path.join(process.cwd(), ".data", "projects");
const keyOf = (id: string) => `projects/${id}.json`;
const okId = (id: string) => /^[a-zA-Z0-9-]{8,64}$/.test(id);

/* ---------- düşük seviye: anahtar → JSON ---------- */
const ROOT = path.join(process.cwd(), ".data");
async function putJson(key: string, value: unknown) {
  const body = JSON.stringify(value);
  if (useBlob) {
    await put(key, body, { access: "private", allowOverwrite: true, contentType: "application/json", addRandomSuffix: false });
    return;
  }
  const file = path.join(ROOT, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, file);
}
async function getJson<T>(key: string): Promise<T | null> {
  try {
    if (useBlob) {
      const r = await get(key, { access: "private", useCache: false });
      if (!r || r.statusCode !== 200) return null;
      return (await new Response(r.stream).json()) as T;
    }
    return JSON.parse(await fs.readFile(path.join(ROOT, key), "utf8")) as T;
  } catch {
    return null;
  }
}
async function listKeys(prefix: string): Promise<string[]> {
  if (useBlob) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await list({ prefix, cursor, limit: 1000 });
      r.blobs.forEach((b) => out.push(b.pathname));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(ROOT, prefix);
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => prefix + f);
  } catch {
    return [];
  }
}
async function delKeys(keys: string[]) {
  if (!keys.length) return;
  if (useBlob) await del(keys);
  else await Promise.all(keys.map((k) => fs.rm(path.join(ROOT, k), { force: true })));
}

async function readBlob(pathname: string): Promise<Project | null> {
  const r = await get(pathname, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return (await new Response(r.stream).json()) as Project;
}

export async function listProjects(): Promise<Project[]> {
  let all: Project[] = [];
  if (useBlob) {
    const { blobs } = await list({ prefix: "projects/" });
    const got = await Promise.all(blobs.map((b) => readBlob(b.pathname).catch(() => null)));
    all = got.filter(Boolean) as Project[];
  } else {
    await fs.mkdir(DIR, { recursive: true });
    const files = await fs.readdir(DIR);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        all.push(JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")));
      } catch {
        /* bozuk dosya: listeyi bozmasın */
      }
    }
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | null> {
  if (!okId(id)) return null;
  if (useBlob) return readBlob(keyOf(id)).catch(() => null);
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, id + ".json"), "utf8"));
  } catch {
    return null;
  }
}

export async function saveProject(p: Project): Promise<void> {
  if (!okId(p.id)) throw new Error("bad id");
  const body = JSON.stringify(p);
  if (useBlob) {
    await put(keyOf(p.id), body, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      addRandomSuffix: false,
    });
  } else {
    await fs.mkdir(DIR, { recursive: true });
    // önce geçici dosyaya yaz, sonra taşı (aynı anda iki kayıt dosyayı bozmasın)
    const tmp = path.join(DIR, `${p.id}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, path.join(DIR, p.id + ".json"));
  }
}

/* ---------- çöp kutusu: silinen ev 30 gün saklanır ---------- */
const TRASH_DAYS = 30;
export async function deleteProject(id: string): Promise<void> {
  if (!okId(id)) return;
  const p = await getProject(id);
  if (p) await putJson(`trash/${id}.json`, { ...p, deletedAt: Date.now() });
  if (useBlob) await del(keyOf(id));
  else await fs.rm(path.join(DIR, id + ".json"), { force: true });
}

export async function listTrash(): Promise<Project[]> {
  const keys = await listKeys("trash/");
  const all = (await Promise.all(keys.map((k) => getJson<Project>(k)))).filter(Boolean) as Project[];
  const old = all.filter((p) => Date.now() - (p.deletedAt ?? 0) > TRASH_DAYS * 864e5);
  if (old.length) await delKeys(old.map((p) => `trash/${p.id}.json`));
  return all.filter((p) => !old.includes(p)).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

export async function restoreTrash(id: string): Promise<Project | null> {
  if (!okId(id)) return null;
  const p = await getJson<Project>(`trash/${id}.json`);
  if (!p) return null;
  delete p.deletedAt;
  p.updatedAt = Date.now();
  await saveProject(p);
  await delKeys([`trash/${id}.json`]);
  return p;
}

export async function purgeTrash(id: string) {
  if (!okId(id)) return;
  await delKeys([`trash/${id}.json`]);
  const hist = await listKeys(`history/${id}/`);
  await delKeys(hist);
}

/* ---------- sürüm geçmişi ---------- */
const SNAP_EVERY = 10 * 60 * 1000; // en çok 10 dakikada bir sürüm
const SNAP_KEEP = 40;
export type Snap = { ts: number; walls: number; rooms: number; items: number; floors: number };

function stats(p: Project) {
  const f = p.data?.floors ?? [];
  return {
    walls: f.reduce((a, x) => a + (x.walls?.length ?? 0), 0),
    rooms: f.reduce((a, x) => a + (x.rooms?.length ?? 0), 0),
    items: f.reduce((a, x) => a + (x.items?.length ?? 0), 0),
    floors: f.length,
  };
}

/** Kayıttan önce çağrılır: önceki hâlin sürümünü gerekirse saklar. lastSnap'i döner. */
export async function maybeSnapshot(cur: Project, force = false): Promise<number | undefined> {
  const now = Date.now();
  if (!force && cur.lastSnap && now - cur.lastSnap < SNAP_EVERY) return cur.lastSnap;
  const st = stats(cur);
  if (!force && st.walls === 0 && st.items === 0) return cur.lastSnap; // boş ev için sürüm tutma
  const key = `history/${cur.id}/${cur.updatedAt}_${st.floors}-${st.walls}-${st.rooms}-${st.items}.json`;
  const copy = { ...cur };
  delete copy.thumb;
  await putJson(key, copy);
  const keys = (await listKeys(`history/${cur.id}/`)).sort();
  if (keys.length > SNAP_KEEP) await delKeys(keys.slice(0, keys.length - SNAP_KEEP));
  return now;
}

export async function listSnaps(id: string): Promise<Snap[]> {
  if (!okId(id)) return [];
  const keys = await listKeys(`history/${id}/`);
  return keys
    .map((k) => {
      const m = /\/(\d+)_(\d+)-(\d+)-(\d+)-(\d+)\.json$/.exec(k);
      return m ? { ts: +m[1], floors: +m[2], walls: +m[3], rooms: +m[4], items: +m[5] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b!.ts - a!.ts) as Snap[];
}

export async function restoreSnap(id: string, ts: number): Promise<Project | null> {
  if (!okId(id)) return null;
  const keys = await listKeys(`history/${id}/`);
  const key = keys.find((k) => k.includes(`/${ts}_`));
  if (!key) return null;
  const old = await getJson<Project>(key);
  const cur = await getProject(id);
  if (!old || !cur) return null;
  // geri dönmeden önce şimdiki hâli de sakla (geri dönüş geri alınabilsin)
  const lastSnap = await maybeSnapshot(cur, true);
  const next: Project = { ...cur, data: normalizeFull(old.data), name: cur.name, updatedAt: Date.now(), lastSnap };
  await saveProject(next);
  return next;
}

export function newProject(name: string, data?: unknown): Project {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80) || "Yeni ev",
    createdAt: now,
    updatedAt: now,
    data: data ? normalizeFull(data) : defaultFull(),
  };
}
