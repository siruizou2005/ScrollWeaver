/**
 * 构建期：把 data/ 下的静态内容打包成 KV 条目。
 *
 * 旧版在**运行时**从文件系统散读：预设 → world_info → 逐个角色的 role_info.json
 * → locations.json → map.csv，还要遍历目录做模糊匹配找角色路径。
 * Workers 没有文件系统，而且散读会放大冷启动延迟。
 *
 * 这里把一个书卷开局所需的一切压成单个 KV 条目（pack:<id>），运行时一次读取拿全；
 * 世界观检索用的切块也在这里算好。
 *
 * 用法：
 *   node scripts/import-content.mjs             # 生成 dist/kv-bulk.json
 *   npx wrangler kv bulk put dist/kv-bulk.json --binding CONTENT --remote
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'dist');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const exists = (p) => existsSync(p);

/** 与 worker/src/domain/retrieval.ts 的 chunkText 保持一致的切分规则。 */
function chunkText(text, maxChars = 180) {
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      chunks.push(para);
      continue;
    }
    let buffer = '';
    for (const sentence of para.split(/(?<=[。！？.!?])/)) {
      if (buffer.length + sentence.length > maxChars && buffer) {
        chunks.push(buffer.trim());
        buffer = '';
      }
      buffer += sentence;
    }
    if (buffer.trim()) chunks.push(buffer.trim());
  }
  return chunks;
}

/**
 * 把预设里 "./data/xxx" 形式的路径解析到本仓库的 data/ 下。
 *
 * 旧版预设声明的是显式路径（loc_file_path / map_file_path / world_file_path），
 * 且文件名不一定与 source 同名（例如 example_world 的地点文件叫
 * example_locations.json）。按 source 推导会漏读，因此优先用声明值。
 */
function resolveDeclared(declared) {
  if (!declared) return null;
  const rel = String(declared).replace(/^\.?\/?data\//, '');
  const p = join(DATA, rel);
  return exists(p) ? p : null;
}

/** 读 CSV 距离矩阵 -> { "from\tto": distance } */
function loadAdjacency(source, declared) {
  const csvPath = resolveDeclared(declared) ?? join(DATA, 'maps', `${source}.csv`);
  if (!exists(csvPath)) return {};
  const lines = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',').slice(1);
  const adjacency = {};
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const from = cells[0];
    cells.slice(1).forEach((cell, i) => {
      const to = header[i];
      const d = Number.parseInt(cell, 10);
      if (from && to && from !== to && Number.isFinite(d) && d > 0) {
        adjacency[`${from}\t${to}`] = d;
      }
    });
  }
  return adjacency;
}

function loadRoles(source, codes) {
  const roles = {};
  // 角色可能在 roles/<source>/<code>/ 下，也可能直接在 roles/<code>/ 下
  const dirs = [join(DATA, 'roles', source), join(DATA, 'roles')];
  const seen = new Set();
  for (const dir of dirs) {
    if (!exists(dir)) continue;
  for (const entry of readdirSync(dir)) {
    if (seen.has(entry)) continue;
    const infoPath = join(dir, entry, 'role_info.json');
    if (!exists(infoPath)) continue;
    const info = readJson(infoPath);
    const code = info.role_code || entry;
    // 只收预设点名的角色；预设没给就全收
    if (codes.length > 0 && !codes.includes(code)) continue;
    seen.add(entry);
    roles[code] = {
      role_code: code,
      role_name: info.role_name ?? code,
      nickname: info.nickname ?? info.role_name ?? code,
      source,
      activity: info.activity ?? 1,
      profile: info.profile ?? '',
      gender: info.gender ?? '',
      identity: info.identity ?? [],
      relation: info.relation ?? {},
    };
  }
  }
  return roles;
}

function loadWorld(source, declared) {
  const candidates = [];
  const fromDeclared = resolveDeclared(declared);
  if (fromDeclared) candidates.push(fromDeclared);
  const dir = join(DATA, 'worlds', source);
  candidates.push(join(dir, 'world_info.json'), join(dir, 'general.json'));
  for (const p of candidates) {
    if (exists(p)) {
      const w = readJson(p);
      return {
        source,
        title: w.title ?? source,
        world_name: w.world_name ?? w.title ?? source,
        language: w.language ?? 'zh',
        description: w.description ?? '',
        detail: w.detail ?? '',
      };
    }
  }
  return null;
}

function loadLocations(source, declared) {
  const p = resolveDeclared(declared) ?? join(DATA, 'locations', `${source}.json`);
  if (!exists(p)) return {};
  const raw = readJson(p);
  const map = raw.locations ?? raw;
  const out = {};
  for (const [code, loc] of Object.entries(map)) {
    out[code] = {
      location_code: loc.location_code ?? code,
      location_name: loc.location_name ?? code,
      source,
      description: loc.description ?? '',
      detail: loc.detail ?? '',
    };
  }
  return out;
}

// ---------- 主流程 ----------

const presetsDir = join(DATA, 'presets');
const entries = [];
const index = [];
const problems = [];

for (const file of readdirSync(presetsDir)) {
  if (!file.endsWith('.json')) continue;
  const preset = readJson(join(presetsDir, file));
  const id = file.replace(/\.json$/, '');
  const source = preset.source;
  if (!source) {
    problems.push(`${file}: 缺少 source 字段，跳过`);
    continue;
  }

  const world = loadWorld(source, preset.world_file_path);
  if (!world) {
    problems.push(`${file}: 找不到 ${source} 的世界观文件，跳过`);
    continue;
  }

  const codes = preset.performer_codes ?? [];
  const roles = loadRoles(source, codes);
  const locations = loadLocations(source, preset.loc_file_path);

  const missing = codes.filter((c) => !roles[c]);
  if (missing.length) problems.push(`${file}: 缺少角色 ${missing.join(', ')}`);
  if (Object.keys(locations).length === 0) problems.push(`${file}: 没有任何地点`);

  const scrollPreset = {
    id,
    // 展示名优先取预设里的 title：部分世界观文件（general.json）没有 title 字段，
    // 只回落到 source 会让广场页显示 "A_Song_of_Ice_and_Fire" 这种内部标识
    title: preset.title || world.title,
    description: world.description,
    source,
    language: world.language,
    performer_codes: Object.keys(roles),
    intervention: preset.intervention ?? '',
    script: preset.script ?? '',
  };

  const worldChunks = chunkText([world.description, world.detail].filter(Boolean).join('\n'))
    .map((text) => ({ text }));

  const pack = {
    preset: scrollPreset,
    world,
    roles,
    locations,
    adjacency: loadAdjacency(source, preset.map_file_path),
    worldChunks,
  };

  entries.push({ key: `pack:${id}`, value: JSON.stringify(pack) });
  index.push(scrollPreset);

  console.log(
    `  ${id.padEnd(42)} 角色 ${String(Object.keys(roles).length).padStart(2)}` +
      ` 地点 ${String(Object.keys(locations).length).padStart(2)}` +
      ` 检索块 ${String(worldChunks.length).padStart(2)}`,
  );
}

entries.push({ key: 'index:scrolls', value: JSON.stringify(index) });

mkdirSync(OUT, { recursive: true });
const bulkPath = join(OUT, 'kv-bulk.json');
writeFileSync(bulkPath, JSON.stringify(entries, null, 0), 'utf8');

const bytes = statSync(bulkPath).size;
console.log(`\n共 ${index.length} 个书卷，${entries.length} 个 KV 条目`);
console.log(`产物：${bulkPath}（${(bytes / 1024).toFixed(0)} KB）`);
if (problems.length) {
  console.log('\n内容问题：');
  for (const p of problems) console.log(`  ⚠️  ${p}`);
}
