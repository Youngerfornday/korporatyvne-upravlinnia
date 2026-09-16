import type { GlossaryFile } from '../../src/content/schemas/glossary.ts';
import { describeGlossaryPlan, planGlossaryExport, renderGlossaryPlan, type GlossaryManifest } from './glossary-xml.ts';
import type { ExportContent } from './load.ts';
import { describeQuestionPlan, planQuestionExport, renderQuestionPlan, type BankKind, type QuestionManifest } from './moodle-xml.ts';
import { indexTopics, moduleCategoryName, moduleOrder } from './registry.ts';

/** Набір файлів експорту: питання й глосарій на модуль і на курс, плюс маніфест очікуваного стану Moodle. */

export interface ExportFile {
  readonly name: string;
  readonly contents: string;
}

export interface ExportManifest {
  readonly schemaVersion: 1;
  readonly generator: string;
  readonly questions: ReadonlyArray<{ readonly file: string; readonly scope: string } & QuestionManifest>;
  readonly glossaries: ReadonlyArray<{ readonly file: string; readonly scope: string } & GlossaryManifest>;
}

export const MANIFEST_FILE = 'manifest.json';
/** Файли, які експорт створює і тому має право видаляти перед новим записом. */
export const OWNED_FILE = /^(?:questions-(?:training|control)-[a-z0-9]+\.xml|glossary-[a-z0-9]+\.xml|manifest\.json)$/;
const COURSE_SCOPE = 'course';

function questionFiles(content: ExportContent, kind: BankKind): { files: ExportFile[]; manifest: ExportManifest['questions'] } {
  const banks = content.banks
    .map((bank) => bank.data)
    .filter((bank) => bank.kind === kind)
    .sort((a, b) => moduleOrder(content.course, a.module) - moduleOrder(content.course, b.module));
  if (banks.length === 0) return { files: [], manifest: [] };
  const scopes = [...banks.map((bank) => ({ scope: bank.module, banks: [bank] })), { scope: COURSE_SCOPE, banks }];
  const outputs = scopes.map(({ scope, banks: scoped }) => {
    const plan = planQuestionExport(scoped, content.course);
    const name = `questions-${kind}-${scope}.xml`;
    return { file: { name, contents: renderQuestionPlan(plan) }, manifest: { file: name, scope, ...describeQuestionPlan(plan) } };
  });
  return { files: outputs.map((output) => output.file), manifest: outputs.map((output) => output.manifest) };
}

function glossaryFiles(content: ExportContent): { files: ExportFile[]; manifest: ExportManifest['glossaries'] } {
  const all = content.glossaries.map((glossary) => glossary.data);
  if (!all.some((file) => file.terms.length > 0)) return { files: [], manifest: [] };
  const topics = indexTopics(content.course);
  const moduleScopes = content.course.modules.map((module) => ({
    scope: module.id,
    name: `Глосарій: ${moduleCategoryName(module)}`,
    files: all.filter((file) => topics.get(file.topic)?.module.id === module.id),
  }));
  const scopes: ReadonlyArray<{ scope: string; name: string; files: readonly GlossaryFile[] }> = [
    ...moduleScopes,
    { scope: COURSE_SCOPE, name: `Глосарій курсу «${content.course.title}»`, files: all },
  ];
  const outputs = scopes
    .filter((scoped) => scoped.files.some((file) => file.terms.length > 0))
    .map(({ scope, name: glossaryName, files }) => {
      const plan = planGlossaryExport(files, content.course, { name: glossaryName, references: all });
      const name = `glossary-${scope}.xml`;
      return { file: { name, contents: renderGlossaryPlan(plan) }, manifest: { file: name, scope, ...describeGlossaryPlan(plan) } };
    });
  return { files: outputs.map((output) => output.file), manifest: outputs.map((output) => output.manifest) };
}

export function buildExportFiles(content: ExportContent): ExportFile[] {
  const training = questionFiles(content, 'training');
  const control = questionFiles(content, 'control');
  const glossary = glossaryFiles(content);
  const manifest: ExportManifest = {
    schemaVersion: 1,
    generator: 'tools/export/cli.ts',
    questions: [...training.manifest, ...control.manifest],
    glossaries: glossary.manifest,
  };
  return [
    ...training.files,
    ...control.files,
    ...glossary.files,
    { name: MANIFEST_FILE, contents: `${JSON.stringify(manifest, null, 2)}\n` },
  ];
}
