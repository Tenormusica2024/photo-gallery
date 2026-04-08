-- ============================================================
-- Migration 002: "Mitene"-style features
-- - Family groups with invite system
-- - Visibility levels (everyone / admin-only)
-- - Video support
-- - Storage tracking for admin dashboard
-- - Member roles (admin / member)
-- ============================================================

-- Family groups
create table if not exists public.family_groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  invite_code text unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz default now() not null
);

-- Family memberships
create table if not exists public.family_members (
  id uuid default gen_random_uuid() primary key,
  family_id uuid references public.family_groups(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz default now() not null,
  unique(family_id, user_id)
);

-- Add family_id and visibility to albums
alter table public.albums add column if not exists family_id uuid references public.family_groups(id) on delete set null;

-- Add visibility and media_type to photos
alter table public.photos add column if not exists visibility text not null default 'everyone' check (visibility in ('everyone', 'admin_only'));
alter table public.photos add column if not exists media_type text not null default 'image' check (media_type in ('image', 'video'));
alter table public.photos add column if not exists duration integer; -- video duration in seconds
alter table public.photos add column if not exists thumbnail_url text; -- video thumbnail
alter table public.photos add column if not exists family_id uuid references public.family_groups(id) on delete set null;

-- Storage usage tracking (materialized for dashboard)
create table if not exists public.storage_usage (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  total_bytes bigint default 0,
  photo_count integer default 0,
  video_count integer default 0,
  last_updated timestamptz default now()
);

-- Indexes
create index if not exists idx_family_members_family on public.family_members(family_id);
create index if not exists idx_family_members_user on public.family_members(user_id);
create index if not exists idx_photos_family on public.photos(family_id);
create index if not exists idx_photos_visibility on public.photos(visibility);
create index if not exists idx_family_groups_invite on public.family_groups(invite_code);

-- RLS for family_groups
alter table public.family_groups enable row level security;

-- 認証済みユーザーはファミリーグループを閲覧可能（招待コードでの検索を許可するため）
create policy "Family groups visible to authenticated users" on public.family_groups
  for select to authenticated
  using (true);

create policy "Authenticated users can create family groups" on public.family_groups
  for insert to authenticated
  with check (created_by = auth.uid());

-- RLS for family_members
alter table public.family_members enable row level security;

create policy "Members can view their family members" on public.family_members
  for select to authenticated
  using (
    family_id in (select family_id from public.family_members fm where fm.user_id = auth.uid())
  );

create policy "Members can join via invite" on public.family_members
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Admins can remove members" on public.family_members
  for delete to authenticated
  using (
    family_id in (
      select family_id from public.family_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- RLS for storage_usage
alter table public.storage_usage enable row level security;

create policy "Admins can view storage usage" on public.storage_usage
  for select to authenticated
  using (
    user_id = auth.uid()
    or user_id in (
      select fm2.user_id from public.family_members fm1
      join public.family_members fm2 on fm1.family_id = fm2.family_id
      where fm1.user_id = auth.uid() and fm1.role = 'admin'
    )
  );

-- Update photos RLS to respect visibility
drop policy if exists "Photos are viewable by authenticated users" on public.photos;

create policy "Photos viewable by family members with visibility check" on public.photos
  for select to authenticated
  using (
    -- Own photos always visible
    user_id = auth.uid()
    -- Photos in same family group
    or (
      family_id in (select family_id from public.family_members where user_id = auth.uid())
      and (
        visibility = 'everyone'
        or (
          visibility = 'admin_only'
          and family_id in (
            select family_id from public.family_members
            where user_id = auth.uid() and role = 'admin'
          )
        )
      )
    )
    -- Photos without family group (legacy)
    or (family_id is null and user_id = auth.uid())
  );

-- Function to update storage usage after photo insert/delete
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
$$ language plpgsql security definer;

create or replace trigger on_photo_change
  after insert or delete on public.photos
  for each row execute function public.update_storage_usage();

-- Note: Video storage uses Cloudinary (not Supabase Storage)

-- Add profile fields for family context
alter table public.profiles add column if not exists role text default 'user' check (role in ('admin', 'user'));
