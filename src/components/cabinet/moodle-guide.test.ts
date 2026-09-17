import { describe, expect, it } from 'vitest';
import { DownloadKindSchema } from '../../content/schemas/downloads';
import { fixtureManifest } from './__fixtures__/manifest';
import { parseManifest } from './load-manifest';
import { GUIDE_SECTIONS, inlineParts } from './moodle-guide';

describe('inlineParts', () => {
  it('*жирний* і `код` серед звичайного тексту', () => {
    expect(inlineParts('Натисніть *Відновити* і оберіть `course.mbz`.')).toEqual([
      { kind: 'text', text: 'Натисніть ' },
      { kind: 'strong', text: 'Відновити' },
      { kind: 'text', text: ' і оберіть ' },
      { kind: 'code', text: 'course.mbz' },
      { kind: 'text', text: '.' },
    ]);
    expect(inlineParts('Без розмітки')).toEqual([{ kind: 'text', text: 'Без розмітки' }]);
  });

  it('розділи інструкції мають унікальні якорі й посилаються на існуючі види файлів', () => {
    const ids = GUIDE_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const kind of GUIDE_SECTIONS.flatMap((section) => section.files?.kinds ?? [])) {
      expect(DownloadKindSchema.options).toContain(kind);
    }
  });
});

describe('parseManifest', () => {
  const source = 'public/downloads/manifest.json';

  it('приймає валідний маніфест', () => {
    const manifest = fixtureManifest();
    expect(parseManifest(JSON.stringify(manifest), source).items).toHaveLength(manifest.items.length);
  });

  it('некоректний JSON і порушення схеми дають зрозуміле повідомлення з назвою файлу', () => {
    expect(() => parseManifest('{', source)).toThrow(/manifest\.json: некоректний JSON/);
    expect(() => parseManifest(JSON.stringify({ schemaVersion: 2, generatedAt: 'вчора', items: [] }), source)).toThrow(/не відповідає схемі маніфесту[\s\S]*schemaVersion/);
  });
});
