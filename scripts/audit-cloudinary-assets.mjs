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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function assertEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が未設定です。`);
  }
  return value;
}

function authHeader(apiKey, apiSecret) {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

async function listCloudinaryResources({ cloudName, apiKey, apiSecret, resourceType, prefix }) {
  const resources = [];
  let nextCursor = null;

  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("max_results", "500");
    if (nextCursor) {
      url.searchParams.set("next_cursor", nextCursor);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: authHeader(apiKey, apiSecret),
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Cloudinary resources fetch failed (${resourceType}): ${response.status} ${errorBody}`);
    }

    const payload = await response.json();
    resources.push(...(payload.resources || []));
    nextCursor = payload.next_cursor || null;
  } while (nextCursor);

  return resources;
}

async function deleteCloudinaryResources({ cloudName, apiKey, apiSecret, resourceType, publicIds }) {
  if (publicIds.length === 0) return { deleted: {} };

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: authHeader(apiKey, apiSecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      public_ids: publicIds,
      invalidate: true,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary delete failed (${resourceType}): ${response.status} ${errorBody}`);
  }

  return response.json();
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  loadDotEnv(resolve(process.cwd(), ".env.local"));

  const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const cloudName = assertEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
  const apiKey = assertEnv("CLOUDINARY_API_KEY");
  const apiSecret = assertEnv("CLOUDINARY_API_SECRET");

  const prefix = getArg("prefix", "pastelalbum");
  const cleanup = hasFlag("cleanup");
  const limit = Number(getArg("limit", "20"));

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: dbRows, error } = await supabase
    .from("photos")
    .select("storage_path, media_type, url");

  if (error) {
    throw error;
  }

  const dbCloudinaryRows = (dbRows || []).filter((row) => {
    if (!row?.storage_path?.startsWith(prefix)) return false;
    try {
      return new URL(row.url).hostname === "res.cloudinary.com";
    } catch {
      return false;
    }
  });

  const dbByType = {
    image: new Set(
      dbCloudinaryRows
        .filter((row) => row.media_type === "image")
        .map((row) => row.storage_path),
    ),
    video: new Set(
      dbCloudinaryRows
        .filter((row) => row.media_type === "video")
        .map((row) => row.storage_path),
    ),
  };

  const [cloudinaryImages, cloudinaryVideos] = await Promise.all([
    listCloudinaryResources({ cloudName, apiKey, apiSecret, resourceType: "image", prefix }),
    listCloudinaryResources({ cloudName, apiKey, apiSecret, resourceType: "video", prefix }),
  ]);

  const cloudByType = {
    image: new Set(cloudinaryImages.map((resource) => resource.public_id)),
    video: new Set(cloudinaryVideos.map((resource) => resource.public_id)),
  };

  const orphanImages = [...cloudByType.image].filter((publicId) => !dbByType.image.has(publicId));
  const orphanVideos = [...cloudByType.video].filter((publicId) => !dbByType.video.has(publicId));
  const missingImages = [...dbByType.image].filter((publicId) => !cloudByType.image.has(publicId));
  const missingVideos = [...dbByType.video].filter((publicId) => !cloudByType.video.has(publicId));

  console.log("Cloudinary audit");
  console.log(`Prefix: ${prefix}`);
  console.log(`DB rows considered: ${dbCloudinaryRows.length}`);
  console.log(`Cloudinary images: ${cloudinaryImages.length}`);
  console.log(`Cloudinary videos: ${cloudinaryVideos.length}`);
  console.log("");
  console.log(`Orphan images: ${orphanImages.length}`);
  orphanImages.slice(0, limit).forEach((item) => console.log(`  - ${item}`));
  console.log(`Orphan videos: ${orphanVideos.length}`);
  orphanVideos.slice(0, limit).forEach((item) => console.log(`  - ${item}`));
  console.log(`Missing DB images in Cloudinary: ${missingImages.length}`);
  missingImages.slice(0, limit).forEach((item) => console.log(`  - ${item}`));
  console.log(`Missing DB videos in Cloudinary: ${missingVideos.length}`);
  missingVideos.slice(0, limit).forEach((item) => console.log(`  - ${item}`));

  if (cleanup) {
    console.log("");
    console.log("Cleanup requested: deleting orphan assets from Cloudinary");

    for (const batch of chunk(orphanImages, 100)) {
      const result = await deleteCloudinaryResources({
        cloudName,
        apiKey,
        apiSecret,
        resourceType: "image",
        publicIds: batch,
      });
      console.log(`Deleted image batch: ${Object.keys(result.deleted || {}).length}`);
    }

    for (const batch of chunk(orphanVideos, 100)) {
      const result = await deleteCloudinaryResources({
        cloudName,
        apiKey,
        apiSecret,
        resourceType: "video",
        publicIds: batch,
      });
      console.log(`Deleted video batch: ${Object.keys(result.deleted || {}).length}`);
    }
  } else {
    console.log("");
    console.log("Dry run only. Use --cleanup to delete orphan assets.");
  }
}

await main();
