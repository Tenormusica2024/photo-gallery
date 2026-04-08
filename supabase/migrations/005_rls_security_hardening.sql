-- ============================================================
-- Migration 005: RLS Security Hardening
--
-- 4つのクリティカルなRLS脆弱性を修正:
-- 1. family_members INSERT: 任意のfamily_idへの自己追加を防止
--    → SECURITY DEFINER RPC経由に寄せ、RLSでrole=memberを強制
-- 2. photos INSERT/UPDATE: family_id所属チェックを追加
-- 3. profiles SELECT: authenticated + 本人or同一家族メンバーに限定
-- 4. family_groups SELECT: 所属メンバーのみSELECT可、
--    招待コード照合は専用RPCで
-- ============================================================

-- ============================================================
-- 1. family_groups: メンバーのみSELECT + 招待コード照合RPC
-- ============================================================

-- 既存の全公開SELECTポリシーを削除
drop policy if exists "Family groups visible to authenticated users" on public.family_groups;

-- メンバーのみ閲覧可能に変更
create policy "Family groups visible to members only" on public.family_groups
  for select to authenticated
  using (
    id in (select public.get_my_family_ids())
  );

-- 招待コード照合用RPC（RLSをバイパスしてコード検証のみ行う）
-- 招待コードが一致するファミリーのid, nameのみを返す（invite_code自体は返さない）
create or replace function public.lookup_family_by_invite(invite text)
returns table(id uuid, name text) as $$
  select fg.id, fg.name
  from public.family_groups fg
  where fg.invite_code = invite
  limit 1;
$$ language sql security definer stable;

-- ============================================================
-- 2. family_members INSERT: RPC経由のみ許可
-- ============================================================

-- 既存のINSERTポリシーを削除（直接INSERTを禁止）
drop policy if exists "Members can join via invite" on public.family_members;

-- 直接INSERTを完全に禁止（RPCのみが挿入可能）
-- RPC内のSECURITY DEFINER関数がRLSをバイパスして挿入する
create policy "No direct insert to family_members" on public.family_members
  for insert to authenticated
  with check (false);

-- 招待コード経由でファミリーに参加するRPC
-- role='member'を強制し、招待コードの一致を検証する
-- INSERT ON CONFLICTで並行実行時のrace conditionを防止
create or replace function public.join_family_by_invite(invite_code text)
returns jsonb as $$
declare
  v_family_id uuid;
  v_family_name text;
  v_user_id uuid := auth.uid();
  v_row_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'auth_required');
  end if;

  select fg.id, fg.name into v_family_id, v_family_name
  from public.family_groups fg
  where fg.invite_code = join_family_by_invite.invite_code
  limit 1;

  if v_family_id is null then
    return jsonb_build_object('error', 'invalid_invite');
  end if;

  -- INSERT ON CONFLICTで既存メンバーの場合もエラーなく処理
  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_user_id, 'member')
  on conflict (family_id, user_id) do nothing;

  -- 挿入されたかどうかで判定
  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return jsonb_build_object(
      'status', 'already_member',
      'family_id', v_family_id,
      'family_name', v_family_name
    );
  end if;

  return jsonb_build_object(
    'status', 'joined',
    'family_id', v_family_id,
    'family_name', v_family_name
  );
end;
$$ language plpgsql security definer;

-- ファミリー作成RPC（admin/page.tsxから使用）
-- family_groupsのINSERTとfamily_membersへのadmin追加を1トランザクションで実行
-- with check (false) ポリシーをバイパスするためSECURITY DEFINER必須
create or replace function public.create_family_with_admin(family_name text)
returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invite_code text;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'auth_required');
  end if;

  if trim(family_name) = '' then
    return jsonb_build_object('error', 'name_required');
  end if;

  -- ファミリーグループを作成
  insert into public.family_groups (name, created_by)
  values (trim(family_name), v_user_id)
  returning id, invite_code into v_family_id, v_invite_code;

  -- 作成者をadminとして追加
  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_user_id, 'admin');

  return jsonb_build_object(
    'status', 'created',
    'id', v_family_id,
    'name', trim(family_name),
    'invite_code', v_invite_code
  );
end;
$$ language plpgsql security definer;

-- ============================================================
-- 3. photos INSERT/UPDATE: family_id所属チェック追加
-- ============================================================

-- 既存のINSERTポリシーを置き換え（family_id + album_id検証を追加）
drop policy if exists "Users can upload own photos" on public.photos;
create policy "Users can upload own photos" on public.photos
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      -- family_idがnullなら個人写真として許可
      family_id is null
      -- family_idが指定されている場合、そのファミリーに所属していること
      or family_id in (select public.get_my_family_ids())
    )
    and (
      -- album_idがnullならアルバムなし写真として許可
      album_id is null
      -- album_idが指定されている場合、自分のアルバムであること
      or album_id in (select a.id from public.albums a where a.user_id = auth.uid())
    )
  );

-- 既存のUPDATEポリシーを置き換え（family_id + album_id変更時の検証を追加）
drop policy if exists "Users can update own photos" on public.photos;
create policy "Users can update own photos" on public.photos
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      family_id is null
      or family_id in (select public.get_my_family_ids())
    )
    and (
      album_id is null
      or album_id in (select a.id from public.albums a where a.user_id = auth.uid())
    )
  );

-- ============================================================
-- 4. profiles SELECT: authenticated + 本人or同一家族メンバーに限定
-- ============================================================

-- 既存の全公開SELECTポリシーを削除
drop policy if exists "Profiles are viewable by everyone" on public.profiles;

-- 本人 or 同一ファミリーメンバーのみ閲覧可能
create policy "Profiles viewable by self or family members" on public.profiles
  for select to authenticated
  using (
    -- 自分自身のプロフィール
    id = auth.uid()
    -- 同じファミリーに所属するメンバーのプロフィール
    or id in (
      select fm.user_id from public.family_members fm
      where fm.family_id in (select public.get_my_family_ids())
    )
  );
