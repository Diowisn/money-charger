import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashToken, AUTH_COOKIE, opsiCookie } from "@/lib/auth";
import { getPool } from "@/lib/pg-repo";

export type Provider = "google" | "facebook";
const STATE_COOKIE = "mc_oauth_state";
const stateAge = 600;

export function configured(provider: Provider) {
  return provider === "google"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

function callbackUrl(provider: Provider) {
  return `${process.env.AUTH_CALLBACK_BASE_URL?.replace(/\/$/, "")}/api/auth/oauth/${provider}/callback`;
}

export async function start(request: NextRequest, provider: Provider) {
  if (!configured(provider) || !process.env.AUTH_CALLBACK_BASE_URL) return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  const state = randomBytes(32).toString("base64url");
  const redirectUri = callbackUrl(provider);
  const url = provider === "google"
    ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
    : new URL("https://www.facebook.com/v22.0/dialog/oauth");
  url.search = new URLSearchParams({
    client_id: provider === "google" ? process.env.GOOGLE_CLIENT_ID! : process.env.FACEBOOK_APP_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider === "google" ? "openid email profile" : "email,public_profile",
    state,
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/api/auth/oauth/${provider}/callback`, maxAge: stateAge });
  return response;
}

async function providerProfile(provider: Provider, code: string) {
  const redirectUri = callbackUrl(provider);
  const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://graph.facebook.com/v22.0/oauth/access_token";
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: provider === "google" ? process.env.GOOGLE_CLIENT_ID! : process.env.FACEBOOK_APP_ID!,
      client_secret: provider === "google" ? process.env.GOOGLE_CLIENT_SECRET! : process.env.FACEBOOK_APP_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("token exchange failed");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("missing access token");
  const profileUrl = provider === "google"
    ? "https://openidconnect.googleapis.com/v1/userinfo"
    : "https://graph.facebook.com/me?fields=id,email";
  const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
  if (!profileResponse.ok) throw new Error("profile request failed");
  const profile = await profileResponse.json() as { sub?: string; id?: string; email?: string; email_verified?: boolean };
  const subject = provider === "google" ? profile.sub : profile.id;
  if (!subject || !profile.email || (provider === "google" && profile.email_verified !== true)) throw new Error("invalid profile");
  return { subject, email: profile.email };
}

async function authenticateFirstOrKnown(provider: Provider, subject: string, email: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72418302)");
    const identity = await client.query<{ user_id: string }>("SELECT user_id FROM auth_identities WHERE provider=$1 AND subject=$2", [provider, subject]);
    let userId = identity.rows[0]?.user_id;
    if (!userId) {
      const count = await client.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM auth_users");
      if (count.rows[0].n !== 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const user = await client.query<{ id: string }>("INSERT INTO auth_users (email) VALUES ($1) RETURNING id", [email]);
      userId = user.rows[0].id;
      await client.query("INSERT INTO auth_identities (provider,subject,user_id) VALUES ($1,$2,$3)", [provider, subject, userId]);
      for (const table of ["groups", "sub_posts", "aliases", "plan_versions", "plan_items", "transactions", "debts", "saving_goals", "config"]) {
        await client.query(`UPDATE ${table} SET user_id=$1 WHERE user_id IS NULL`, [userId]);
      }
    }
    const token = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '30 days')", [hashToken(token), userId]);
    await client.query("COMMIT");
    return token;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function callback(request: NextRequest, provider: Provider) {
  const response = NextResponse.redirect(new URL("/login?error=oauth", request.url));
  response.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/api/auth/oauth/${provider}/callback`, maxAge: 0 });
  try {
    const expected = request.cookies.get(STATE_COOKIE)?.value;
    const supplied = request.nextUrl.searchParams.get("state");
    if (!expected || !supplied) return response;
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return response;
    const code = request.nextUrl.searchParams.get("code");
    if (!code || !configured(provider) || !process.env.AUTH_CALLBACK_BASE_URL) return response;
    const profile = await providerProfile(provider, code);
    const token = await authenticateFirstOrKnown(provider, profile.subject, profile.email);
    if (!token) return response;
    const success = NextResponse.redirect(new URL("/", request.url));
    success.cookies.set(AUTH_COOKIE, token, opsiCookie());
    success.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/api/auth/oauth/${provider}/callback`, maxAge: 0 });
    return success;
  } catch {
    return response;
  }
}
