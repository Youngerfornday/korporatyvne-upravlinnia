/**
 * Правило 6. Джерела.
 * Кожен запис `sources` має бути використаний (посиланням у тексті, адресою або як `source:`),
 * а кожне посилання `source:` / `#src-…` — вести на наявний запис.
 * Невикористане джерело — попередження, «висяче» посилання — помилка.
 */
import { ERROR, WARNING, makeFinding } from '../finding.mjs';
import { lower, quote } from '../text.mjs';

export const RULE_UNUSED = 'source-unused';
export const RULE_DANGLING = 'source-missing';
const UNUSED_HINT = 'Пошліться на джерело в тексті (id, адреса або назва) чи в полі `source:` — або приберіть його зі списку: у переліку лишаються лише ті джерела, на яких справді тримається виклад.';
const DANGLING_HINT = 'Додайте запис із таким id до списку джерел цього файлу (для теми — sources.yaml поруч із лекцією) або виправте id у посиланні.';

const TOPIC_FOLDER = /(?:^|\/)modules\/(m\d+)\/(t\d{2})\//;
const SRC_ANCHOR = /#src-([a-z0-9-]+)/g;
const SOURCE_LIST_IDS = /<SourceList[^>]*ids=\{\[([^\]]*)\]\}/g;

function topicOf(file) {
  return TOPIC_FOLDER.exec(file.file)?.[2] ?? null;
}

/** Файли зі списком джерел: sources.yaml теми і практична. */
export function declarations(files) {
  return files
    .filter((file) => Array.isArray(file.data?.sources) && file.data.sources.length > 0)
    .map((file) => ({
      file,
      topic: file.data?.topic ?? topicOf(file),
      sources: file.data.sources.map((source) => ({
        id: String(source.id),
        url: String(source.url ?? ''),
        title: String(source.title ?? ''),
        line: file.maps.find((node) => node.keys.id === source.id)?.line ?? 1,
      })),
    }));
}

function isMentioned(source, text) {
  const haystack = lower(text);
  return haystack.includes(lower(source.id))
    || (source.url !== '' && haystack.includes(lower(source.url)))
    || (source.title !== '' && haystack.includes(lower(source.title)));
}

/**
 * Текст, у якому шукається згадка джерела: сам список `sources` не рахується,
 * інакше кожен запис «згадував» би себе.
 */
export function usageText(file) {
  if (file.kind === 'mdx') return file.text;
  return file.units.filter((unit) => unit.path[0] !== 'sources').map((unit) => unit.text).join('\n');
}

/** Посилання на джерела: `source:` і `alsoSources:` у YAML, `#src-id` і `<SourceList ids={[…]}>` у MDX. */
export function references(file) {
  const fromFields = file.units
    .filter((unit) => unit.key === 'source' || unit.path.at(-1) === 'alsoSources')
    .map((unit) => ({ id: unit.text.trim(), line: unit.line }));
  const fromText = file.kind !== 'mdx' ? [] : file.lines.flatMap((line, index) => [
    ...[...line.matchAll(SRC_ANCHOR)].map(([, id]) => ({ id, line: index + 1 })),
    ...[...line.matchAll(SOURCE_LIST_IDS)].flatMap(([, list]) =>
      [...list.matchAll(/'([a-z0-9-]+)'|"([a-z0-9-]+)"/g)].map((match) => ({ id: match[1] ?? match[2], line: index + 1 })),
    ),
  ]);
  return [...fromFields, ...fromText];
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkSourceUsage(files) {
  const declared = declarations(files);
  const byTopic = new Map(declared.filter((entry) => entry.topic).map((entry) => [entry.topic, entry]));

  const unused = declared.flatMap((entry) => {
    const scope = files
      .filter((file) => file !== entry.file || file.data?.trainer !== undefined)
      .filter((file) => entry.topic === null || topicOf(file) === null || topicOf(file) === entry.topic)
      .map((file) => (file === entry.file ? usageText(file) : file.text))
      .join('\n');
    return entry.sources
      .filter((source) => !isMentioned(source, scope))
      .map((source) => makeFinding({
        file: entry.file.file, line: source.line, rule: RULE_UNUSED, level: WARNING,
        message: `Джерело «${source.id}» описане, але в тексті на нього ніде не посилаються`,
        hint: UNUSED_HINT,
        quote: quote(source.title, 90),
      }));
  });

  const dangling = files.flatMap((file) => {
    const own = declared.find((entry) => entry.file === file);
    const topic = byTopic.get(topicOf(file));
    const known = new Set([...(own?.sources ?? []), ...(topic?.sources ?? [])].map((source) => source.id));
    if (known.size === 0) return [];
    return references(file)
      .filter((reference) => !known.has(reference.id))
      .map((reference) => makeFinding({
        file: file.file, line: reference.line, rule: RULE_DANGLING, level: ERROR,
        message: `Посилання на джерело «${reference.id}» нікуди не веде: такого запису в списку джерел немає`,
        hint: DANGLING_HINT,
      }));
  });

  return [...unused, ...dangling];
}
