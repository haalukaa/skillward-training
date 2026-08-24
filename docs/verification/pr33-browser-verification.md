# PR #33 browser verification record

This record preserves the browser evidence gathered before the isolated local
Supabase CI gate was added. It applies to the hosted PR preview at Phase 1
commit `3ab4462829a4887e87a983484e6254d1dff996ed` and does not describe production.

## Hosted preview already verified

- Desktop viewport: 1348 x 936.
- `/app/` direct sign-in entry and `/demo/` separation rendered correctly.
- Hospital, Aged Care and Disability Support were selectable with fictional
  worker, trainer and management workspaces.
- Management Home, Training, Staff and Reports rendered distinct demo views.
- Profile, Workspace and Sign Out controls opened without SkillWard-origin
  console errors.
- Expired invitation and invalid recovery routes rendered safe error states.
- Primary preview routes and static assets returned successful responses.

The hosted browser could not provide a reliable exact 390 x 844 viewport or a
safe local Auth/Mailpit environment. Those gates remain separate and must pass
in the new GitHub Actions workflow before this draft can become ready for
review. The workflow uses only loopback Supabase services and fictional data.
