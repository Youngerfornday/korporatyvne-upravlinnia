import { describe, expect, it } from 'vitest';
import { createFakeScormApi } from './__fixtures__/fake-scorm-api';
import { MAX_API_SEARCH_DEPTH, cmiTimespan, findScormApi, isScormTrue, type ScormWindowLike } from './scorm-api';

/** Ланцюжок вікон: перше — SCO, останнє — верхнє вікно (parent === self). */
function windowChain(depth: number, apiAt: number | null): ScormWindowLike[] {
  const api = createFakeScormApi();
  const windows: Array<{ API?: unknown; parent?: ScormWindowLike; opener?: ScormWindowLike | null }> = Array.from({ length: depth + 1 }, (_, index) =>
    index === apiAt ? { API: api } : {},
  );
  windows.forEach((win, index) => {
    win.parent = windows[index + 1] ?? win;
  });
  return windows as ScormWindowLike[];
}

describe('findScormApi', () => {
  it('finds the API in the window itself', () => {
    // Arrange
    const [sco] = windowChain(0, 0);

    // Act and Assert
    expect(findScormApi(sco)).not.toBeNull();
  });

  it('walks up the parent chain like the Moodle player iframe', () => {
    // Arrange
    const chain = windowChain(3, 2);

    // Act and Assert
    expect(findScormApi(chain[0])).toBe(chain[2]?.API);
  });

  it('gives up after the standard number of parent hops', () => {
    // Arrange
    const tooDeep = windowChain(MAX_API_SEARCH_DEPTH + 2, MAX_API_SEARCH_DEPTH + 2);

    // Act and Assert
    expect(findScormApi(tooDeep[0])).toBeNull();
  });

  it('falls back to the opener of a popup window', () => {
    // Arrange
    const openerChain = windowChain(1, 1);
    const [popup] = windowChain(0, null);
    Object.assign(popup as object, { opener: openerChain[0] });

    // Act and Assert
    expect(findScormApi(popup)).toBe(openerChain[1]?.API);
  });

  it('returns null when there is no window or no API anywhere', () => {
    expect(findScormApi(undefined)).toBeNull();
    expect(findScormApi(windowChain(2, null)[0])).toBeNull();
  });

  it('ignores objects that do not look like the SCORM 1.2 API', () => {
    // Arrange
    const [sco] = windowChain(0, null);
    Object.assign(sco as object, { API: { LMSInitialize: 'not a function' } });

    // Act and Assert
    expect(findScormApi(sco)).toBeNull();
  });

  it('treats a cross-origin parent (SecurityError on access) as no API', () => {
    // Arrange
    const sco = {
      get parent(): ScormWindowLike {
        throw new DOMException('Blocked a frame with origin', 'SecurityError');
      },
    } as ScormWindowLike;

    // Act and Assert
    expect(findScormApi(sco)).toBeNull();
  });
});

describe('isScormTrue', () => {
  it('accepts the string and boolean forms LMSs return', () => {
    expect(isScormTrue('true')).toBe(true);
    expect(isScormTrue(true)).toBe(true);
    expect(isScormTrue('false')).toBe(false);
    expect(isScormTrue(false)).toBe(false);
    expect(isScormTrue(undefined)).toBe(false);
  });
});

describe('cmiTimespan', () => {
  it('formats elapsed milliseconds as CMITimespan HHHH:MM:SS.SS', () => {
    expect(cmiTimespan(0)).toBe('0000:00:00.00');
    expect(cmiTimespan(3_723_450)).toBe('0001:02:03.45');
  });

  it('clamps negative and huge values into the allowed range', () => {
    expect(cmiTimespan(-5)).toBe('0000:00:00.00');
    expect(cmiTimespan(Number.POSITIVE_INFINITY)).toBe('0000:00:00.00');
    expect(cmiTimespan(10_000 * 3_600_000)).toBe('9999:59:59.99');
  });
});
