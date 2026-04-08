-- ============================================================
-- Migration 008: ラストadmin削除防止 + search_path固定
--
-- remove_family_memberにラストadminガードを追加し、
-- ファミリーが管理者不在になることを防止する。
-- 007で未設定だったsearch_pathも修正。
-- ============================================================

create or replace function public.remove_family_member(member_id uuid)
returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_target record;
  v_admin_count integer;
begin
  if v_user_id is null then
    return jsonb_build_object('status', 'error', 'code', 'auth_required');
  end if;

  -- 削除対象のメンバー情報を取得
  select fm.id, fm.family_id, fm.user_id, fm.role
  into v_target
  from public.family_members fm
  where fm.id = member_id;

  if v_target is null then
    return jsonb_build_object('status', 'error', 'code', 'member_not_found');
  end if;

  -- 実行者がそのファミリーのadminであることを確認
  if not exists (
    select 1 from public.family_members
    where family_id = v_target.family_id
      and user_id = v_user_id
      and role = 'admin'
  ) then
    return jsonb_build_object('status', 'error', 'code', 'not_admin');
  end if;

  -- adminが自分自身を削除することを防止（孤立ファミリー防止）
  if v_target.user_id = v_user_id then
    return jsonb_build_object('status', 'error', 'code', 'cannot_remove_self');
  end if;

  -- ラストadmin削除防止: 対象がadminの場合、他にadminがいるか確認
  if v_target.role = 'admin' then
    select count(*) into v_admin_count
    from public.family_members
    where family_id = v_target.family_id and role = 'admin';

    if v_admin_count <= 1 then
      return jsonb_build_object('status', 'error', 'code', 'last_admin');
    end if;
  end if;

  delete from public.family_members where id = member_id;

  return jsonb_build_object(
    'status', 'removed',
    'member_id', member_id
  );
end;
$$ language plpgsql security definer
set search_path = public;
