@AGENTS.md

## Design Decisions

- **未ログイン時**: デモ画像を表示（ログインリダイレクト不要。ランディングページ的役割）
- **ストレージ**: Cloudinary一本（Supabase Storageバケットは不使用・マイグレーションから削除）
- **RLSポリシー**: family_members自己参照はSECURITY DEFINER関数で回避（003_fix_rls_recursion.sql）。family_members INSERTは直接禁止（with check false）し、join_family_by_invite / create_family_with_admin RPCのみ許可（005_rls_security_hardening.sql）
- **RLSセキュリティ方針**: profiles/family_groups/photosは全て最小権限。匿名アクセス不可。family_id/album_idの所属検証をRLSレベルで強制
- **アップロード**: Cloudinary署名付きアップロード（API Secretはサーバーサイドのみ。`/api/cloudinary-signature`で署名生成）
- **認証**: @supabase/ssr + proxy.ts（Next.js 16）でサーバーサイドセッションリフレッシュ。proxy.tsは全ルート（API含む）に適用。API routeも通過させることでセッションリフレッシュが漏れなく発火する設計（静的ファイル・画像最適化のみmatcherで除外）
- **マルチファミリー**: 1ユーザーが複数ファミリーに所属可能な設計（`get_my_family_ids()`は複数返す前提）。UIは現状1ファミリー表示だが、DB/RLS層は複数対応済み
- **RPC返り値統一**: 全SECURITY DEFINER RPCは `{status: "error", code: "..."}` | `{status: "success_variant", ...}` 形式。フロント側は `.status === "error"` で判定
- **招待コード照合の匿名アクセス**: `lookup_family_by_invite`は未認証でも呼べる（招待リンクを開いた未ログインユーザーにファミリー名を表示するUX要件）
- **family_members操作の完全RPC化**: INSERT/DELETE共にSECURITY DEFINER RPCのみ許可。直接操作はRLSでwith check(false)/using(false)で禁止

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
- RLSで直接INSERTを禁止（with check false）した場合、adminの初期メンバー追加も含めて全てSECURITY DEFINER RPCに移行する必要がある
- INSERT ON CONFLICTを使ってrace conditionを防止する。read-then-insertパターンは並行リクエストで破綻する
- テーブル間に複数のFK関係がある場合、PostgRESTの埋め込みリソース（`.select("*, related_table(count)")`等）は曖昧性エラー（PGRST201）になる。明示的にFK制約名を指定する（例: `photos!photos_album_id_fkey(count)`）。エラーは`data`がnullになるだけで`if (data)`チェックをすり抜けるため、発見が遅れやすい
- Supabaseの`.update().eq()`はRLSがブロックしてもエラーを返さず0行更新になる。`.update().eq().select()`とチェーンし、返却データが空なら権限エラーとして検出する
