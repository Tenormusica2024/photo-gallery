-- storage_usage トリガーに UPDATE 対応を追加
-- file_size や media_type が変更された場合にストレージ使用量を正しく反映する
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
    -- file_size または media_type が変更された場合のみ更新
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
$$ language plpgsql security definer;

-- トリガーを UPDATE にも対応させる
drop trigger if exists on_photo_change on public.photos;
create trigger on_photo_change
  after insert or update or delete on public.photos
  for each row execute function public.update_storage_usage();
