import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { listProjects, newProject, saveProject } from "@/lib/store";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const all = await listProjects();
  return NextResponse.json(
    all.map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt }))
  );
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "yetkisiz" }, { status: 401 });
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  const p = newProject(name || "");
  await saveProject(p);
  return NextResponse.json(p);
}
