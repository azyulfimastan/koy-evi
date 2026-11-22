import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listProjects, newProject, saveProject } from "@/lib/store";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const all = await listProjects();
  return NextResponse.json(
    all.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, thumb: p.thumb }))
  );
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const { name, data } = (await req.json().catch(() => ({}))) as { name?: string; data?: unknown };
  // data: yedekten yükleme veya hazır şablon
  const p = newProject(name || "", data && typeof data === "object" ? data : undefined);
  await saveProject(p);
  return NextResponse.json(p);
}
