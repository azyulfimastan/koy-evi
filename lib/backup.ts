/* Yedek dosyası (.json): bir veya birden çok evi taşır */
export type BackupItem = { name: string; createdAt?: number; data: unknown };
const APP = "koy-evi-tasarim";

export function downloadBackup(items: BackupItem[], filename: string) {
  const body = JSON.stringify({ app: APP, format: 1, exportedAt: new Date().toISOString(), projects: items }, null, 1);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function safeName(s: string) {
  return (s || "ev").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 60) || "ev";
}

export function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Yedek dosyasını oku: kendi biçimimiz, tek proje veya çıplak ev verisi */
export function parseBackup(text: string): BackupItem[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("Dosya okunamadı (JSON değil).");
  }
  const isData = (d: unknown) => !!d && typeof d === "object" && Array.isArray((d as { floors?: unknown }).floors);
  if (j && Array.isArray(j.projects)) {
    const out = j.projects.filter((p: BackupItem) => p && isData(p.data)).map((p: BackupItem) => ({ name: String(p.name || "Yedekten ev"), createdAt: p.createdAt, data: p.data }));
    if (!out.length) throw new Error("Dosyada ev bulunamadı.");
    return out;
  }
  if (j && isData(j.data)) return [{ name: String(j.name || "Yedekten ev"), data: j.data }];
  if (isData(j)) return [{ name: "Yedekten ev", data: j }];
  throw new Error("Bu dosya Köy Evi Tasarım yedeği değil.");
}
