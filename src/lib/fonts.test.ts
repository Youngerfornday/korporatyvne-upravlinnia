import { describe, expect, it } from 'vitest';
import { PRELOAD_FONT_FILE, fontFaceCss } from './fonts';

describe('fontFaceCss', () => {
  const css = fontFaceCss((path) => `/base/${path}`);

  it('declares eight faces (four subsets in upright and italic) with swap and base-aware urls', () => {
    expect(css.match(/@font-face/g)).toHaveLength(8);
    expect(css.match(/font-display:swap/g)).toHaveLength(8);
    expect(css).toContain('url("/base/fonts/OpenSans-Variable-cyrillic.woff2")');
    expect(css).toContain('url("/base/fonts/OpenSans-VariableItalic-latin-ext.woff2")');
    expect(css).not.toContain('url("/fonts');
  });

  it('keeps the cyrillic subset (with № U+2116) as the preloaded file', () => {
    expect(css).toContain(`url("/base/${PRELOAD_FONT_FILE}")`);
    expect(css).toMatch(/cyrillic\.woff2"\) format\("woff2"\);unicode-range:[^}]*U\+2116/);
  });
});
