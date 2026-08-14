-- Trainers may read only the profiles of trainees formally assigned to them.
create policy assigned_trainer_profile_read
on public.user_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.trainer_assignments assignment
    where assignment.trainer_user_id = auth.uid()
      and assignment.trainee_user_id = user_profiles.user_id
      and assignment.is_active
  )
);
