import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

function summarizeStatus(name, result) {
  if (result.status === "missing") {
    return `MISSING  ${name}  ${result.message}`;
  }
  if (result.status === "ok") {
    return `OK       ${name}  ${result.message}`;
  }
  return `WARN     ${name}  ${result.message}`;
}

async function checkRpc(supabase, name, args, expectedCodes) {
  const { error, data } = await supabase.rpc(name, args);

  if (error?.code === "PGRST202") {
    return {
      status: "missing",
      message: "PostgREST schema cache に見つかりません",
    };
  }

  if (!error) {
    return {
      status: "ok",
      message: `応答あり (${JSON.stringify(data)})`,
    };
  }

  if (expectedCodes.has(error.code) || expectedCodes.has(error.message)) {
    return {
      status: "ok",
      message: `RPC は存在します (${error.code ?? error.message})`,
    };
  }

  return {
    status: "warn",
    message: `${error.code ?? "unknown"} ${error.message ?? ""}`.trim(),
  };
}

async function main() {
  loadDotEnv(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL または NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。");
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const checks = [
    {
      name: "lookup_family_by_invite",
      args: { invite: "__codex_probe__" },
      expectedCodes: new Set(),
    },
    {
      name: "join_family_by_invite",
      args: { invite_code: "__codex_probe__" },
      expectedCodes: new Set(["auth_required", "invalid_invite"]),
    },
    {
      name: "create_family_with_admin",
      args: { family_name: "__codex_probe__" },
      expectedCodes: new Set(["auth_required"]),
    },
    {
      name: "remove_family_member",
      args: { member_id: crypto.randomUUID() },
      expectedCodes: new Set(["auth_required", "member_not_found"]),
    },
  ];

  let hasMissing = false;

  console.log("Supabase RPC check");
  console.log(`URL: ${supabaseUrl}`);

  for (const check of checks) {
    const result = await checkRpc(supabase, check.name, check.args, check.expectedCodes);
    if (result.status === "missing") hasMissing = true;
    console.log(summarizeStatus(check.name, result));
  }

  if (hasMissing) {
    console.log("");
    console.log("不足している RPC があります。`supabase db push` 実行後、PostgREST schema cache を更新してください。");
    process.exitCode = 1;
  }
}

await main();
