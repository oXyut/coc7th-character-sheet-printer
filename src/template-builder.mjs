import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFButton,
  PDFDocument,
  PDFTextField,
  TextAlignment,
  rgb,
} from 'pdf-lib';
import {
  BUILD_DIR,
  CONFIG_PATH,
  DEFAULT_TEMPLATE_PATH,
  FONT_PATH,
  ROOT_DIR,
} from './paths.mjs';

const FIXED_DATE = new Date('2000-01-01T00:00:00.000Z');

export async function loadLayoutConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
}

function pageIndexForWidget(widget, pages) {
  const pageRef = widget.P()?.toString();
  const index = pages.findIndex((page) => page.ref.toString() === pageRef);
  if (index < 0) throw new Error(`フォームのページを特定できません: ${pageRef ?? 'Pなし'}`);
  return index;
}

function roundRect(rect) {
  return {
    x: Number(rect.x.toFixed(3)),
    y: Number(rect.y.toFixed(3)),
    width: Number(rect.width.toFixed(3)),
    height: Number(rect.height.toFixed(3)),
  };
}

function indexLegacyFields(form, pages) {
  const result = [];
  for (const field of form.getFields()) {
    const widgets = field.acroField.getWidgets();
    if (widgets.length !== 1) {
      throw new Error(`単一Widgetではないフォーム項目です: ${field.getName()}`);
    }
    const widget = widgets[0];
    result.push({
      name: field.getName(),
      type: field instanceof PDFButton ? 'button' : field instanceof PDFTextField ? 'text' : 'other',
      page: pageIndexForWidget(widget, pages),
      rect: roundRect(widget.getRectangle()),
    });
  }
  return result;
}

function requireLegacy(index, name, expectedType = 'text') {
  const info = index.find((entry) => entry.name === name);
  if (!info) throw new Error(`原本PDFに必要な項目がありません: ${name}`);
  if (expectedType && info.type !== expectedType) {
    throw new Error(`原本PDFの項目種別が不正です: ${name} (${info.type})`);
  }
  return info;
}

function applyRectOverride(config, id, rect) {
  const override = config.rectOverrides?.[id];
  if (!override) return rect;
  if (!Array.isArray(override) || override.length !== 4 || override.some((value) => !Number.isFinite(value))) {
    throw new Error(`rectOverrides.${id} は [x, y, width, height] で指定してください`);
  }
  return { x: override[0], y: override[1], width: override[2], height: override[3] };
}

function subFieldsForRegular(index, regular) {
  const right = regular.rect.x + regular.rect.width;
  const centerY = regular.rect.y + regular.rect.height / 2;
  const candidates = index.filter((entry) => {
    if (entry.type !== 'text' || entry.page !== regular.page || entry.name === regular.name) return false;
    const rect = entry.rect;
    return (
      rect.x >= right - 1.5 &&
      rect.x <= right + 35 &&
      rect.width >= 8 &&
      rect.width <= 18 &&
      Math.abs(rect.y + rect.height / 2 - centerY) <= regular.rect.height / 2 + 1.5
    );
  });
  const nearestX = Math.min(...candidates.map((entry) => entry.rect.x));
  const pair = candidates
    .filter((entry) => Math.abs(entry.rect.x - nearestX) < 1)
    .sort((a, b) => b.rect.y - a.rect.y)
    .slice(0, 2);
  if (pair.length !== 2) {
    throw new Error(`ハード/イクストリーム欄を特定できません: ${regular.name}`);
  }
  return { hard: pair[0], extreme: pair[1] };
}

function tripletDescriptors(config, index, idPrefix, source, fontSizes = {}) {
  const regular = requireLegacy(index, source);
  const { hard, extreme } = subFieldsForRegular(index, regular);
  return [
    descriptor(config, `${idPrefix}.regular`, regular, { fontSize: fontSizes.regular ?? 6, align: 'center' }),
    descriptor(config, `${idPrefix}.hard`, hard, { fontSize: fontSizes.hard ?? 5, align: 'center' }),
    descriptor(config, `${idPrefix}.extreme`, extreme, { fontSize: fontSizes.extreme ?? 5, align: 'center' }),
  ];
}

function descriptor(config, id, legacy, style = {}) {
  return {
    id,
    source: legacy.name,
    page: legacy.page,
    rect: applyRectOverride(config, id, legacy.rect),
    type: style.type ?? 'text',
    fontSize: style.fontSize ?? 6,
    align: style.align ?? 'left',
    multiline: Boolean(style.multiline),
  };
}

function explicitDescriptor(config, item) {
  if (!Number.isInteger(item.page) || item.page < 0) {
    throw new Error(`explicitFields.${item.id}.page は0以上の整数で指定してください`);
  }
  if (!Array.isArray(item.rect) || item.rect.length !== 4 || item.rect.some((value) => !Number.isFinite(value))) {
    throw new Error(`explicitFields.${item.id}.rect は [x, y, width, height] で指定してください`);
  }
  return {
    id: item.id,
    source: null,
    page: item.page,
    rect: applyRectOverride(config, item.id, {
      x: item.rect[0],
      y: item.rect[1],
      width: item.rect[2],
      height: item.rect[3],
    }),
    type: item.type ?? 'text',
    fontSize: item.fontSize ?? 6,
    align: item.align ?? 'left',
    multiline: Boolean(item.multiline),
  };
}

function resolveCustomSkillSlots(config, index) {
  const slots = [];
  for (const source of config.customSkillLabels) {
    const label = requireLegacy(index, source);
    const labelCenter = label.rect.y + label.rect.height / 2;
    const right = label.rect.x + label.rect.width;
    const regular = index
      .filter((entry) => (
        entry.type === 'text' &&
        entry.page === label.page &&
        entry.name !== label.name &&
        entry.rect.x >= right - 2 &&
        entry.rect.x <= right + 25 &&
        entry.rect.width >= 14 &&
        entry.rect.width <= 22
      ))
      .sort((a, b) => {
        const aDistance = Math.abs(a.rect.y + a.rect.height / 2 - labelCenter);
        const bDistance = Math.abs(b.rect.y + b.rect.height / 2 - labelCenter);
        return aDistance - bDistance;
      })[0];
    if (!regular) throw new Error(`自由技能の数値欄を特定できません: ${source}`);
    const { hard, extreme } = subFieldsForRegular(index, regular);
    slots.push({ label, regular, hard, extreme });
  }
  return slots;
}

function resolveLayout(config, index) {
  const fields = [];

  for (const item of config.profile) {
    fields.push(descriptor(config, item.id, requireLegacy(index, item.source), item));
  }
  for (const ability of config.abilities) {
    fields.push(...tripletDescriptors(config, index, `abilities.${ability.key}`, ability.source, {
      regular: 8,
      hard: 6,
      extreme: 6,
    }));
  }
  for (const item of config.singleFields) {
    fields.push(descriptor(config, item.id, requireLegacy(index, item.source), item));
  }
  for (const item of config.explicitFields ?? []) {
    fields.push(explicitDescriptor(config, item));
  }
  fields.push(...tripletDescriptors(config, index, 'combat.dodge', config.combatDodge.source, {
    regular: 8,
    hard: 7,
    extreme: 7,
  }));

  for (const skill of config.fixedSkills) {
    if (skill.labelSource) {
      fields.push(descriptor(
        config,
        `skills.fixed.${skill.key}.name`,
        requireLegacy(index, skill.labelSource),
        { fontSize: 5, align: 'left' },
      ));
    }
    fields.push(...tripletDescriptors(config, index, `skills.fixed.${skill.key}`, skill.source));
  }

  const customSlots = resolveCustomSkillSlots(config, index);
  customSlots.forEach((slot, slotIndex) => {
    const prefix = `skills.custom.${slotIndex}`;
    fields.push(descriptor(config, `${prefix}.name`, slot.label, { fontSize: 5.5, align: 'left' }));
    fields.push(descriptor(config, `${prefix}.regular`, slot.regular, { fontSize: 6, align: 'center' }));
    fields.push(descriptor(config, `${prefix}.hard`, slot.hard, { fontSize: 5, align: 'center' }));
    fields.push(descriptor(config, `${prefix}.extreme`, slot.extreme, { fontSize: 5, align: 'center' }));
  });

  for (let indexValue = 0; indexValue < config.weapons.count; indexValue += 1) {
    const n = String(indexValue + 1).replace(/[0-9]/g, (digit) => '０１２３４５６７８９'[Number(digit)]);
    for (const [part, pattern] of Object.entries(config.weapons.sources)) {
      const legacyName = pattern.replace('{n}', n);
      fields.push(descriptor(
        config,
        `weapons.${indexValue}.${part}`,
        requireLegacy(index, legacyName),
        { fontSize: part === 'name' || part === 'damage' ? 5.5 : 5, align: part === 'name' ? 'left' : 'center' },
      ));
    }
  }

  const equipment = config.equipmentSources
    .map((source) => requireLegacy(index, source))
    .sort((a, b) => {
      if (Math.abs(a.rect.y - b.rect.y) > 1) return b.rect.y - a.rect.y;
      return a.rect.x - b.rect.x;
    });
  equipment.forEach((legacy, equipmentIndex) => {
    fields.push(descriptor(config, `equipment.${equipmentIndex}`, legacy, { fontSize: 5.5, align: 'left' }));
  });

  for (const item of config.finance) {
    fields.push(descriptor(config, item.id, requireLegacy(index, item.source), {
      fontSize: item.multiline ? 6 : 7,
      align: 'left',
      multiline: item.multiline,
    }));
  }
  for (const item of config.backstory) {
    fields.push(descriptor(config, item.id, requireLegacy(index, item.source), {
      fontSize: 6.5,
      align: 'left',
      multiline: true,
    }));
  }

  const portrait = requireLegacy(index, config.portraitSource, 'button');
  fields.push(descriptor(config, 'portrait', portrait, { type: 'button' }));

  const duplicateIds = fields.filter((field, position) => fields.findIndex((other) => other.id === field.id) !== position);
  if (duplicateIds.length) throw new Error(`正規化後の項目IDが重複しています: ${duplicateIds.map((x) => x.id).join(', ')}`);
  return fields;
}

function addTextField(form, pages, font, item) {
  const field = form.createTextField(item.id);
  if (item.multiline) field.enableMultiline();
  field.setAlignment(item.align === 'center' ? TextAlignment.Center : TextAlignment.Left);
  field.addToPage(pages[item.page], {
    ...item.rect,
    font,
    fontSize: item.fontSize,
    borderWidth: 0,
    textColor: rgb(0, 0, 0),
  });
}

function addButtonField(form, pages, font, item) {
  const button = form.createButton(item.id);
  button.addToPage('', pages[item.page], {
    ...item.rect,
    borderWidth: 0,
    font,
  });
}

function removeAllLegacyFields(pdfDoc, form, pages) {
  for (const field of form.getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      const page = pages[pageIndexForWidget(widget, pages)];
      const widgetRef = pdfDoc.context.getObjectRef(widget.dict);
      if (widgetRef) page.node.removeAnnot(widgetRef);
      page.node.removeAnnot(field.ref);
    }
  }
  const fields = form.acroForm.normalizedEntries().Fields;
  while (fields.size() > 0) fields.remove(fields.size() - 1);
}

export function blankEmptyTextAppearances(form, font) {
  for (const field of form.getFields()) {
    if (field instanceof PDFTextField && !field.getText()) {
      field.updateAppearances(font, () => []);
    }
  }
}

export async function createNormalizedTemplate() {
  const config = await loadLayoutConfig();
  const sourcePath = path.join(ROOT_DIR, config.sourcePdf);
  const [sourceBytes, fontBytes] = await Promise.all([readFile(sourcePath), readFile(FONT_PATH)]);
  const pdfDoc = await PDFDocument.load(sourceBytes, { updateMetadata: false });
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  const form = pdfDoc.getForm();
  const legacyIndex = indexLegacyFields(form, pages);
  const resolvedFields = resolveLayout(config, legacyIndex);

  removeAllLegacyFields(pdfDoc, form, pages);

  const font = await pdfDoc.embedFont(fontBytes, {
    subset: false,
    features: { locl: false },
  });
  for (const item of resolvedFields) {
    if (item.type === 'button') addButtonField(form, pages, font, item);
    else addTextField(form, pages, font, item);
  }
  form.updateFieldAppearances(font);
  blankEmptyTextAppearances(form, font);

  pdfDoc.setTitle('CoC 7th Edition Japanese Character Sheet - normalized template');
  pdfDoc.setAuthor('coc7th-character-sheet-printer');
  pdfDoc.setCreator('coc7th-character-sheet-printer');
  pdfDoc.setProducer('pdf-lib');
  pdfDoc.setCreationDate(FIXED_DATE);
  pdfDoc.setModificationDate(FIXED_DATE);

  const bytes = await pdfDoc.save({
    updateFieldAppearances: false,
    useObjectStreams: false,
  });
  return {
    bytes,
    layout: {
      version: config.version,
      sourcePdf: config.sourcePdf,
      pageSizes: pages.map((page) => page.getSize()),
      fields: resolvedFields,
    },
  };
}

export async function buildNormalizedTemplate(outputPath = DEFAULT_TEMPLATE_PATH) {
  const result = await createNormalizedTemplate();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, result.bytes),
    writeFile(
      path.join(path.dirname(outputPath), 'normalized-template.layout.json'),
      `${JSON.stringify(result.layout, null, 2)}\n`,
      'utf8',
    ),
  ]);
  return { ...result, outputPath };
}

export { BUILD_DIR };
