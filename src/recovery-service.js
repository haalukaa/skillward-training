const RECOVERY_PENDING_KEY = "skillwardPasswordRecoveryPending";

export function parseRecoveryCallback(urlValue) {
  const url = new URL(urlValue, "https://skillward.invalid/");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const type = url.searchParams.get("type") || hash.get("type");
  const code = url.searchParams.get("code");
  const legacy = type === "recovery" && hash.has("access_token") && hash.has("refresh_token");
  const requested = code !== null || type === "recovery" || url.searchParams.get("recovery") === "1" || url.searchParams.has("error");
  return { requested, code, legacy, accessToken: hash.get("access_token"), refreshToken: hash.get("refresh_token") };
}

export async function establishRecoverySession(client, callback) {
  if (!client || !callback.requested || (!callback.code && !callback.legacy)) throw new Error("RECOVERY_INVALID");

  let recoveryEventSession = null;
  const listener = client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") recoveryEventSession = session;
  });

  try {
    const result = callback.code
      ? await client.auth.exchangeCodeForSession(callback.code)
      : await client.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
    const session = recoveryEventSession || result?.data?.session;
    if (result?.error || !session?.user) throw new Error("RECOVERY_INVALID");
    return session;
  } catch {
    throw new Error("RECOVERY_INVALID");
  } finally {
    listener?.data?.subscription?.unsubscribe();
  }
}

export function markRecoveryPending(storage) { storage?.setItem(RECOVERY_PENDING_KEY, "1"); }
export function clearRecoveryPending(storage) { storage?.removeItem(RECOVERY_PENDING_KEY); }
export function isRecoveryPending(storage) { return storage?.getItem(RECOVERY_PENDING_KEY) === "1"; }

globalThis.SkillWardRecovery = {
  parseRecoveryCallback, markRecoveryPending, clearRecoveryPending, isRecoveryPending
};
