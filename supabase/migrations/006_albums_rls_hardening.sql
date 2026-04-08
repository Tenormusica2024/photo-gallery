-- ============================================================
-- Migration 006: albums RLS hardening
-- albumsのfamily_id制約を追加し、SECURITY DEFINER関数のsearch_pathを固定
-- ============================================================

-- ============================================================
-- 1. albums RLS: family_id所属チェック追加
-- ============================================================

drop policy if exists "Albums are viewable by authenticated users" on public.albums;
drop policy if exists "Users can create own albums" on public.albums;
drop policy if exists "Users can update own albums" on public.albums;

create policy "Albums are viewable by authenticated users" on public.albums
  for select to authenticated
  using (
    user_id = auth.uid()
    or family_id in (select public.get_my_family_ids())
  );

create policy "Users can create own albums" on public.albums
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      family_id is null
      or family_id in (select public.get_my_family_ids())
    )
  );

create policy "Users can update own albums" on public.albums
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      family_id is null
      or family_id in (select public.get_my_family_ids())
    )
  );

-- DELETEは既存ポリシー（auth.uid() = user_id）を維持

-- ============================================================
-- 2. SECURITY DEFINER関数のsearch_path固定
-- ============================================================

create or replace function public.get_my_family_ids()
returns setof uuid as $$
  select family_id from public.family_members where user_id = auth.uid();
$$ language sql security definer stable
set search_path = public;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer
set search_path = public;

create or replace function public.update_storage_usage()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.storage_usage (user_id, total_bytes, photo_count, video_count, last_updated)
    values (
      NEW.user_id,
      coalesce(NEW.file_size, 0),
      case when NEW.media_type = 'image' then 1 else 0 end,
      case when NEW.media_type = 'video' then 1 else 0 end,
      now()
    )
    on conflict (user_id) do update set
      total_bytes = storage_usage.total_bytes + coalesce(NEW.file_size, 0),
      photo_count = storage_usage.photo_count + case when NEW.media_type = 'image' then 1 else 0 end,
      video_count = storage_usage.video_count + case when NEW.media_type = 'video' then 1 else 0 end,
      last_updated = now();
    return NEW;
  elsif TG_OP = 'UPDATE' then
    if OLD.file_size is distinct from NEW.file_size or OLD.media_type is distinct from NEW.media_type then
      update public.storage_usage set
        total_bytes = greatest(0, total_bytes - coalesce(OLD.file_size, 0) + coalesce(NEW.file_size, 0)),
        photo_count = greatest(0, photo_count
          - case when OLD.media_type = 'image' then 1 else 0 end
          + case when NEW.media_type = 'image' then 1 else 0 end),
        video_count = greatest(0, video_count
          - case when OLD.media_type = 'video' then 1 else 0 end
          + case when NEW.media_type = 'video' then 1 else 0 end),
        last_updated = now()
      where user_id = NEW.user_id;
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update public.storage_usage set
      total_bytes = greatest(0, total_bytes - coalesce(OLD.file_size, 0)),
      photo_count = greatest(0, photo_count - case when OLD.media_type = 'image' then 1 else 0 end),
      video_count = greatest(0, video_count - case when OLD.media_type = 'video' then 1 else 0 end),
      last_updated = now()
    where user_id = OLD.user_id;
    return OLD;
  end if;
  return null;
end;
$$ language plpgsql security definer
set search_path = public;

create or replace function public.lookup_family_by_invite(invite text)
returns table(id uuid, name text) as $$
  select fg.id, fg.name
  from public.family_groups fg
  where fg.invite_code = invite
  limit 1;
$$ language sql security definer stable
set search_path = public;

create or replace function public.join_family_by_invite(invite_code text)
returns jsonb as $$
declare
  v_family_id uuid;
  v_family_name text;
  v_user_id uuid := auth.uid();
  v_row_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'error', 'code', 'auth_required');
  end if;

  select fg.id, fg.name into v_family_id, v_family_name
  from public.family_groups fg
  where fg.invite_code = join_family_by_invite.invite_code
  limit 1;

  if v_family_id is null then
    return jsonb_build_object('status', 'error', 'code', 'invalid_invite');
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_user_id, 'member')
  on conflict (family_id, user_id) do nothing;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return jsonb_build_object(
      'status', 'already_member',
      'family_id', v_family_id,
      'name', v_family_name
    );
  end if;

  return jsonb_build_object(
    'status', 'joined',
    'family_id', v_family_id,
    'name', v_family_name
  );
end;
$$ language plpgsql security definer
set search_path = public;

create or replace function public.create_family_with_admin(family_name text)
returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_code text;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'error', 'code', 'auth_required');
  end if;

  if trim(family_name) = '' then
    return jsonb_build_object('status', 'error', 'code', 'name_required');
  end if;

  if (select count(*) from public.family_members where user_id = v_user_id and role = 'admin') >= 5 then
    return jsonb_build_object('status', 'error', 'code', 'max_families_reached');
  end if;

  insert into public.family_groups (name, created_by)
  values (trim(family_name), v_user_id)
  returning id, invite_code into v_family_id, v_invite_code;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_user_id, 'admin');

  return jsonb_build_object(
    'status', 'created',
    'id', v_family_id,
    'name', trim(family_name),
    'invite_code', v_invite_code
  );
end;
$$ language plpgsql security definer
set search_path = public;

-- is_family_adminにもsearch_path固定を適用（003で未設定だった）
create or replace function public.is_family_admin(fid uuid)
returns boolean as $$
  select exists(
    select 1 from public.family_members
    where user_id = auth.uid() and family_id = fid and role = 'admin'
  );
$$ language sql security definer stable
set search_path = public;
