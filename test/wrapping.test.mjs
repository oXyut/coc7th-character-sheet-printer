import assert from 'node:assert/strict';
import test from 'node:test';
import { wrapLine } from '../src/pdf-writer.mjs';

const monospaceFont = {
  widthOfTextAtSize(text) {
    return [...text].length;
  },
};

test('句読点を行頭へ送らない', () => {
  assert.deepEqual(wrapLine('あいう、え', monospaceFont, 1, 3), ['あいう、', 'え']);
});

test('開き括弧を行末へ残さない', () => {
  assert.deepEqual(wrapLine('あい「うえ', monospaceFont, 1, 3), ['あい', '「うえ']);
});
