import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = "https://pcmqxbwxpzskkyjmtmrv.supabase.co";
const DESTINATION = "https://api.checkdiario.com.br";
const PROJECT_REF = "pcmqxbwxpzskkyjmtmrv";
const PAGE_SIZE = 500;

const tableOrder = [
  "menu_stores", "menu_settings", "menu_integration", "menu_categories",
  "menu_products", "menu_cards", "menu_references", "menu_catalog_connectors",
  "menu_catalog_sync_runs", "menu_catalog_sync_requests", "menu_orders",
  "menu_order_items", "menu_card_claims", "menu_service_requests",
  "menu_dispatcher_leases", "menu_banners", "menu_admin_profiles",
];

function parseEnv(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => {
      const split = line.indexOf("=");
      return [line.slice(0, split), line.slice(split + 1).replace(/^['"]|['"]$/g, "")];
    }));
}

function sourceServiceKey() {
  const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", PROJECT_REF, "--output", "json"], { encoding: "utf8" }));
  return keys.find((key) => key.name === "service_role")?.api_key;
}

async function request(base, key, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  const response = await fetch(`${base}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: HTTP ${response.status} ${await response.text()}`);
  return response;
}

async function fetchAll(base, key, table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await request(base, key, `/rest/v1/${table}?select=*&offset=${offset}&limit=${PAGE_SIZE}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function rewriteCloudUrls(value) {
  return JSON.parse(JSON.stringify(value).replaceAll(SOURCE, DESTINATION));
}

async function upsertRows(key, table, rows) {
  for (let start = 0; start < rows.length; start += 100) {
    await request(DESTINATION, key, `/rest/v1/${table}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(start, start + 100)),
    });
  }
}

async function listStorage(key, prefix = "") {
  const response = await request(SOURCE, key, "/storage/v1/object/list/menu-product-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  const entries = await response.json();
  const files = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) files.push({ path, contentType: entry.metadata?.mimetype || "application/octet-stream" });
    else files.push(...await listStorage(key, path));
  }
  return files;
}

async function migrateStorage(sourceKey, destinationKey) {
  const files = await listStorage(sourceKey);
  for (const file of files) {
    const source = await request(SOURCE, sourceKey, `/storage/v1/object/authenticated/menu-product-images/${file.path.split("/").map(encodeURIComponent).join("/")}`);
    const bytes = await source.arrayBuffer();
    await request(DESTINATION, destinationKey, `/storage/v1/object/menu-product-images/${file.path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { "Content-Type": file.contentType, "x-upsert": "true" },
      body: bytes,
    });
  }
  return files.length;
}

async function recreateAdmin(sourceKey, destinationKey, profiles) {
  const response = await request(SOURCE, sourceKey, "/auth/v1/admin/users?page=1&per_page=1000");
  const users = (await response.json()).users || [];
  if (users.length !== 1) throw new Error(`Esperado exatamente um administrador no Cloud; encontrados ${users.length}`);
  const oldUser = users[0];
  const destinationResponse = await request(DESTINATION, destinationKey, "/auth/v1/admin/users?page=1&per_page=1000");
  const existing = ((await destinationResponse.json()).users || []).find((user) => user.email?.toLowerCase() === oldUser.email?.toLowerCase());
  if (existing) return profiles.map((profile) => ({ ...profile, user_id: existing.id }));
  const temporaryPassword = `${randomBytes(24).toString("base64url")}!Aa7`;
  const createdResponse = await request(DESTINATION, destinationKey, "/auth/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: oldUser.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: oldUser.user_metadata || {},
      app_metadata: oldUser.app_metadata || {},
    }),
  });
  const created = await createdResponse.json();
  const credential = `Email: ${oldUser.email}\nSenha temporaria: ${temporaryPassword}\nTroque a senha no primeiro acesso.\n`;
  const stored = spawnSync("ssh", ["-o", "BatchMode=yes", "root@179.236.79.214", "bash", "-c", "umask 077; cat > /root/cardapio-admin-inicial.txt"], { input: credential, encoding: "utf8" });
  if (stored.status !== 0) throw new Error(`Falha ao armazenar credencial administrativa: ${stored.stderr}`);
  return profiles.map((profile) => ({ ...profile, user_id: created.id }));
}

async function main() {
  const env = parseEnv(resolve(process.cwd(), "../../.env.functions.hostinger"));
  const destinationKey = env.SUPABASE_SERVICE_ROLE_KEY || execFileSync("ssh", [
    "-o", "BatchMode=yes", "root@179.236.79.214",
    'cd /opt/checkdiario/supabase && set -a && . ./.env && printf %s "$SERVICE_ROLE_KEY"',
  ], { encoding: "utf8" }).trim();
  const sourceKey = sourceServiceKey();
  if (!sourceKey || !destinationKey) throw new Error("Service-role de origem ou destino indisponível.");

  const sourceRows = {};
  for (const table of tableOrder) sourceRows[table] = rewriteCloudUrls(await fetchAll(SOURCE, sourceKey, table));
  sourceRows.menu_admin_profiles = await recreateAdmin(sourceKey, destinationKey, sourceRows.menu_admin_profiles);

  for (const table of tableOrder) {
    await upsertRows(destinationKey, table, sourceRows[table]);
    const destinationRows = await fetchAll(DESTINATION, destinationKey, table);
    if (destinationRows.length !== sourceRows[table].length) {
      throw new Error(`${table}: origem=${sourceRows[table].length}, destino=${destinationRows.length}`);
    }
    console.log(`${table}: ${destinationRows.length}`);
  }

  const files = await migrateStorage(sourceKey, destinationKey);
  console.log(`storage_objects: ${files}`);
  console.log("MIGRATION_OK");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
