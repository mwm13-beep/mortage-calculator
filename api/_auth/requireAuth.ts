// api/_auth/requireAuth.ts  (Edge-safe)
import { SignJWT, jwtVerify } from "jose"; // already edge-compatible
// If you only verify, you can import just jwtVerify.

const COOKIE = process.env.SESSION_COOKIE_NAME || "mc_session";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "");

// What we store in the token/cookie
export type Session = {
  sub: string;            // user id
  role: "demo" | "user" | "admin";
  isDemo?: boolean;
  exp?: number;           // seconds since epoch (standard JWT claim)
};

export type RequireAuthOpts = {
  allowDemo?: boolean;            // default true
  roles?: Array<Session["role"]>; // restrict by role if provided
};

export type RequireAuthResult =
  | { ok: true; session: Session }
  | { ok: false; res: Response };

// ---------- cookie utils (Edge) ----------
function parseCookie(header: string | null): Record<string,string> {
  if (!header) return {};
  const kv: Record<string,string> = {};
  header.split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > -1) kv[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1));
  });
  return kv;
}

export async function readSessionFromCookie(req: Request): Promise<Session | null> {
  const raw = req.headers.get("cookie");
  const kv = parseCookie(raw);
  const token = kv[COOKIE];
  if (!token || !SECRET.byteLength) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

// Optional: you can also export a helper to *create* a cookie during login
export async function createSessionCookie(sess: Session, maxAgeSeconds = 60 * 60 * 8) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT(sess as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSeconds)
    .sign(SECRET);

  const cookie = [
    `${COOKIE}=${encodeURIComponent(jwt)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");

  return cookie;
}

// Main guard used by handlers
export async function requireAuth(
  req: Request,
  opts: RequireAuthOpts = { allowDemo: true }
): Promise<RequireAuthResult> {
  const session = await readSessionFromCookie(req);
  if (!session) {
    return { ok: false, res: new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 }) };
  }
  if (opts.roles && !opts.roles.includes(session.role)) {
    return { ok: false, res: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }) };
  }
  if (session.isDemo && opts.allowDemo === false) {
    return { ok: false, res: new Response(JSON.stringify({ error: "demo not allowed" }), { status: 403 }) };
  }
  return { ok: true, session };
}
