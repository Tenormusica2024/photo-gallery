import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

if (!isConfigured) {
  console.warn("[Supabase] 環境変数が未設定です。デモモードで動作します。");
}

// 未設定時はクエリを実行しない（呼び出し側で isConfigured をチェック）
// null! ではなく明示的に null を返し、型で未設定状態を表現
export const supabase = isConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : (null as unknown as SupabaseClient);
