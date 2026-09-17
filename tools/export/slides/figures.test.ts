import { describe, expect, it, vi } from 'vitest';
import { SVG_CONTEXT_OPTIONS, protectSvgPage } from './figures';
import type { Page } from 'playwright';

describe('захист SVG-рендера Chromium', () => {
  it('вимикає JavaScript у контексті', () => {
    expect(SVG_CONTEXT_OPTIONS.javaScriptEnabled).toBe(false);
  });

  it('перериває мережеві запити, але пропускає data:', async () => {
    let handler: ((route: { request(): { url(): string }; abort(): Promise<void>; continue(): Promise<void> }) => Promise<void>) | undefined;
    const route = vi.fn(async (pattern: string, callback: typeof handler) => {
      expect(pattern).toBe('**/*');
      handler = callback;
    });
    const page = { route };
    await protectSvgPage(page as unknown as Pick<Page, 'route'>);
    const abort = vi.fn(async () => undefined);
    const continueRequest = vi.fn(async () => undefined);
    await handler?.({ request: () => ({ url: () => 'https://evil.example' }), abort, continue: continueRequest });
    await handler?.({ request: () => ({ url: () => 'data:image/svg+xml,ok' }), abort, continue: continueRequest });
    expect(abort).toHaveBeenCalledOnce();
    expect(continueRequest).toHaveBeenCalledOnce();
  });
});
