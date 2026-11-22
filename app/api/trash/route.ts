import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listTrash, purgeTrash, restoreTrash } from "@/lib/store";

const no = () => NextResponse.json({ error: "yetkisiz" }, { status: 401 });

export async function GET() {
  if (!(await isAuthed())) return no();
  const all = await listTrash();
  return NextResponse.json(all.map((p) => ({ id: p.id, name: p.name, deletedAt: p.deletedAt, thumb: p.thumb })));
}

/** { id } evi çöp kutusundan geri getir */
export async function POST(req: Request) {
  if (!(await isAuthed())) return no();
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const p = id ? await restoreTrash(id) : null;
  if (!p) return NextResponse.json({ error: "bulunamadı" }, { status: 404 });
  return NextResponse.json({ ok: true, id: p.id });
}

/** ?id= kalıcı olarak sil */
export async function DELETE(req: Request) {
  if (!(await isAuthed())) return no();
  const id = new URL(req.url).searchParams.get("id");
  if (id) await purgeTrash(id);
  return NextResponse.json({ ok: true });
}
