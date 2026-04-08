@AGENTS.md

## Design Decisions

- **未ログイン時**: デモ画像を表示（ログインリダイレクト不要。ランディングページ的役割）
- **ストレージ**: Cloudinary一本（Supabase Storageバケットは不使用・マイグレーションから削除）
- **RLSポリシー**: family_members自己参照はSECURITY DEFINER関数で回避（003_fix_rls_recursion.sql）
- **アップロード**: Cloudinary署名付きアップロード（API Secretはサーバーサイドのみ。`/api/cloudinary-signature`で署名生成）
- **認証**: @supabase/ssr + proxy.ts（Next.js 16）でサーバーサイドセッションリフレッシュ

## TODO（将来対応）

- Supabase SDKバンドルサイズ最適化（tree-shaking改善の余地あり。計測が必要）
- オーナー専用ツール管理画面（/admin/system等。全ユーザーの統計・Cloudinary API使用量・エラーログ集約）

## 学んだ教訓

- レビューループ（/rfl）完了後は必ず /go-robust を実行する。スキル定義に明記されていても実行漏れが起きた実績あり
- RLSポリシーでテーブルが自分自身をサブクエリ参照すると無限再帰（42P17）が起きる。SECURITY DEFINER関数で回避する
- Supabase anon keyが変更される場合がある。ハードコードせず必ず環境変数から取得する
- 認証チェックではgetUser()（サーバーリクエスト）ではなくgetSession()（ローカルキャッシュ）を使う。getUser()はページ遷移ごとに100-300msのRTTが発生する
- next/font/googleのCSS変数名と@theme内の変数名が衝突すると循環参照になる。変数名を分ける
- proxy.tsでgetUser()を使うとページ遷移ごとにサーバーリクエストが発生するが、セッションリフレッシュ目的では必要（クライアント側のgetSession()と使い分ける）
