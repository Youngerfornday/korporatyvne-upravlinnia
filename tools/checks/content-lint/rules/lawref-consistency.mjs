/** Звіряє коди норм у тілі/слайдах із кодами frontmatter lawRef тієї самої теми. */
import { codesIn } from '../refs.mjs';
import { ERROR, makeFinding } from '../finding.mjs';

export const RULE = 'lawref-consistency';
const HINT = 'Синхронізуйте коди: додайте відсутні коди до frontmatter `lawRef` або приберіть/виправте зайві посилання в тексті чи слайдах.';
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

function topicOf(file) {
  return /(?:^|\/)modules\/([^/]+)\/(t\d+)\//.exec(file.file)?.slice(1).join('/') ?? '';
}

function frontCodes(lecture) {
  const refs = Array.isArray(lecture.data?.lawRef) ? lecture.data.lawRef : lecture.data?.lawRef ? [lecture.data.lawRef] : [];
  return new Set(refs.flatMap((ref) => codesIn(String(ref?.article ?? ''))));
}

function frontLine(lecture) {
  return lecture.maps.find((node) => node.path.at(-1) === 'lawRef')?.line ?? 1;
}

function lineOfCode(file, code) {
  const index = file.text.indexOf(code);
  return index < 0 ? 0 : file.text.slice(0, index).split(/\r?\n/).length;
}

/**
 * Один finding на тему містить обидва типи розбіжностей, щоб звіт не розсипався на
 * десятки однакових повідомлень.
 */
export function checkLawrefConsistency(files) {
  const topics = new Map();
  for (const file of files) {
    const topic = topicOf(file);
    if (!topic) continue;
    const current = topics.get(topic) ?? { lecture: null, slides: [] };
    if (file.kind === 'mdx' && /\/lecture\.mdx$/.test(file.file)) current.lecture = file;
    if (file.kind === 'yaml' && /\/slides\.ya?ml$/.test(file.file)) current.slides.push(file);
    topics.set(topic, current);
  }

  return [...topics.entries()].flatMap(([topic, { lecture, slides }]) => {
    if (!lecture) return [];
    const expected = frontCodes(lecture);
    const body = lecture.text.replace(FRONTMATTER, '');
    const mentioned = new Set(codesIn(body));
    for (const slide of slides) for (const code of codesIn(slide.text)) mentioned.add(code);
    const missingInFrontmatter = [...mentioned].filter((code) => !expected.has(code)).sort();
    const missingInText = [...expected].filter((code) => !mentioned.has(code)).sort();
    if (missingInFrontmatter.length === 0 && missingInText.length === 0) return [];
    const line = missingInFrontmatter.length > 0
      ? lineOfCode(lecture, missingInFrontmatter[0]) || slides.map((slide) => lineOfCode(slide, missingInFrontmatter[0])).find((value) => value > 1) || 1
      : frontLine(lecture);
    const parts = [];
    if (missingInFrontmatter.length > 0) parts.push(`згадані в тексті/слайдах, але відсутні у lawRef: ${missingInFrontmatter.join(', ')}`);
    if (missingInText.length > 0) parts.push(`є у lawRef, але не згадані в тексті/слайдах: ${missingInText.join(', ')}`);
    return [makeFinding({
      file: lecture.file,
      line,
      rule: RULE,
      level: ERROR,
      message: `Тема ${topic.split('/').at(-1)}: ${parts.join('; ')}`,
      hint: HINT,
    })];
  });
}
