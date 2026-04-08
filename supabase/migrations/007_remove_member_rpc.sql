-- ============================================================
-- Migration 007: メンバー削除をRPC経由に統一
--
-- INSERT同様、DELETE操作もSECURITY DEFINER RPCに統一し
-- クライアントからの直接DELETE依存を排除する
-- ============================================================

-- 直接DELETEを禁止（RPCのみが削除可能）
drop policy if exists "Admins can remove members" on public.family_members;
create policy "No direct delete from family_members" on public.family_members
  for delete to authenticated
  using (false);

-- メンバー削除RPC（adminのみ実行可能）
-- member_idはfamily_members.idカラムの値
create or replace function public.remove_family_member(member_id uuid)
returns jsonb as $$
declare
  v_user_id uuid := auth.uid();
  v_target record;
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

  delete from public.family_members where id = member_id;

  return jsonb_build_object(
    'status', 'removed',
    'member_id', member_id
  );
end;
$$ language plpgsql security definer;
