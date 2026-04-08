-- Profiles (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- Albums
create table if not exists public.albums (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  cover_photo_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Photos
create table if not exists public.photos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  album_id uuid references public.albums(id) on delete set null,
  title text,
  description text,
  storage_path text not null,
  url text not null,
  width integer,
  height integer,
  file_size bigint,
  created_at timestamptz default now() not null,
  uploaded_at timestamptz default now() not null
);

-- Add foreign key for cover_photo after photos table exists
alter table public.albums
  add constraint albums_cover_photo_fkey
  foreign key (cover_photo_id) references public.photos(id) on delete set null;

-- Indexes
create index if not exists idx_photos_user_id on public.photos(user_id);
create index if not exists idx_photos_album_id on public.photos(album_id);
create index if not exists idx_albums_user_id on public.albums(user_id);

-- RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.albums enable row level security;
alter table public.photos enable row level security;

-- Profiles: users can read all, update own
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Albums: authenticated users can CRUD own
create policy "Albums are viewable by authenticated users" on public.albums
  for select to authenticated using (true);
create policy "Users can create own albums" on public.albums
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own albums" on public.albums
  for update to authenticated using (auth.uid() = user_id);
create policy "Users can delete own albums" on public.albums
  for delete to authenticated using (auth.uid() = user_id);

-- Photos: authenticated users can view all, CRUD own
create policy "Photos are viewable by authenticated users" on public.photos
  for select to authenticated using (true);
create policy "Users can upload own photos" on public.photos
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own photos" on public.photos
  for update to authenticated using (auth.uid() = user_id);
create policy "Users can delete own photos" on public.photos
  for delete to authenticated using (auth.uid() = user_id);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Note: Storage uses Cloudinary (not Supabase Storage)
