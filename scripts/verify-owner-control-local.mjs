import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const endpoint = process.env.SKILLWARD_LOCAL_API_ENDPOINT;
const anonKey = process.env.SKILLWARD_LOCAL_PUBLIC_KEY;
const serviceKey = process.env.SKILLWARD_LOCAL_SETUP_KEY;
if (!endpoint || !anonKey || !serviceKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(endpoint)) throw new Error("LOCAL_CONTROL_TEST_CONFIGURATION_REQUIRED");

const admin = createClient(endpoint, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Local-only-${crypto.randomUUID()}-Aa7!`;
const base32 = value => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const char of value.replace(/=+$/g, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g)?.map(byte => Number.parseInt(byte, 2)) || []);
};
const totp = secret => {
  const counter = Math.floor(Date.now() / 30000); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", base32(secret)).update(buffer).digest(); const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
};
const createAal2 = async email => {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("LOCAL_AUTH_USER_CREATE_FAILED");
  const browser = createClient(endpoint, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await browser.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("LOCAL_AUTH_SIGN_IN_FAILED");
  const enrollment = await browser.auth.mfa.enroll({ factorType: "totp", friendlyName: "Fictional owner-control CI" });
  if (enrollment.error) throw new Error("LOCAL_MFA_ENROLL_FAILED");
  const challenge = await browser.auth.mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret) });
  if (challenge.error) throw new Error("LOCAL_MFA_VERIFY_FAILED");
  const session = await browser.auth.getSession();
  if (!session.data.session?.access_token) throw new Error("LOCAL_AAL2_SESSION_MISSING");
  return { userId: created.data.user.id, accessToken: session.data.session.access_token };
};
const invoke = async accessToken => {
  const response = await fetch(`${endpoint}/functions/v1/owner-control-api`, { method: "POST", headers: { apikey: anonKey, authorization: `Bearer ${accessToken}`, origin: "http://127.0.0.1:4173", "content-type": "application/json" }, body: JSON.stringify({ operation: "snapshot" }) });
  return { status: response.status, body: await response.json() };
};

const ownerEmail = `owner-control-${crypto.randomUUID()}@example.invalid`;
const ownerCreated = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
if (ownerCreated.error || !ownerCreated.data.user) throw new Error("LOCAL_OWNER_CREATE_FAILED");
const bootstrap = await admin.rpc("owner_control_bootstrap_first_owner", { target_user_id: ownerCreated.data.user.id, bootstrap_reason: "Fictional local-only protected CI bootstrap" });
if (bootstrap.error) throw new Error(`LOCAL_OWNER_BOOTSTRAP_FAILED:${String(bootstrap.error.code || "unknown").replace(/[^A-Z0-9_-]/gi, "")}:${String(bootstrap.error.message || "unknown").replace(/[^A-Z0-9 _:-]/gi, "").slice(0, 160)}`);
const ownerBrowser = createClient(endpoint, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ownerSignIn = await ownerBrowser.auth.signInWithPassword({ email: ownerEmail, password });
if (ownerSignIn.error || !ownerSignIn.data.session) throw new Error("LOCAL_OWNER_SIGN_IN_FAILED");
const aal1 = await invoke(ownerSignIn.data.session.access_token);
if (aal1.status !== 403 || aal1.body.error !== "STRONG_MFA_REQUIRED") throw new Error("LOCAL_AAL1_DENIAL_FAILED");
const ownerEnrollment = await ownerBrowser.auth.mfa.enroll({ factorType: "totp", friendlyName: "Fictional owner-control CI" });
if (ownerEnrollment.error) throw new Error("LOCAL_OWNER_MFA_ENROLL_FAILED");
const ownerChallenge = await ownerBrowser.auth.mfa.challengeAndVerify({ factorId: ownerEnrollment.data.id, code: totp(ownerEnrollment.data.totp.secret) });
if (ownerChallenge.error) throw new Error("LOCAL_OWNER_MFA_VERIFY_FAILED");
const ownerSession = await ownerBrowser.auth.getSession();
const ownerResult = await invoke(ownerSession.data.session?.access_token || "");
if (ownerResult.status !== 200 || ownerResult.body.authorization?.role !== "Owner" || !Array.isArray(ownerResult.body.data?.organizations)) throw new Error("LOCAL_OWNER_CONTROL_SNAPSHOT_FAILED");

const customer = await createAal2(`customer-control-denial-${crypto.randomUUID()}@example.invalid`);
const customerResult = await invoke(customer.accessToken);
if (customerResult.status !== 403 || customerResult.body.error !== "ACCESS_DENIED") throw new Error("LOCAL_CUSTOMER_CONTROL_DENIAL_FAILED");

console.log("Owner control local integration: 6/6 passed (AAL1 denial, MFA enrolment, AAL2 owner, snapshot, customer denial, safe response).");
