import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

if (!isConfigured) {
  console.warn("[Supabase] 環境変数が未設定です。デモモードで動作します。");
}

// 未設定時はクエリを実行しない（呼び出し側で isConfigured をチェック）
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null!;
