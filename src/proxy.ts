import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// セッショントークンの自動リフレッシュ（@supabase/ssr推奨パターン）
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase未設定時はスルー（デモモード）
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // リクエスト側にもセット（下流のServer Componentで読めるように）
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // レスポンスを再生成してSet-Cookieヘッダーを含める
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser()でトークンリフレッシュを発火させる
  // ここではセッションの有無だけ確認（認証ガードは各ページで実施）
  try {
    await supabase.auth.getUser();
  } catch {
    // トークンリフレッシュ失敗時は匿名ユーザーとして続行（各ページで認証ガード）
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // 静的ファイル・画像最適化・faviconを除外
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
