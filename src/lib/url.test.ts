import { describe, expect, it } from 'vitest';
import { joinBase } from './url';

const BASE = '/korporatyvne-upravlinnia/';

describe('joinBase', () => {
  it('returns the base itself for an empty path or a lone slash', () => {
    expect(joinBase(BASE)).toBe(BASE);
    expect(joinBase(BASE, '')).toBe(BASE);
    expect(joinBase(BASE, '/')).toBe(BASE);
  });

  it('adds the base and a trailing slash to page paths', () => {
    expect(joinBase(BASE, 'moduli/m1')).toBe('/korporatyvne-upravlinnia/moduli/m1/');
    expect(joinBase(BASE, '/moduli/m1/')).toBe('/korporatyvne-upravlinnia/moduli/m1/');
  });

  it('keeps file paths without a trailing slash', () => {
    expect(joinBase(BASE, 'sitemap-index.xml')).toBe('/korporatyvne-upravlinnia/sitemap-index.xml');
    expect(joinBase(BASE, '/files/m1/tema-1.pdf')).toBe('/korporatyvne-upravlinnia/files/m1/tema-1.pdf');
  });

  it('puts the trailing slash before the query and hash', () => {
    expect(joinBase(BASE, 'poshuk?q=kvorum')).toBe('/korporatyvne-upravlinnia/poshuk/?q=kvorum');
    expect(joinBase(BASE, 'moduli/m1#t02')).toBe('/korporatyvne-upravlinnia/moduli/m1/#t02');
  });

  it('normalises a base written without slashes and the root base', () => {
    expect(joinBase('korporatyvne-upravlinnia', 'kabinet')).toBe('/korporatyvne-upravlinnia/kabinet/');
    expect(joinBase('/', 'kabinet')).toBe('/kabinet/');
    expect(joinBase('', '')).toBe('/');
  });

  it.each(['https://example.com/', 'mailto:someone@example.com', '//cdn.example.com/x.js'])(
    'refuses external URL %s because url() is only for internal links',
    (external) => {
      expect(() => joinBase(BASE, external)).toThrow(/внутрішн/);
    },
  );
});
