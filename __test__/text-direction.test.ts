import assert from 'node:assert/strict';
import test from 'node:test';

import { textDirection } from '../app/lib/markets.ts';

test('RTL market languages (Shopify codes and BCP 47 tags) → rtl', () => {
  for (const language of [
    'AR',
    'ar',
    'HE',
    'FA',
    'UR',
    'PS',
    'SD',
    'UG',
    'YI',
    'DV',
    'ar-AE',
    'AR_SA',
  ]) {
    assert.equal(textDirection(language), 'rtl', language);
  }
});

test('an explicit script decides', () => {
  assert.equal(textDirection('ku-Arab'), 'rtl');
  assert.equal(textDirection('KU_ARAB_IQ'), 'rtl');
  assert.equal(textDirection('az-Arab'), 'rtl');
  assert.equal(textDirection('ku-Latn'), 'ltr');
  assert.equal(textDirection('uz-Cyrl'), 'ltr');
});

test('LTR languages and junk → ltr', () => {
  for (const language of [
    'EN',
    'en',
    'PT_BR',
    'zh-Hans',
    'ZH_TW',
    'ja',
    'fr-CA',
    '',
    '  ',
    '!!',
    'x',
  ]) {
    assert.equal(textDirection(language), 'ltr', language);
  }
});
