-- ============================================================
-- Migration 003: Fix infinite recursion in RLS policies
--
-- Problem: family_members SELECT policy references itself,
-- causing "infinite recursion detected in policy for relation
-- family_members" (42P17) when any authenticated query touches
-- family_members (directly or via photos/storage_usage policies).
--
-- Fix: SECURITY DEFINER helper functions that bypass RLS
-- to look up family membership, breaking the recursion chain.
-- ============================================================

-- Helper: get current user's family IDs (bypasses RLS)
create or replace function public.get_my_family_ids()
returns setof uuid as $$
  select family_id from public.family_members where user_id = auth.uid();
$$ language sql security definer stable;

-- Helper: check if current user is admin of a given family
create or replace function public.is_family_admin(fid uuid)
returns boolean as $$
  select exists(
    select 1 from public.family_members
    where user_id = auth.uid() and family_id = fid and role = 'admin'
  );
$$ language sql security definer stable;

-- ============================================================
-- Fix family_members policies (self-referencing → helper fn)
-- ============================================================

drop policy if exists "Members can view their family members" on public.family_members;
create policy "Members can view their family members" on public.family_members
  for select to authenticated
  using (
    family_id in (select public.get_my_family_ids())
    or user_id = auth.uid()
  );

drop policy if exists "Admins can remove members" on public.family_members;
create policy "Admins can remove members" on public.family_members
  for delete to authenticated
  using (
    public.is_family_admin(family_id)
  );

-- ============================================================
-- Fix photos SELECT policy (references family_members → helper fn)
-- ============================================================

drop policy if exists "Photos viewable by family members with visibility check" on public.photos;
create policy "Photos viewable by family members with visibility check" on public.photos
  for select to authenticated
  using (
    -- Own photos always visible
    user_id = auth.uid()
    -- Photos in same family group
    or (
      family_id in (select public.get_my_family_ids())
      and (
        visibility = 'everyone'
        or (visibility = 'admin_only' and public.is_family_admin(family_id))
      )
    )
    -- Photos without family group (legacy)
    or (family_id is null and user_id = auth.uid())
  );

-- ============================================================
-- Fix storage_usage SELECT policy (references family_members → helper fn)
-- ============================================================

drop policy if exists "Admins can view storage usage" on public.storage_usage;
create policy "Admins can view storage usage" on public.storage_usage
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.family_members fm
      where fm.family_id in (select public.get_my_family_ids())
        and fm.user_id = storage_usage.user_id
        and public.is_family_admin(fm.family_id)
    )
  );
