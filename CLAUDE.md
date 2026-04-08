@AGENTS.md

## Design Decisions

- **未ログイン時**: デモ画像を表示（ログインリダイレクト不要。ランディングページ的役割）
- **ストレージ**: Cloudinary一本（Supabase Storageバケットは不使用・マイグレーションから削除）
- **RLSポリシー**: family_members自己参照はSECURITY DEFINER関数で回避（003_fix_rls_recursion.sql）

## TODO（将来対応）

- @supabase/ssr移行（現在の@supabase/supabase-jsからの移行。ユーザー0の今が最適タイミング）
- Supabase SDKバンドルサイズ最適化（tree-shaking改善の余地あり。計測が必要）

## 学んだ教訓

- RLSポリシーでテーブルが自分自身をサブクエリ参照すると無限再帰（42P17）が起きる。SECURITY DEFINER関数で回避する
- Supabase anon keyが変更される場合がある。ハードコードせず必ず環境変数から取得する
- 認証チェックではgetUser()（サーバーリクエスト）ではなくgetSession()（ローカルキャッシュ）を使う。getUser()はページ遷移ごとに100-300msのRTTが発生する
- next/font/googleのCSS変数名と@theme内の変数名が衝突すると循環参照になる。変数名を分ける
