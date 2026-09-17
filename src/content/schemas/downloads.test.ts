import { describe, expect, it } from 'vitest';
import { DownloadManifestSchema } from './downloads';

const lecturePdf = {
  id: 't01-lecture-pdf',
  title: 'Тема 1. Корпорація і корпоративне управління',
  kind: 'lecture',
  format: 'pdf',
  module: 'm1',
  topic: 't01',
  path: 'downloads/m1/t01-lecture.pdf',
  bytes: 1024,
};

const manifest = (items: unknown[]) => ({ schemaVersion: 1, generatedAt: '2026-09-17T12:00:00Z', items });

describe('DownloadManifestSchema', () => {
  it('приймає файл сайту й зовнішню резервну копію курсу', () => {
    const backup = {
      id: 'course-backup',
      title: 'Резервна копія курсу для Moodle 5.2',
      kind: 'backup',
      format: 'mbz',
      audience: 'teacher',
      url: 'https://github.com/Youngerfornday/korporatyvne-upravlinnia/releases/latest/download/korporatyvne-upravlinnia.mbz',
      bytes: 2_000_000,
    };
    const parsed = DownloadManifestSchema.parse(manifest([lecturePdf, backup]));
    expect(parsed.items[0]?.audience).toBe('student');
    expect(parsed.items[1]?.audience).toBe('teacher');
  });

  it('вимагає рівно одне з полів path або url', () => {
    const both = { ...lecturePdf, url: 'https://example.com/file.pdf' };
    const none = { ...lecturePdf, path: undefined };
    expect(DownloadManifestSchema.safeParse(manifest([both])).success).toBe(false);
    expect(DownloadManifestSchema.safeParse(manifest([none])).success).toBe(false);
  });

  it('відхиляє шлях поза downloads/ і дублікати ID', () => {
    expect(DownloadManifestSchema.safeParse(manifest([{ ...lecturePdf, path: '../secret.pdf' }])).success).toBe(false);
    expect(DownloadManifestSchema.safeParse(manifest([lecturePdf, lecturePdf])).success).toBe(false);
  });
});
