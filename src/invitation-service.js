export function parseInvitationCallback(urlValue) {
  const url = new URL(urlValue, "https://skillward.invalid/");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const type = url.searchParams.get("type") || hash.get("type");
  const code = url.searchParams.get("code");
  const requested = url.searchParams.get("invitation") === "1" || type === "invite" || type === "signup";
  const legacy = (requested || ["invite", "signup"].includes(type || ""))
    && hash.has("access_token") && hash.has("refresh_token");
  return {
    requested,
    code,
    legacy,
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    errorCode: url.searchParams.get("error_code") || hash.get("error_code"),
    errorDescription: url.searchParams.get("error_description") || hash.get("error_description")
  };
}

export async function establishInvitationSession(client, callback) {
  if (!client || !callback?.requested || callback.errorCode || (!callback.code && !callback.legacy)) {
    throw new Error("INVITATION_INVALID");
  }
  const result = callback.code
    ? await client.auth.exchangeCodeForSession(callback.code)
    : await client.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken
      });
  if (result?.error || !result?.data?.session?.user) throw new Error("INVITATION_INVALID");
  return result.data.session;
}

export class InvitationService {
  constructor(client) { this.client = client; }
  parseCallback(urlValue) { return parseInvitationCallback(urlValue); }
  establishSession(callback) { return establishInvitationSession(this.client, callback); }
}

globalThis.SkillWardInvitation = { parseInvitationCallback };
