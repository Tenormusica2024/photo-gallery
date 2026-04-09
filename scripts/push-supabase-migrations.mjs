import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getProjectRef(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0];
  } catch {
    return null;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

loadDotEnv(resolve(process.cwd(), ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const dryRun = process.argv.includes("--dry-run");

if (!supabaseUrl) {
  console.error("NEXT_PUBLIC_SUPABASE_URL が未設定です。");
  process.exit(1);
}

if (!dbPassword) {
  console.error("SUPABASE_DB_PASSWORD が未設定です。remote に migration を push するには DB パスワードが必要です。");
  process.exit(1);
}

const projectRef = getProjectRef(supabaseUrl);

if (!projectRef) {
  console.error("NEXT_PUBLIC_SUPABASE_URL から project ref を抽出できませんでした。");
  process.exit(1);
}

console.log(`Linking Supabase project: ${projectRef}`);
run("npx", ["supabase", "link", "--project-ref", projectRef, "--password", dbPassword, "--yes"]);

console.log(dryRun ? "Running dry-run migration push..." : "Pushing migrations...");
run("npx", [
  "supabase",
  "db",
  "push",
  "--linked",
  "--password",
  dbPassword,
  "--yes",
  ...(dryRun ? ["--dry-run"] : []),
]);
