/**
 * Фікстурний маніфест матеріалів для модульних тестів і E2E-збірки кабінету (KU_E2E_DOWNLOADS=1).
 * Самих файлів у репозиторії немає: E2E віддає їх через page.route, модульним тестам вони не потрібні.
 */
import { DownloadManifestSchema, type DownloadManifest } from '../../../content/schemas/downloads';

export const E2E_BACKUP_URL = 'https://github.com/Youngerfornday/korporatyvne-upravlinnia/releases/latest/download/korporatyvne-upravlinnia.mbz';

const RAW_MANIFEST = {
  schemaVersion: 1,
  generatedAt: '2026-09-16T09:30:00Z',
  items: [
    {
      id: 'syllabus-docx',
      title: 'Силабус дисципліни',
      kind: 'syllabus',
      format: 'docx',
      path: 'downloads/course/syllabus.docx',
      bytes: 48_213,
    },
    {
      id: 't01-lecture-pdf',
      title: 'Лекція 1. Корпорація і корпоративне управління',
      kind: 'lecture',
      format: 'pdf',
      module: 'm1',
      topic: 't01',
      path: 'downloads/m1/t01/lecture.pdf',
      bytes: 1_468_006,
    },
    {
      id: 't01-book-zip',
      title: 'Тема 1 — глави для Книги Moodle',
      kind: 'book',
      format: 'zip',
      audience: 'teacher',
      module: 'm1',
      topic: 't01',
      path: 'downloads/m1/t01/book.zip',
      bytes: 312_400,
    },
    {
      id: 't01-questions-xml',
      title: 'Тренувальний тест 1 — питання Moodle XML',
      kind: 'question-bank',
      format: 'xml',
      audience: 'teacher',
      module: 'm1',
      topic: 't01',
      path: 'downloads/m1/t01/questions-training.xml',
      bytes: 96_512,
    },
    {
      id: 't01-glossary-xml',
      title: 'Глосарій теми 1 — записи Moodle XML',
      kind: 'glossary',
      format: 'xml',
      audience: 'teacher',
      module: 'm1',
      topic: 't01',
      path: 'downloads/m1/t01/glossary.xml',
      bytes: 21_300,
    },
    {
      id: 'p01-practical-pdf',
      title: 'Практична 1. Матриця моделей корпоративного управління',
      kind: 'practical',
      format: 'pdf',
      module: 'm1',
      practical: 'p01',
      path: 'downloads/m1/p01/practical.pdf',
      bytes: 640_000,
    },
    {
      id: 'm1-questions-xml',
      title: 'Модуль 1 — тренувальний банк Moodle XML',
      description: 'Усі питання тренувальних тестів модуля одним файлом.',
      kind: 'question-bank',
      format: 'xml',
      audience: 'teacher',
      module: 'm1',
      path: 'downloads/m1/questions-training-m1.xml',
      bytes: 120_000,
    },
    {
      id: 'm1-bundle',
      title: 'Модуль 1 — усі матеріали',
      kind: 'bundle',
      format: 'zip',
      audience: 'teacher',
      module: 'm1',
      path: 'downloads/bundles/m1.zip',
      bytes: 18_400_000,
    },
    {
      id: 'course-backup',
      title: 'Резервна копія курсу для Moodle 5.2',
      description: 'Тренувальні тести, Книги, глосарій окремим файлом.',
      kind: 'backup',
      format: 'mbz',
      audience: 'teacher',
      url: E2E_BACKUP_URL,
      bytes: 24_900_000,
    },
  ],
};

export function fixtureManifest(): DownloadManifest {
  return DownloadManifestSchema.parse(RAW_MANIFEST);
}
