import { afterEach, describe, expect, it } from 'vitest';
import { detectLanguage, fmt, getLanguage, setLanguage, STRINGS, t } from '../src/i18n.js';

afterEach(() => setLanguage('it'));

describe('i18n', () => {
  it('has the same keys in every language', () => {
    const keys = Object.keys(STRINGS.it).sort();
    for (const lang of Object.keys(STRINGS)) expect(Object.keys(STRINGS[lang]).sort()).toEqual(keys);
  });

  it('detects the device language with English as fallback', () => {
    expect(detectLanguage({ languages: ['it-IT', 'en'] })).toBe('it');
    expect(detectLanguage({ language: 'en-GB' })).toBe('en');
    expect(detectLanguage({ languages: ['fr-FR', 'it'] })).toBe('it');
    expect(detectLanguage({ language: 'de-DE' })).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });

  it('translates and fills placeholders', () => {
    setLanguage('it');
    expect(t('play')).toBe('GIOCA');
    expect(t('recordValue', { n: 42 })).toBe('RECORD 42');
    setLanguage('en');
    expect(t('play')).toBe('PLAY');
    expect(t('notEnough', { currency: t('gems') })).toBe('Not enough gems');
    expect(t('missing-key')).toBe('missing-key');
  });

  it('ignores unknown languages and formats numbers per language', () => {
    setLanguage('en');
    setLanguage('xx');
    expect(getLanguage()).toBe('en');
    expect(fmt(1234567)).toBe('1,234,567');
    setLanguage('it');
    expect(fmt(1234567)).toBe('1.234.567');
  });
});
