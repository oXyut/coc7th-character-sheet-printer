import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import {
  ImageAlignment,
  PDFButton,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFTextField,
  rgb,
} from 'pdf-lib';
import { normalizeSkillName } from './iachara-parser.mjs';
import { FONT_PATH } from './paths.mjs';
import {
  blankEmptyTextAppearances,
  createNormalizedTemplate,
  loadLayoutConfig,
} from './template-builder.mjs';

const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z');
const BODY_COLOR = rgb(0.12, 0.12, 0.12);
const HEADER_COLOR = rgb(0.16, 0.17, 0.19);
const MUTED_COLOR = rgb(0.42, 0.43, 0.45);
const PROHIBITED_LINE_START = new Set('、。，．）」』】〕〉》］｝！？：；');
const PROHIBITED_LINE_END = new Set('（「『【〔〈《［｛');

function scoreValues(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { regular: '', hard: '', extreme: '' };
  return {
    regular: String(numeric),
    hard: String(Math.floor(numeric / 2)),
    extreme: String(Math.floor(numeric / 5)),
  };
}

export function wrapLine(text, font, size, maxWidth) {
  if (!text) return [''];
  const lines = [];
  let current = '';
  for (const character of text) {
    const candidate = current + character;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      if (PROHIBITED_LINE_START.has(character)) {
        lines.push(candidate);
        current = '';
        continue;
      }
      let carry = '';
      while (current && PROHIBITED_LINE_END.has(current.at(-1))) {
        carry = current.at(-1) + carry;
        current = current.slice(0, -1);
      }
      if (current) lines.push(current);
      current = carry + character;
    } else {
      current = candidate;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

function wrapText(text, font, size, maxWidth) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => wrapLine(line, font, size, maxWidth));
}

function fitFieldText(text, item, font) {
  const source = String(text ?? '');
  if (!source) return { text: '', fontSize: item.fontSize, fits: true };
  const minimum = item.multiline ? 4 : 3.5;
  for (let size = item.fontSize; size >= minimum; size -= 0.25) {
    if (item.multiline) {
      const lines = wrapText(source, font, size, Math.max(1, item.rect.width - 3));
      const capacity = Math.max(1, Math.floor((item.rect.height - 2) / (size * 1.2)));
      if (lines.length <= capacity) return { text: source, fontSize: size, fits: true };
    } else if (font.widthOfTextAtSize(source, size) <= item.rect.width - 2) {
      return { text: source, fontSize: size, fits: true };
    }
  }
  return { text: '', fontSize: item.fontSize, fits: false };
}

function equipmentSummary(item) {
  const pieces = [item.name];
  if (item.count) pieces.push(`×${item.count}`);
  if (item.price) pieces.push(`価格:${item.price}`);
  if (item.notes) pieces.push(item.notes);
  return pieces.filter(Boolean).join(' ');
}

function weaponFieldValues(weapon) {
  const success = Number.parseInt(String(weapon.success).replace(/[^0-9-]/g, ''), 10);
  const score = scoreValues(success);
  return {
    name: weapon.name,
    regular: score.regular,
    hard: score.hard,
    extreme: score.extreme,
    damage: weapon.damage,
    range: weapon.range,
    attacks: weapon.attacks,
    ammo: weapon.ammo,
    malfunction: [weapon.malfunction, weapon.other].filter(Boolean).join(' '),
  };
}

function addAppendixPages(pdfDoc, font, sections) {
  const populated = sections.filter((section) => String(section.body ?? '').trim());
  if (populated.length === 0) return 0;
  const firstPageSize = pdfDoc.getPage(0).getSize();
  const margin = 38;
  const bodySize = 8.5;
  const lineHeight = 11.5;
  const contentWidth = firstPageSize.width - margin * 2;
  let page;
  let y;
  let pageCount = 0;

  const newPage = () => {
    page = pdfDoc.addPage([firstPageSize.width, firstPageSize.height]);
    pageCount += 1;
    page.drawRectangle({
      x: 0,
      y: firstPageSize.height - 42,
      width: firstPageSize.width,
      height: 42,
      color: HEADER_COLOR,
    });
    page.drawText('キャラクターシート付録', {
      x: margin,
      y: firstPageSize.height - 28,
      size: 14,
      font,
      color: rgb(1, 1, 1),
    });
    page.drawText(`PAGE ${pdfDoc.getPageCount()}`, {
      x: firstPageSize.width - margin - 45,
      y: firstPageSize.height - 27,
      size: 7,
      font,
      color: rgb(0.88, 0.88, 0.88),
    });
    y = firstPageSize.height - 64;
  };

  const ensureSpace = (height) => {
    if (!page || y - height < margin) newPage();
  };

  for (const section of populated) {
    ensureSpace(28);
    page.drawText(section.title, { x: margin, y, size: 10, font, color: HEADER_COLOR });
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: firstPageSize.width - margin, y },
      thickness: 0.7,
      color: MUTED_COLOR,
    });
    y -= 14;
    const lines = wrapText(section.body, font, bodySize, contentWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line || ' ', { x: margin, y, size: bodySize, font, color: BODY_COLOR });
      y -= lineHeight;
    }
    y -= 10;
  }
  return pageCount;
}

async function embedPortrait(pdfDoc, form, portraitPath) {
  if (!portraitPath) return;
  const bytes = await readFile(portraitPath);
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) throw new Error('立ち絵はPNGまたはJPEGを指定してください');
  const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
  const button = form.getButton('portrait');
  button.setImage(image, ImageAlignment.Center);
}

function additionalProfileText(character) {
  const keys = ['タグ', '身長', '体重', '髪の色', '瞳の色', '肌の色'];
  return keys
    .filter((key) => character.basic[key])
    .map((key) => `${key}: ${character.basic[key]}`)
    .join('\n');
}

function removeResidualWidgets(pdfDoc) {
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let index = annots.size() - 1; index >= 0; index -= 1) {
      const annotation = pdfDoc.context.lookupMaybe(annots.get(index), PDFDict);
      if (!annotation || annotation.get(PDFName.of('Subtype'))?.toString() === '/Widget') annots.remove(index);
    }
    if (annots.size() === 0) page.node.delete(PDFName.of('Annots'));
  }
}

export async function generateCharacterPdf(character, options = {}) {
  const [template, config, fontBytes] = await Promise.all([
    createNormalizedTemplate(),
    loadLayoutConfig(),
    readFile(FONT_PATH),
  ]);
  const pdfDoc = await PDFDocument.load(template.bytes, { updateMetadata: false });
  pdfDoc.registerFontkit(fontkit);
  const formFont = await pdfDoc.embedFont(fontBytes, {
    subset: false,
    features: { locl: false },
  });
  const form = pdfDoc.getForm();
  const layoutById = new Map(template.layout.fields.map((item) => [item.id, item]));
  const appendixOverflow = [];
  const warnings = [];

  const setField = (id, value, label = id) => {
    const field = form.getFieldMaybe(id);
    const item = layoutById.get(id);
    if (!(field instanceof PDFTextField) || !item) throw new Error(`正規化マスタに項目がありません: ${id}`);
    const fitted = fitFieldText(value, item, formFont);
    field.setFontSize(fitted.fontSize);
    field.setText(fitted.text);
    if (!fitted.fits && String(value ?? '').trim()) {
      warnings.push(`${label}はフォーム枠に収まらないため付録へ移しました`);
      appendixOverflow.push(`${label}\n${value}`);
    }
  };
  const setScore = (prefix, value, label) => {
    const score = scoreValues(value);
    setField(`${prefix}.regular`, score.regular, `${label} レギュラー`);
    setField(`${prefix}.hard`, score.hard, `${label} ハード`);
    setField(`${prefix}.extreme`, score.extreme, `${label} イクストリーム`);
  };

  setField('profile.name', character.basic['名前'], '名前');
  setField('profile.occupation', character.basic['職業'], '職業');
  setField('profile.birthplace', character.basic['出身'], '出身');
  setField('profile.gender', character.basic['性別'], '性別');
  setField('profile.age', character.basic['年齢'], '年齢');

  const abilityKeys = { str: 'STR', con: 'CON', siz: 'SIZ', dex: 'DEX', app: 'APP', edu: 'EDU', pow: 'POW', int: 'INT' };
  for (const [key, source] of Object.entries(abilityKeys)) {
    setScore(`abilities.${key}`, character.abilities[source].current, source);
  }

  const hpMax = character.abilities.HP?.base ?? character.abilities.HP?.current ?? '';
  const mpMax = character.abilities.MP?.base ?? character.abilities.MP?.current ?? '';
  const sanityCurrent = character.sanity?.current ?? character.abilities['正気度']?.current ?? '';
  const sanityMax = character.sanity?.max ?? '';
  setField('vitals.hpMax', hpMax, '最大耐久力');
  setField('vitals.majorWound', Number.isFinite(Number(hpMax)) ? Math.floor(Number(hpMax) / 2) : '', '重傷');
  setField('vitals.sanityIndefinite', Number.isFinite(Number(sanityCurrent)) ? Math.floor(Number(sanityCurrent) / 5) : '', '不定の狂気');
  setField('vitals.sanityStart', sanityCurrent, '開始時正気度');
  setField('vitals.sanityMax', sanityMax, '最大正気度');
  setField('vitals.mpMax', mpMax, '最大MP');
  setField('vitals.luck', character.abilities['幸運']?.current ?? '', '幸運');
  setField('movement.regular', character.movement, '移動率');
  setField('combat.damageBonus', character.damageBonus, 'ダメージボーナス');
  setField('combat.build', character.build, 'ビルド');

  const aliases = new Map();
  for (const skill of config.fixedSkills) {
    for (const alias of skill.aliases) aliases.set(normalizeSkillName(alias), skill);
  }
  const consumed = new Set();
  const fixedValues = new Map();
  character.skills.forEach((skill, skillIndex) => {
    const fixed = aliases.get(skill.normalizedName) ?? config.fixedSkills.find((candidate) => (
      candidate.labelSource && skill.normalizedName.startsWith(normalizeSkillName(candidate.label))
    ));
    if (fixed && !fixedValues.has(fixed.key)) {
      fixedValues.set(fixed.key, skill);
      consumed.add(skillIndex);
    }
  });
  for (const fixed of config.fixedSkills) {
    const skill = fixedValues.get(fixed.key);
    if (skill) {
      setScore(`skills.fixed.${fixed.key}`, skill.total, fixed.label);
      if (fixed.labelSource) {
        const qualifier = skill.normalizedName === normalizeSkillName(fixed.label)
          ? ''
          : skill.name.replace(fixed.label, '').trim();
        setField(`skills.fixed.${fixed.key}.name`, qualifier, `${fixed.label}の補足名`);
      }
    }
  }
  const dodge = fixedValues.get('dodge');
  if (dodge) setScore('combat.dodge', dodge.total, '戦闘 回避');

  const customSkills = character.skills.filter((_, index) => !consumed.has(index));
  const customCapacity = config.customSkillLabels.length;
  customSkills.slice(0, customCapacity).forEach((skill, index) => {
    const prefix = `skills.custom.${index}`;
    setField(`${prefix}.name`, skill.name, `自由技能 ${skill.name}`);
    setScore(prefix, skill.total, skill.name);
  });
  if (customSkills.length > customCapacity) {
    const overflow = customSkills.slice(customCapacity).map((skill) => `${skill.name}: ${skill.total}`).join('\n');
    warnings.push(`自由技能が${customSkills.length - customCapacity}件、フォーム欄を超えたため付録へ移しました`);
    appendixOverflow.push(`未配置の技能\n${overflow}`);
  }

  character.weapons.slice(0, config.weapons.count).forEach((weapon, index) => {
    const values = weaponFieldValues(weapon);
    for (const [part, value] of Object.entries(values)) {
      setField(`weapons.${index}.${part}`, value, `武器${index + 1} ${part}`);
    }
    if (weapon.durability) appendixOverflow.push(`武器「${weapon.name}」耐久力: ${weapon.durability}`);
  });
  if (character.weapons.length > config.weapons.count) {
    appendixOverflow.push(
      `未配置の武器\n${character.weapons.slice(config.weapons.count).map((weapon) => JSON.stringify(weapon)).join('\n')}`,
    );
    warnings.push(`武器が${character.weapons.length - config.weapons.count}件、フォーム欄を超えたため付録へ移しました`);
  }

  character.equipment.slice(0, config.equipmentSources.length).forEach((item, index) => {
    setField(`equipment.${index}`, equipmentSummary(item), `装備${index + 1}`);
  });
  if (character.equipment.length > config.equipmentSources.length) {
    appendixOverflow.push(
      `未配置の装備\n${character.equipment.slice(config.equipmentSources.length).map(equipmentSummary).join('\n')}`,
    );
    warnings.push(`装備が${character.equipment.length - config.equipmentSources.length}件、フォーム欄を超えたため付録へ移しました`);
  }

  setField('finance.spendingLevel', character.finance['支出レベル'] ?? '', '支出レベル');
  setField('finance.cash', character.finance['現金'] ?? '', '現金');
  setField('finance.assets', character.finance['資産'] ?? '', '資産');
  for (const item of config.backstory) {
    setField(item.id, character.backstory[item.label] ?? '', item.label);
  }

  await embedPortrait(pdfDoc, form, options.portraitPath);
  form.updateFieldAppearances(formFont);
  blankEmptyTextAppearances(form, formFont);

  const appendixSections = [
    { title: '追加プロフィール', body: additionalProfileText(character) },
    { title: 'いあきゃら アイコンURL', body: character.iconUrl },
    { title: '通過したシナリオ名', body: character.scenarios },
    { title: 'メモ', body: character.memo },
    { title: 'PDF未配置項目', body: appendixOverflow.join('\n\n') },
  ];
  const appendixPageCount = addAppendixPages(pdfDoc, formFont, appendixSections);

  if (options.flatten) {
    form.flatten({ updateFieldAppearances: false });
    removeResidualWidgets(pdfDoc);
    pdfDoc.catalog.delete(PDFName.of('AcroForm'));
  }
  pdfDoc.setTitle(`${character.basic['名前']} - CoC 7th Edition Character Sheet`);
  pdfDoc.setAuthor('coc7th-character-sheet-printer');
  pdfDoc.setCreator('coc7th-character-sheet-printer');
  pdfDoc.setProducer('pdf-lib');
  pdfDoc.setCreationDate(FIXED_DATE);
  pdfDoc.setModificationDate(FIXED_DATE);
  const bytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });
  return { bytes, warnings, appendixPageCount, fieldCount: form.getFields().length };
}

export async function writeCharacterPdf(character, outputPath, options = {}) {
  const result = await generateCharacterPdf(character, options);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.bytes);
  return { ...result, outputPath };
}
