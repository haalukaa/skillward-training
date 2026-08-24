import { createClient } from "@supabase/supabase-js";
import { FIXTURES, LOCAL_PASSWORD } from "../tests/e2e/fixtures.mjs";

const url = process.env.SKILLWARD_LOCAL_API_ENDPOINT?.trim();
const publicKey = process.env.SKILLWARD_LOCAL_PUBLIC_KEY?.trim();
if (!url || !publicKey) throw new Error("Local public Auth configuration is required.");
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  throw new Error("Refusing to verify Auth logout outside loopback Supabase.");
}

const client = createClient(url, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const { data, error } = await client.auth.signInWithPassword({
  email: FIXTURES.desktop.worker.email,
  password: LOCAL_PASSWORD
});
if (error || !data.session?.access_token) throw new Error("Local Auth logout probe could not sign in.");

const response = await fetch(`${url}/auth/v1/logout?scope=local`, {
  method: "POST",
  headers: { apikey: publicKey, Authorization: `Bearer ${data.session.access_token}` }
});
if (!response.ok) throw new Error(`Local Auth logout endpoint returned ${response.status}.`);
console.log(`Verified real local Auth logout endpoint (${response.status}).`);
