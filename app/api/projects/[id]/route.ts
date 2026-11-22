import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { deleteProject, getProject, saveProject } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
const no = () => NextResponse.json({ error: "yetkisiz" }, { status: 401 });

export async function GET(_: Request, { params }: Ctx) {
  if (!(await isAuthed())) return no();
  const p = await getProject((await params).id);
  if (!p) return NextResponse.json({ error: "bulunamadı" }, { status: 404 });
  return NextResponse.json(p);
}

export async function PUT(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return no();
  const id = (await params).id;
  const cur = await getProject(id);
  if (!cur) return NextResponse.json({ error: "bulunamadı" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Partial<typeof cur> | null;
  if (!body) return NextResponse.json({ error: "hatalı veri" }, { status: 400 });
  const next = {
    ...cur,
    name: typeof body.name === "string" ? body.name.trim().slice(0, 80) || cur.name : cur.name,
    data: body.data ?? cur.data,
    thumb: typeof body.thumb === "string" && body.thumb.startsWith("data:image/") && body.thumb.length < 300000 ? body.thumb : cur.thumb,
    updatedAt: Date.now(),
  };
  await saveProject(next);
  return NextResponse.json({ ok: true, updatedAt: next.updatedAt });
}

export async function DELETE(_: Request, { params }: Ctx) {
  if (!(await isAuthed())) return no();
  await deleteProject((await params).id);
  return NextResponse.json({ ok: true });
}
