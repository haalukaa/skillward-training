import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const allowedOrigins = new Set([Deno.env.get("PUBLIC_SITE_ORIGIN") || "https://skillwardtraining.com", "http://localhost:8080", "http://127.0.0.1:8080"]);
const interests = new Set(["Hospital workforce training","PCA training","Cleaner training","Practical competency assessment","Compliance and reassessment","Multi-facility management","Aged Care interest","Disability Support interest","Pilot partnership","General enquiry"]);
const organizationTypes = new Set(["Hospital","Aged Care","Disability Support","Other healthcare"]);
const staffRanges = new Set(["1–49","50–199","200–999","1,000+"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const response = (status: number, body: Record<string, unknown>, origin: string) => new Response(JSON.stringify(body), { status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":origin, "Vary":"Origin", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Cache-Control":"no-store" } });
const clean = (value: unknown, maximum: number) => String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximum);
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async request => {
  const requestOrigin = request.headers.get("origin") || "";
  const origin = allowedOrigins.has(requestOrigin) ? requestOrigin : Deno.env.get("PUBLIC_SITE_ORIGIN") || "https://skillwardtraining.com";
  if (request.method === "OPTIONS") return allowedOrigins.has(requestOrigin) ? response(200, { ok:true }, origin) : response(403, { error:"ORIGIN_NOT_ALLOWED" }, origin);
  if (request.method !== "POST") return response(405, { error:"METHOD_NOT_ALLOWED" }, origin);
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) return response(403, { error:"ORIGIN_NOT_ALLOWED" }, origin);
  if ((request.headers.get("content-type") || "").split(";")[0] !== "application/json") return response(415, { error:"INVALID_CONTENT_TYPE" }, origin);

  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), salt = Deno.env.get("DEMO_REQUEST_RATE_LIMIT_SALT");
  if (!url || !serviceKey || !salt) return response(503, { error:"SERVICE_NOT_CONFIGURED" }, origin);
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return response(400, { error:"INVALID_REQUEST" }, origin); }
  if (clean(input.website, 100)) return response(202, { ok:true }, origin);
  const started = Number(input.formStartedAt || 0), elapsed = Date.now() - started;
  if (!started || elapsed < 2000 || elapsed > 86400000) return response(400, { error:"FORM_SESSION_INVALID" }, origin);

  const row = {
    work_email: clean(input.workEmail, 254).toLowerCase(), full_name:clean(input.fullName, 120), organization_name:clean(input.organizationName, 160),
    organization_type:clean(input.organizationType, 40), job_role:clean(input.jobRole, 120), staff_range:clean(input.staffRange, 20), primary_interest:clean(input.primaryInterest, 80),
    message:clean(input.message, 1500) || null, privacy_consent_at:input.privacyConsent === "true" || input.privacyConsent === true ? new Date().toISOString() : ""
  };
  if (!emailPattern.test(row.work_email) || row.full_name.length < 2 || row.organization_name.length < 2 || row.job_role.length < 2 || !organizationTypes.has(row.organization_type) || !staffRanges.has(row.staff_range) || !interests.has(row.primary_interest) || !row.privacy_consent_at) return response(400, { error:"VALIDATION_FAILED" }, origin);

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || "unknown";
  const fingerprint = await digest(`${salt}:${forwarded}`);
  const client = createClient(url, serviceKey, { auth:{ persistSession:false, autoRefreshToken:false } });
  const { data: requestCount, error: limitError } = await client.rpc("consume_demo_request_rate_limit", { fingerprint });
  if (limitError) return response(503, { error:"SERVICE_UNAVAILABLE" }, origin);
  if (Number(requestCount) > 5) return response(429, { error:"RATE_LIMITED" }, origin);
  const { error } = await client.from("demo_requests").insert(row);
  if (error) return response(503, { error:"REQUEST_NOT_SAVED" }, origin);
  return response(201, { ok:true }, origin);
});
