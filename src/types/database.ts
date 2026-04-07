export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Album {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_photo_id: string | null;
  created_at: string;
  updated_at: string;
  photo_count?: number;
}

export interface Photo {
  id: string;
  user_id: string;
  album_id: string | null;
  title: string | null;
  description: string | null;
  storage_path: string;
  url: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  created_at: string;
  uploaded_at: string;
}

export interface AlbumWithPhotos extends Album {
  photos: Photo[];
}
