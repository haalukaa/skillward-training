-- Production hardening for the Phase 1 multi-organisation foundation.
-- The platform-managed event trigger still runs as its owner; browser roles
-- must never be able to invoke its SECURITY DEFINER function directly.
do $hardening$
begin
  -- Hosted Supabase projects install this platform function. The local CLI
  -- test stack may omit it, so keep clean resets portable and deterministic.
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
    execute $comment$comment on function public.rls_auto_enable() is
      'Platform event-trigger implementation. Direct API execution is prohibited.'$comment$;
  end if;
end
$hardening$;
