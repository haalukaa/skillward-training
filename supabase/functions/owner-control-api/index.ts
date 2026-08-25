import { createClient } from "npm:@supabase/supabase-js@2.55.0";

type Json = Record<string, unknown>;
type JwtClaims = { sub?: unknown; session_id?: unknown; aal?: unknown; amr?: Array<{ method?: unknown; timestamp?: unknown }> };

const productionOrigin = "https://control.skillwardtraining.com";
const configuredOrigin = Deno.env.get("CONTROL_PLANE_ORIGIN")?.trim() || productionOrigin;
const allowedOrigins = new Set([configuredOrigin, "http://127.0.0.1:4173", "http://localhost:4173"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clean = (value: unknown, maximum = 2000) => String(value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximum);
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");
const decodeClaims = (token: string): JwtClaims => {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return {};
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes: number[] = [];
    let accumulator = 0;
    let bitCount = 0;
    for (const character of encoded) {
      const value = alphabet.indexOf(character);
      if (value < 0) return {};
      accumulator = (accumulator << 6) | value;
      bitCount += 6;
      if (bitCount >= 8) {
        bitCount -= 8;
        bytes.push((accumulator >> bitCount) & 255);
      }
    }
    return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
  } catch { return {}; }
};
const responseHeaders = (origin: string) => ({
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Vary": "Origin"
});
const respond = (status: number, body: Json, origin: string) => new Response(JSON.stringify(body), { status, headers: responseHeaders(origin) });
const safeFailure = (status: number, code: string, origin: string) => respond(status, { error: code }, origin);

Deno.serve(async request => {
  const requestOrigin = request.headers.get("origin") || "";
  const origin = allowedOrigins.has(requestOrigin) ? requestOrigin : configuredOrigin;
  let stage = "request";
  try {
  if (request.method === "OPTIONS") return allowedOrigins.has(requestOrigin) ? respond(200, { ok: true }, origin) : safeFailure(403, "ACCESS_DENIED", origin);
  if (request.method !== "POST") return safeFailure(405, "METHOD_NOT_ALLOWED", origin);
  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) return safeFailure(403, "ACCESS_DENIED", origin);
  if ((request.headers.get("content-type") || "").split(";")[0] !== "application/json") return safeFailure(415, "INVALID_REQUEST", origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rateSalt = Deno.env.get("CONTROL_PLANE_RATE_LIMIT_SALT");
  if (!supabaseUrl || !serviceKey || !rateSalt) return safeFailure(503, "SERVICE_UNAVAILABLE", origin);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) return safeFailure(401, "AUTHENTICATION_REQUIRED", origin);
  const claims = decodeClaims(token);
  const actorUserId = clean(claims.sub, 64);
  const sessionId = clean(claims.session_id, 64);
  const verifiedMfa = Array.isArray(claims.amr) && claims.amr.some(entry => ["totp", "webauthn"].includes(clean(entry.method, 24)));
  if (!uuid.test(actorUserId) || !uuid.test(sessionId) || claims.aal !== "aal2" || !verifiedMfa) {
    return safeFailure(403, "STRONG_MFA_REQUIRED", origin);
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || "unknown";
  const agent = clean(request.headers.get("user-agent"), 512) || "unknown";
  stage = "rate_limit_hash";
  const subjectHash = await digest(`${rateSalt}:${forwarded}:${agent}`);
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  stage = "rate_limit_rpc";
  const { data: limit, error: limitError } = await service.rpc("owner_control_consume_rate_limit", { p_subject_hash: subjectHash, p_bucket_name: "control_api", p_maximum_attempts: 60 });
  if (limitError) return safeFailure(503, "SERVICE_UNAVAILABLE", origin);
  if (!limit?.allowed) return new Response(JSON.stringify({ error: "RATE_LIMITED" }), { status: 429, headers: { ...responseHeaders(origin), "Retry-After": String(limit?.retry_after_seconds || 60) } });

  const recentSeconds = Array.isArray(claims.amr)
    ? claims.amr.filter(entry => ["password", "totp", "webauthn"].includes(clean(entry.method, 24))).map(entry => Number(entry.timestamp || 0)).filter(Number.isFinite).sort((a, b) => b - a)[0] || 0
    : 0;
  const recentAuthAt = recentSeconds > 0 ? new Date(recentSeconds * 1000).toISOString() : null;
  const ipHash = await digest(`${rateSalt}:ip:${forwarded}`);
  const agentHash = await digest(`${rateSalt}:agent:${agent}`);
  stage = "authorize_rpc";
  const { data: authorizationResult, error: authorizationError } = await service.rpc("owner_control_authorize", {
    p_actor_user_id: actorUserId,
    p_auth_session_id: sessionId,
    p_assurance_level: "aal2",
    p_reauthenticated_at: recentAuthAt,
    p_client_ip_hash: ipHash,
    p_client_agent_hash: agentHash
  });
  if (authorizationError || !authorizationResult) return safeFailure(403, "ACCESS_DENIED", origin);

  let body: Json;
  try { body = await request.json(); } catch { return safeFailure(400, "INVALID_REQUEST", origin); }
  const operation = clean(body.operation, 40);
  if (operation === "snapshot") {
    stage = "snapshot_rpc";
    const { data, error } = await service.rpc("owner_control_snapshot", { actor_user_id: actorUserId });
    if (error) {
      const safeDatabaseCode = clean(error.code, 16).replace(/[^A-Z0-9_-]/gi, "") || "unknown";
      const publicCode = Deno.env.get("CONTROL_PLANE_TEST_DIAGNOSTICS") === "enabled" ? `CONTROL_DATA_UNAVAILABLE_${safeDatabaseCode}` : "CONTROL_DATA_UNAVAILABLE";
      return safeFailure(503, publicCode, origin);
    }
    return respond(200, { authorization: authorizationResult, data }, origin);
  }
  if (operation === "action") {
    stage = "action_rpc";
    const actionName = clean(body.action, 80);
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Json : {};
    if (!actionName) return safeFailure(400, "INVALID_REQUEST", origin);
    const { data, error } = await service.rpc("owner_control_action", { actor_user_id: actorUserId, action_name: actionName, payload, recent_auth_at: recentAuthAt });
    if (error) {
      const known = new Set(["CONTROL_RECENT_AUTH_REQUIRED", "CONTROL_REASON_REQUIRED", "CONTROL_CONFIRMATION_REQUIRED", "INVALID_LIFECYCLE_TRANSITION", "LAST_OWNER_PROTECTED", "CLINICAL_REVIEW_REQUIRED"]);
      const code = known.has(error.message) ? error.message : error.code === "42501" ? "ACCESS_DENIED" : "ACTION_REJECTED";
      return safeFailure(code === "CONTROL_RECENT_AUTH_REQUIRED" ? 401 : code === "ACCESS_DENIED" ? 403 : 409, code, origin);
    }
    return respond(200, { authorization: authorizationResult, data }, origin);
  }
  return safeFailure(400, "INVALID_REQUEST", origin);
  } catch (error) {
    const failureName = clean(error instanceof Error ? error.name : "UnknownError", 40).replace(/[^A-Z0-9_-]/gi, "");
    const failureCode = clean(error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : "unknown", 40).replace(/[^A-Z0-9_-]/gi, "");
    console.error(`SkillWard owner control runtime failure:${stage}:${failureName || "UnknownError"}:${failureCode || "unknown"}`);
    return safeFailure(503, "SERVICE_UNAVAILABLE", origin);
  }
});
