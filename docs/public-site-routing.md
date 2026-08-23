# Public marketing and application routing

SkillWard deliberately separates explanatory public pages from operational workforce screens.

| Route | Purpose | Saved application state |
| --- | --- | --- |
| `/` and public content routes | Marketing, solutions, resources, security and legal information | Never read |
| `/app/` | Supabase authentication, callbacks, recovery and role workspaces | Read only here |
| `/demo/` | Public entry to the isolated browser-sample role selector | Redirects to `/app/?demo=1` |

The production build emits static directory routes and a Netlify `_redirects` file. `netlify.toml` adds security headers and fallback behaviour. The root page detects legacy Supabase recovery or invitation parameters before marketing assets load and forwards them to `/app/`.

## Future `app.skillwardtraining.com`

The application uses root-relative shared assets and keeps its own canonical `/app/` entry. A future move should:

1. Deploy the existing `dist/app/index.html` operational shell at the subdomain.
2. Update Supabase Auth Site URL, permitted redirect URLs and `PUBLIC_SITE_URL` for invitation delivery.
3. Update recovery URL generation and the public `Sign In` links.
4. Retain a temporary `/app/*` redirect on the public domain.
5. Test invitation, PKCE, legacy hash recovery and sign-out before changing DNS.

Do not change DNS until the subdomain deployment and all callback URLs are verified.

## Demo request deployment

Required Edge Function environment variables:

- `PUBLIC_SITE_ORIGIN=https://skillwardtraining.com`
- `DEMO_REQUEST_RATE_LIMIT_SALT` — a long random secret, stored only in Supabase Functions secrets

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. Never add either the service-role key or the rate-limit salt to browser configuration. Deploy `request-demo` with JWT verification disabled only because it is a public lead endpoint; validation, origin checks, a honeypot and hashed-IP rate limiting are enforced inside the function.

Apply `202608230002_demo_requests.sql` before deploying the function. The frontend visibly reports that demo requests are unavailable when public Supabase configuration is missing.
