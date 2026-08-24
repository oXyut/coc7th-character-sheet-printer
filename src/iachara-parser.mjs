const TOP_LEVEL_SECTIONS = new Set([
  '基本情報',
  'アイコン',
  '能力値',
  '技能値',
  '武器',
  '装備と所持品',
  '収入と財産',
  'バックストーリー',
  '通過したシナリオ名',
  'メモ',
]);

function normalizeNewlines(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function normalizeSkillName(value) {
  return value
    .normalize('NFKC')
    .replace(/[‐‑‒–—―ー－]/g, '-')
    .replace(/\s+/g, '')
    .replace(/\/+/g, '/')
    .trim();
}

function splitTopLevelSections(lines) {
  const sections = new Map();
  let current = null;
  for (const line of lines) {
    const match = line.match(/^【(.+?)】\s*$/);
    if (current !== 'メモ' && match && TOP_LEVEL_SECTIONS.has(match[1])) {
      current = match[1];
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current).push(line);
  }
  return sections;
}

function parseKeyValueSegments(lines) {
  const values = {};
  for (const line of lines) {
    for (const segment of line.split(/\s+\/\s+/)) {
      const match = segment.match(/^([^:：]+)[:：]\s*(.*)$/);
      if (match) values[match[1].trim()] = match[2].trim();
    }
  }
  return values;
}

function parseAbilities(lines) {
  const abilities = {};
  let sanity = null;
  let damageBonus = '';
  let build = '';
  let movement = '';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const row = line.match(/^(STR|CON|POW|DEX|APP|SIZ|INT|EDU|HP|MP|正気度|IDE|幸運|知識)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/);
    if (row) {
      abilities[row[1]] = {
        current: Number(row[2]),
        base: Number(row[3]),
        increase: Number(row[4]),
        temporary: Number(row[5]),
      };
      continue;
    }
    const sanityMatch = line.match(/^正気度\s+(-?\d+)\s*\/\s*(-?\d+)$/);
    if (sanityMatch) sanity = { current: Number(sanityMatch[1]), max: Number(sanityMatch[2]) };
    const dbMatch = line.match(/^DB\s+(.+)$/);
    if (dbMatch) damageBonus = dbMatch[1].trim();
    const buildMatch = line.match(/^BLD\s+(.+)$/);
    if (buildMatch) build = buildMatch[1].trim();
    const movementMatch = line.match(/^MOV\s+(.+)$/);
    if (movementMatch) movement = movementMatch[1].trim();
  }
  return { abilities, sanity, damageBonus, build, movement };
}

function parseSkills(lines) {
  const skills = [];
  const points = {};
  let category = '';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const occupation = line.match(/^職業ポイント:\s*(\d+)\s*\/\s*(\d+)$/);
    if (occupation) {
      points.occupation = { used: Number(occupation[1]), max: Number(occupation[2]) };
      continue;
    }
    const interest = line.match(/^興味ポイント:\s*(\d+)\s*\/\s*(\d+)$/);
    if (interest) {
      points.interest = { used: Number(interest[1]), max: Number(interest[2]) };
      continue;
    }
    const categoryMatch = line.match(/^『(.+?)』$/);
    if (categoryMatch) {
      category = categoryMatch[1];
      continue;
    }
    if (line.startsWith('技能名')) continue;
    const row = line.match(/^(.+?)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/);
    if (!row) continue;
    skills.push({
      category,
      name: row[1].trim(),
      normalizedName: normalizeSkillName(row[1]),
      total: Number(row[2]),
      initial: Number(row[3]),
      occupation: Number(row[4]),
      interest: Number(row[5]),
      growth: Number(row[6]),
      other: Number(row[7]),
    });
  }
  return { skills, points };
}

function splitTableRow(line) {
  return line.trim().split(/\s{2,}|\t+/).map((value) => value.trim()).filter(Boolean);
}

function parseWeapons(lines) {
  const result = [];
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('名前')) continue;
    const cells = splitTableRow(line);
    if (cells.length < 2) continue;
    result.push({
      name: cells[0] ?? '',
      success: cells[1] ?? '',
      damage: cells[2] ?? '',
      range: cells[3] ?? '',
      attacks: cells[4] ?? '',
      ammo: cells[5] ?? '',
      durability: cells[6] ?? '',
      malfunction: cells[7] ?? '',
      other: cells.slice(8).join(' '),
    });
  }
  return result;
}

function parseEquipment(lines) {
  const result = [];
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('名称')) continue;
    const cells = splitTableRow(line);
    if (cells.length < 1) continue;
    result.push({
      name: cells[0] ?? '',
      unitPrice: cells[1] ?? '',
      count: cells[2] ?? '',
      price: cells[3] ?? '',
      notes: cells.slice(4).join(' '),
    });
  }
  return result;
}

function parseBackstory(lines) {
  const result = {};
  let current = null;
  for (const line of lines) {
    const match = line.match(/^\[(.+?)\]\s*$/);
    if (match) {
      current = match[1];
      result[current] = [];
      continue;
    }
    if (current) result[current].push(line);
  }
  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [key, value.join('\n').trim()]),
  );
}

function requireSection(sections, name) {
  if (!sections.has(name)) throw new Error(`必須セクションがありません: 【${name}】`);
  return sections.get(name);
}

export function parseIacharaText(input) {
  const text = normalizeNewlines(input);
  const lines = text.split('\n');
  const header = lines[0]?.trim().match(/^いあきゃらテキスト\s+7版\s+v(\d+)\.(\d+)\.(\d+)$/);
  if (!header) throw new Error('「いあきゃらテキスト 7版 v2.x.x」形式ではありません');
  const version = { major: Number(header[1]), minor: Number(header[2]), patch: Number(header[3]) };
  if (version.major !== 2) throw new Error(`未対応のいあきゃらテキスト版です: v${header[1]}.${header[2]}.${header[3]}`);

  const sections = splitTopLevelSections(lines.slice(1));
  const basic = parseKeyValueSegments(requireSection(sections, '基本情報'));
  if (!basic['名前']) throw new Error('【基本情報】に名前がありません');

  const abilityResult = parseAbilities(requireSection(sections, '能力値'));
  for (const required of ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU']) {
    if (!abilityResult.abilities[required]) throw new Error(`【能力値】に${required}がありません`);
  }
  const skillResult = parseSkills(requireSection(sections, '技能値'));
  if (skillResult.skills.length === 0) throw new Error('【技能値】を解析できませんでした');

  const iconLines = sections.get('アイコン') ?? [];
  const iconUrl = iconLines.join('\n').match(/https?:\/\/\S+/)?.[0] ?? '';
  const finance = parseKeyValueSegments(sections.get('収入と財産') ?? []);

  return {
    format: 'iachara-text-7e',
    version,
    basic,
    iconUrl,
    ...abilityResult,
    ...skillResult,
    weapons: parseWeapons(sections.get('武器') ?? []),
    equipment: parseEquipment(sections.get('装備と所持品') ?? []),
    finance,
    backstory: parseBackstory(sections.get('バックストーリー') ?? []),
    scenarios: (sections.get('通過したシナリオ名') ?? []).join('\n').trim(),
    memo: (sections.get('メモ') ?? []).join('\n').trim(),
  };
}
