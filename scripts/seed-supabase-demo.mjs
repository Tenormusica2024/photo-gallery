import { existsSync, readFileSync } from "node:fs";
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

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : fallback;
}

function toEmailSlug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function createAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUpOrSignIn(email, password) {
  const client = createAnonClient();
  const signUpResult = await client.auth.signUp({ email, password });

  if (signUpResult.error && !/already registered/i.test(signUpResult.error.message)) {
    throw signUpResult.error;
  }

  if (signUpResult.data.session) {
    return { client, user: signUpResult.data.user };
  }

  const signInResult = await client.auth.signInWithPassword({ email, password });
  if (signInResult.error) throw signInResult.error;
  return { client, user: signInResult.data.user };
}

async function insertAlbum(client, userId, familyId, title, description = null) {
  const { data, error } = await client
    .from("albums")
    .insert({
      user_id: userId,
      family_id: familyId,
      title,
      description,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function insertPhoto(client, payload) {
  const { error } = await client.from("photos").insert(payload);
  if (error) throw error;
}

async function main() {
  loadDotEnv(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL または NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。");
    process.exit(1);
  }

  const prefix = getArg("prefix", `seed-${Date.now()}`);
  const emailSlug = toEmailSlug(prefix || `seed-${Date.now()}`) || `seed-${Date.now()}`;
  const password = getArg("password", "pastelalbum-seed");
  const familyName = getArg("family", `Seed Family ${new Date().toLocaleDateString("ja-JP")}`);
  const adminEmail = `${emailSlug}.admin@gmail.com`;
  const memberEmail = `${emailSlug}.member@gmail.com`;

  const admin = await signUpOrSignIn(adminEmail, password);
  const { data: familyResult, error: familyError } = await admin.client.rpc("create_family_with_admin", {
    family_name: familyName,
  });
  if (familyError) throw familyError;
  if (!familyResult || familyResult.status === "error") {
    throw new Error(`family create failed: ${familyResult?.code ?? "unknown"}`);
  }

  const member = await signUpOrSignIn(memberEmail, password);
  const { data: joinResult, error: joinError } = await member.client.rpc("join_family_by_invite", {
    invite_code: familyResult.invite_code,
  });
  if (joinError) throw joinError;
  if (!joinResult || joinResult.status === "error") {
    throw new Error(`family join failed: ${joinResult?.code ?? "unknown"}`);
  }

  const adminAlbumId = await insertAlbum(
    admin.client,
    admin.user.id,
    familyResult.id,
    "Welcome Album",
    "Seed script で作成した初期アルバム",
  );

  await insertPhoto(admin.client, {
    user_id: admin.user.id,
    album_id: adminAlbumId,
    family_id: familyResult.id,
    title: "First Picnic",
    description: "seed image",
    storage_path: `pastelalbum/seed/${prefix}-first-picnic`,
    url: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1200&h=900&fit=crop",
    width: 1200,
    height: 900,
    file_size: 320000,
    media_type: "image",
    visibility: "everyone",
  });

  await insertPhoto(admin.client, {
    user_id: admin.user.id,
    album_id: adminAlbumId,
    family_id: familyResult.id,
    title: "Quiet Moment",
    description: "admin only sample",
    storage_path: `pastelalbum/seed/${prefix}-quiet-moment`,
    url: "https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=1200&h=900&fit=crop",
    width: 1200,
    height: 900,
    file_size: 280000,
    media_type: "image",
    visibility: "admin_only",
  });

  await insertPhoto(member.client, {
    user_id: member.user.id,
    album_id: null,
    family_id: familyResult.id,
    title: "Garden Video",
    description: "seed video",
    storage_path: `pastelalbum/seed/${prefix}-garden-video`,
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    thumbnail_url: "https://images.unsplash.com/photo-1491013516836-7db643ee125a?w=1200&h=1600&fit=crop",
    width: 1280,
    height: 720,
    file_size: 1800000,
    media_type: "video",
    visibility: "everyone",
    duration: 5,
  });

  console.log("Seed completed");
  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log(`Family: ${familyName}`);
  console.log(`Prefix: ${emailSlug}`);
  console.log(`Invite code: ${familyResult.invite_code}`);
  console.log(`Admin email: ${adminEmail}`);
  console.log(`Member email: ${memberEmail}`);
  console.log(`Password: ${password}`);
}

await main();
