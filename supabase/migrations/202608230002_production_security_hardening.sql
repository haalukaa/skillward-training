-- Production hardening for the Phase 1 multi-organisation foundation.
-- The platform-managed event trigger still runs as its owner; browser roles
-- must never be able to invoke its SECURITY DEFINER function directly.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

comment on function public.rls_auto_enable() is
  'Platform event-trigger implementation. Direct API execution is prohibited.';
