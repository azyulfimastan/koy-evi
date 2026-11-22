import crypto from "crypto";
import { cookies } from "next/headers";

export const COOKIE = "kte_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret() {
  return process.env.AUTH_SECRET || "s:" + (process.env.APP_PASSWORD || "");
}

function mac(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeToken() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return exp + "." + mac(exp);
}

function verifyToken(token: string | undefined) {
  if (!token || !process.env.APP_PASSWORD) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const good = mac(exp);
  if (sig.length !== good.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  return Number(exp) > Date.now();
}

export async function isAuthed() {
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}

export function passwordOk(input: string) {
  const real = process.env.APP_PASSWORD;
  if (!real) return false;
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};
