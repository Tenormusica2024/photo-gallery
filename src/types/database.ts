export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "admin" | "user";
  created_at: string;
}

export interface FamilyGroup {
  id: string;
  name: string;
  created_by: string | null;
  invite_code: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  role: "admin" | "member";
  joined_at: string;
  // joined fields
  profiles?: Profile;
}

export interface Album {
  id: string;
  user_id: string;
  family_id: string | null;
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
  family_id: string | null;
  title: string | null;
  description: string | null;
  storage_path: string;
  url: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  visibility: "everyone" | "admin_only";
  media_type: "image" | "video";
  duration: number | null;
  thumbnail_url: string | null;
  created_at: string;
  uploaded_at: string;
}

export interface StorageUsage {
  user_id: string;
  total_bytes: number;
  photo_count: number;
  video_count: number;
  last_updated: string;
}

export interface AlbumWithPhotos extends Album {
  photos: Photo[];
}
