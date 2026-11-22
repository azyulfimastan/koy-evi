import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listSnaps, restoreSnap } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
const no = () => NextResponse.json({ error: "yetkisiz" }, { status: 401 });

export async function GET(_: Request, { params }: Ctx) {
  if (!(await isAuthed())) return no();
  return NextResponse.json(await listSnaps((await params).id));
}

/** { ts } sürümüne geri dön */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthed())) return no();
  const { ts } = (await req.json().catch(() => ({}))) as { ts?: number };
  if (typeof ts !== "number") return NextResponse.json({ error: "hatalı veri" }, { status: 400 });
  const p = await restoreSnap((await params).id, ts);
  if (!p) return NextResponse.json({ error: "bulunamadı" }, { status: 404 });
  return NextResponse.json(p);
}
