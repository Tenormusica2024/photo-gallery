# pastelalbum

家族向けのプライベートフォトギャラリーです。`Next.js 16` をフロントに使い、認証とデータ管理は `Supabase`、画像・動画アップロードは `Cloudinary` を使います。

## 主な機能

- メールアドレスとパスワードでログイン / サインアップ
- 写真と動画のアップロード
- ファミリーグループ作成と招待リンク参加
- アルバム作成
- 管理者向けの利用状況確認
- Supabase 未設定時のデモ表示

## 技術スタック

- Next.js 16 / React 19 / TypeScript
- Tailwind CSS 4
- Supabase Auth + Postgres + RLS
- Cloudinary signed upload

## セットアップ

この repo には大きく 3 段階ある:

1. **demo mode**  
   Supabase / Cloudinary 未設定でも、画面構造とビルド健全性だけ確認する段階
2. **integration setup**  
   専用 Supabase project と Cloudinary をつないで認証・招待・アップロードまで有効化する段階
3. **post-setup validation**  
   migration / RPC / E2E を含めて本番に近い確認をする段階

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数を設定

`.env.local` に以下を設定します。

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_DB_PASSWORD=...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

補足:

- `NEXT_PUBLIC_` 付きの値はクライアントでも参照されます
- `SUPABASE_DB_PASSWORD` は Supabase ログイン用ではなく Postgres 接続用パスワードです
- Supabase 未設定時、トップページはデモ表示になります
- 認証、招待、アップロード、管理画面は設定完了後に利用可能です

重要:

- このアプリ用に `Supabase` は専用プロジェクトを使ってください
- 既存の別アプリと shared DB を使うと、migration 履歴や RPC 名の衝突で壊しやすいです
- `push:supabase-migrations` は `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` を対象に実行します

### 3. Supabase マイグレーションを適用

このリポジトリには `supabase/migrations` 配下にスキーマと RLS 定義があります。

主な内容:

- `profiles`, `albums`, `photos`
- `family_groups`, `family_members`
- `storage_usage`
- 招待参加 / ファミリー作成 / メンバー削除用 RPC
- RLS hardening と last-admin guard

反映順:

```bash
npm run push:supabase-migrations
npm run check:supabase-rpcs
```

内部的には次の migration を適用します。

```text
001_initial_schema.sql
002_mitene_features.sql
003_fix_rls_recursion.sql
004_storage_trigger_update.sql
005_rls_security_hardening.sql
006_albums_rls_hardening.sql
007_remove_member_rpc.sql
008_last_admin_guard.sql
```

Supabase CLI を直接使う場合の例:

```bash
supabase db push
```

ローカル開発環境を使う場合の例:

```bash
supabase start
supabase db reset
```

### 4. 開発サーバーを起動

```bash
npm run dev
```

`http://localhost:3000` を開いて確認します。

## Demo mode validation

fresh clone 直後に **「この fork は最低限 healthy か」** を見たいだけなら、まずは integration 系コマンドを混ぜずに次だけでよい。

```bash
npm run verify:demo
```

これは次をまとめて実行する:

- `npm run lint`
- `npm test`
- `npm run build`

Supabase / Cloudinary 未設定でも、demo 表示前提の UI とビルド健全性を確認できる。

## Cloudinary アップロードについて

- クライアントは `/api/cloudinary-signature` から署名を取得してアップロードします
- DB 保存に失敗した場合は `/api/cloudinary-delete` 経由で orphan asset の cleanup を試みます
- アップロード先フォルダは `pastelalbum` 配下に制限しています
- プロフィール画像は `pastelalbum/avatars` を使います

## Supabase RPC の確認

`family` / `invite` 系の動作確認前に、必要 RPC が schema cache から見えているかを確認できます。

```bash
npm run check:supabase-rpcs
```

`PGRST202` が出る場合は、migration 未反映または PostgREST schema cache 未更新です。

remote へ migration を流すときは、DB パスワードを `.env.local` または環境変数の `SUPABASE_DB_PASSWORD` に入れたうえで実行します。

```bash
npm run push:supabase-migrations
```

dry-run のみ見たい場合:

```bash
node scripts/push-supabase-migrations.mjs --dry-run
```

期待する RPC:

- `lookup_family_by_invite`
- `join_family_by_invite`
- `create_family_with_admin`
- `remove_family_member`

## 利用可能なスクリプト

```bash
npm run dev
npm run build
npm run start
npm run lint
npm test
npm run test:e2e
npm run check:supabase-rpcs
npm run push:supabase-migrations
npm run seed:supabase-demo
npm run audit:cloudinary
```

## Seed データ

専用 Supabase プロジェクトへ、動作確認用の最小データを流せます。

```bash
npm run seed:supabase-demo
```

必要なら引数で上書きできます。

```bash
node scripts/seed-supabase-demo.mjs --prefix=mydemo --password=my-secret-pass --family="田中ファミリー"
```

作成するもの:

- admin ユーザー 1 人
- member ユーザー 1 人
- family 1 件
- album 1 件
- image 2 件
- video 1 件

出力される `Admin email` / `Member email` / `Password` でそのままログインできます。

## Cloudinary 監査

DB 上の Cloudinary 参照と、実際の Cloudinary アセット一覧を突き合わせて orphan asset を監査できます。

```bash
npm run audit:cloudinary
```

オプション:

```bash
node scripts/audit-cloudinary-assets.mjs --prefix=pastelalbum --limit=20
node scripts/audit-cloudinary-assets.mjs --cleanup
```

挙動:

- `res.cloudinary.com` を向いている `photos` 行だけを監査対象にします
- `--cleanup` なしでは dry-run です
- `--cleanup` を付けると、DB に存在しない Cloudinary アセットを削除します

## 品質確認

### Post-setup validation

Supabase migration 済み・必要 secret 設定済みの状態では、次も実行する。

```bash
npm run verify:demo
npm run check:supabase-rpcs
npm run test:e2e
npm run audit:cloudinary
```

補足:

- `npm run verify:demo` は demo mode でも使える軽量確認
- `npm run check:supabase-rpcs` と `npm run push:supabase-migrations` は **integration setup 後**
- `npm run test:e2e` は認証・招待・アップロードを含むため、Supabase / Cloudinary が実接続できる状態で回す

### Integration-only operations

専用 Supabase project と secret が揃った後に使うもの:

```bash
npm run push:supabase-migrations
npm run check:supabase-rpcs
npm run lint
npm run test:e2e
```

## テストについて

Vitest ベースの自動テストを追加済みです。現在カバーしている範囲:

- Cloudinary 署名 API
- Cloudinary アップロードヘルパー
- 設定不足時の共通 UI コンポーネント
- `login`, `invite`, `album/[id]`, `upload`, `admin`, `profile` の設定不足ガード表示
- `login` の redirect / open redirect 防止
- `invite` の code なし / invalid / lookup success / join 分岐
- `upload` のサイズバリデーション、プレビュー生成、album 所有権エラー、Cloudinary 失敗、DB 保存失敗、正常アップロード
- Cloudinary 署名 API と cleanup API
- `profile` の認証済み表示と表示名更新
- `album/[id]` の not found / empty state / ギャラリー表示
- `admin` の認証済み概要表示、ファミリー作成 RPC、メンバー削除、招待リンクコピー、エラーログ表示、非 admin 分岐
- Playwright による `login/signup` セッション確立、未ログイン `upload` リダイレクト、認証済み `profile` / `upload` 到達確認、`profile` の表示名更新とアルバム作成
- Playwright による `upload` の成功系、署名 API 失敗、Cloudinary 失敗、DB 保存失敗
- Playwright による `family` 作成 -> 招待参加
- Playwright による `admin` の招待リンクコピーとメンバー削除
- Playwright による `admin` のエラーログ表示と機密情報マスク確認
- `family` 系 RPC が未反映または schema cache ずれのときに、`admin` / `invite` で案内メッセージを表示

現時点でまだ未カバーの範囲:

- 本番データ移行や seed 手順
- 運用時の orphan asset 監査 / 再実行バッチ
- 複数メンバー・大量データ前提の負荷確認

## デプロイ前チェック

- Supabase はこのアプリ専用プロジェクトを向いている
- Supabase 環境変数が本番値で入っている
- Cloudinary 環境変数が本番値で入っている
- `supabase/migrations` が本番 DB に反映済み
- `npm run check:supabase-rpcs` が通る
- `npm test` が通る
- `npm run test:e2e` が通る
- `npm run lint` が通る
- `npm run build` が通る
