import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hashToken, AUTH_COOKIE, opsiCookie } from "@/lib/auth";
import { getPool, PgRepo } from "@/lib/pg-repo";

export type Provider = "google" | "facebook";
const STATE_COOKIE = "mc_oauth_state";
const stateAge = 600;

const googleId = () => process.env.GOOGLE_CLIENT_ID?.trim() || "";
const googleSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
const facebookId = () => (process.env.FACEBOOK_APP_ID || process.env.META_APP_ID)?.trim() || "";
const facebookSecret = () => (process.env.FACEBOOK_APP_SECRET || process.env.WA_APP_SECRET)?.trim() || "";

export function configured(provider: Provider) {
  return provider === "google"
    ? Boolean(googleId() && googleSecret())
    : Boolean(facebookId() && facebookSecret());
}

function callbackBase(request?: NextRequest) {
  return (
    process.env.AUTH_CALLBACK_BASE_URL?.trim().replace(/\/$/, "") ||
    request?.nextUrl.origin.replace(/\/$/, "") ||
    process.env.APP_BASE_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

function callbackUrl(provider: Provider, request?: NextRequest) {
  return `${callbackBase(request)}/api/auth/oauth/${provider}/callback`;
}

export async function start(request: NextRequest, provider: Provider) {
  if (!configured(provider) || !callbackBase(request)) return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  const state = randomBytes(32).toString("base64url");
  const redirectUri = callbackUrl(provider, request);
  const url = provider === "google"
    ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
    : new URL("https://www.facebook.com/v22.0/dialog/oauth");
  url.search = new URLSearchParams({
    client_id: provider === "google" ? googleId() : facebookId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider === "google" ? "openid email profile" : "email,public_profile",
    state,
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/api/auth/oauth/${provider}/callback`, maxAge: stateAge });
  return response;
}

async function providerProfile(provider: Provider, code: string, request: NextRequest) {
  const redirectUri = callbackUrl(provider, request);
  const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://graph.facebook.com/v22.0/oauth/access_token";
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: provider === "google" ? googleId() : facebookId(),
      client_secret: provider === "google" ? googleSecret() : facebookSecret(),
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
  if (!subject || (provider === "google" && (!profile.email || profile.email_verified !== true))) throw new Error("invalid profile");
  return { subject, email: profile.email?.trim().toLowerCase() || null };
}

async function authenticateOAuth(provider: Provider, subject: string, email: string | null) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72418302)");
    const identity = await client.query<{ user_id: string }>("SELECT user_id FROM auth_identities WHERE provider=$1 AND subject=$2", [provider, subject]);
    let userId = identity.rows[0]?.user_id;
    if (userId) {
      const twoFactor = await client.query<{ totp_aktif: boolean }>("SELECT totp_aktif FROM auth_users WHERE id = $1", [userId]);
      if (twoFactor.rows[0]?.totp_aktif) {
        await client.query("ROLLBACK");
        return null;
      }
    }
    if (!userId && email) {
      const existingUser = await client.query<{ id: string }>("SELECT id FROM auth_users WHERE email=$1", [email]);
      userId = existingUser.rows[0]?.id;
      if (userId) {
        const linked = await client.query(
          "INSERT INTO auth_identities (provider,subject,user_id) VALUES ($1,$2,$3) ON CONFLICT (user_id, provider) DO NOTHING RETURNING user_id",
          [provider, subject, userId],
        );
        if (!linked.rowCount) {
          const current = await client.query("SELECT 1 FROM auth_identities WHERE provider=$1 AND subject=$2 AND user_id=$3", [provider, subject, userId]);
          if (!current.rowCount) {
            await client.query("ROLLBACK");
            return null;
          }
        }
      }
    }
    if (!userId) {
      const count = await client.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM auth_users");
      const firstUser = count.rows[0].n === 0;
      if (!firstUser) {
        await client.query("ROLLBACK");
        return null;
      }
      const emailForUser = email || `${provider}+${subject}@users.money-charger.local`;
      const user = await client.query<{ id: string }>("INSERT INTO auth_users (email) VALUES ($1) RETURNING id", [emailForUser]);
      userId = user.rows[0].id;
      await client.query("INSERT INTO auth_identities (provider,subject,user_id) VALUES ($1,$2,$3)", [provider, subject, userId]);
      if (firstUser) {
        for (const table of ["groups", "sub_posts", "aliases", "plan_versions", "plan_items", "transactions", "debts", "saving_goals", "config"]) {
          await client.query(`UPDATE ${table} SET user_id=$1 WHERE user_id IS NULL`, [userId]);
        }
      } else {
        await new PgRepo(client, true, userId).seed([]);
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
    if (!code || !configured(provider) || !callbackBase(request)) return response;
    const profile = await providerProfile(provider, code, request);
    const token = await authenticateOAuth(provider, profile.subject, profile.email);
    if (!token) return response;
    const success = NextResponse.redirect(new URL("/", request.url));
    success.cookies.set(AUTH_COOKIE, token, opsiCookie());
    success.cookies.set(STATE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/api/auth/oauth/${provider}/callback`, maxAge: 0 });
    return success;
  } catch {
    return response;
  }
}
