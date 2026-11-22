import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, makeToken, passwordOk } from "@/lib/auth";

export async function POST(req: Request) {
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Şifre sunucuda ayarlanmamış." }, { status: 500 });
  }
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !passwordOk(password)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Şifre yanlış." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, makeToken(), cookieOptions);
  return res;
}
