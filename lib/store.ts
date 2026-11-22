import { put, list, get, del } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";

import { defaultFull } from "./types";
import type { Project } from "./types";
export type { Pt, Plot, Project } from "./types";

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const DIR = path.join(process.cwd(), ".data", "projects");
const keyOf = (id: string) => `projects/${id}.json`;
const okId = (id: string) => /^[a-zA-Z0-9-]{8,64}$/.test(id);

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

export async function deleteProject(id: string): Promise<void> {
  if (!okId(id)) return;
  if (useBlob) await del(keyOf(id));
  else await fs.rm(path.join(DIR, id + ".json"), { force: true });
}

export function newProject(name: string): Project {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80) || "Yeni ev",
    createdAt: now,
    updatedAt: now,
    data: defaultFull(),
  };
}
