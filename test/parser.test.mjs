import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseIacharaText, normalizeSkillName } from '../src/iachara-parser.mjs';

const fixtureUrl = new URL('./fixtures/iachara-v2.txt', import.meta.url);

test('v2.0.1の全主要セクションを解析できる', async () => {
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  assert.equal(character.basic['名前'], 'テスト 探索者');
  assert.equal(character.abilities.STR.current, 50);
  assert.equal(character.sanity.max, 99);
  assert.equal(character.abilities['幸運'].current, 65);
  assert.equal(character.skills.find((skill) => skill.name === '電子工学').total, 45);
  assert.equal(character.weapons[0].name, 'ナイフ');
  assert.equal(character.equipment[0].name, '懐中電灯');
  assert.match(character.memo, /テスト用メモ/);
});

test('技能名の全角・半角表記を正規化する', () => {
  assert.equal(normalizeSkillName('言語（英語）'), normalizeSkillName('言語(英語)'));
  assert.equal(normalizeSkillName('射撃（ライフル／ショットガン）'), normalizeSkillName('射撃(ライフル/ショットガン)'));
});

test('未対応の版と必須項目欠落を拒否する', async () => {
  const source = await readFile(fixtureUrl, 'utf8');
  assert.throws(() => parseIacharaText(source.replace('v2.0.1', 'v3.0.0')), /未対応/);
  assert.throws(() => parseIacharaText(source.replace('名前: テスト 探索者', '')), /名前がありません/);
});
