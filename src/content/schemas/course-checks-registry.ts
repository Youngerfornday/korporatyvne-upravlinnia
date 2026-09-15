import type { CourseDraft } from './course';
import { listIds, reportDuplicates, sameIds, type Report } from './course-shared';
import { findDuplicates, normalizeText } from './primitives';

/** Перехресні перевірки реєстрів course.yaml: дублікати, невідомі посилання, покриття ПРН, кейси. */

export function checkRegistry(course: CourseDraft, report: Report): void {
  const moduleIds = new Set(course.modules.map((m) => m.id));
  const topicIds = new Set(course.topics.map((t) => t.id));

  reportDuplicates(course.modules.map((m) => m.id), 'ID модуля', ['modules'], report);
  reportDuplicates(course.topics.map((t) => t.id), 'ID теми', ['topics'], report);
  reportDuplicates(course.topics.map((t) => t.slug), 'slug теми', ['topics'], report);
  reportDuplicates(course.learningOutcomes.map((o) => o.id), 'ID ПРН', ['learningOutcomes'], report);
  reportDuplicates(course.learningOutcomes.map((o) => o.code), 'коду ПРН', ['learningOutcomes'], report);
  reportDuplicates(course.glossaryTerms.map((t) => t.id), 'ID терміна', ['glossaryTerms'], report);
  reportTermNameDuplicates(course, report);

  course.topics.forEach((topic, index) => {
    if (!moduleIds.has(topic.module)) report(`Тема «${topic.id}» посилається на невідомий модуль «${topic.module}»`, ['topics', index]);
  });
  for (const module of course.modules) {
    if (!course.topics.some((topic) => topic.module === module.id)) report(`Модуль «${module.id}» не має жодної теми`, ['modules']);
  }
  course.glossaryTerms.forEach((term, index) => {
    if (!topicIds.has(term.topic)) report(`Термін «${term.id}» посилається на невідому тему «${term.topic}»`, ['glossaryTerms', index]);
  });
  course.learningOutcomes.forEach((outcome, index) => {
    for (const topic of outcome.topics) {
      if (!topicIds.has(topic)) report(`ПРН «${outcome.id}» посилається на невідому тему «${topic}»`, ['learningOutcomes', index]);
    }
  });
}

function reportTermNameDuplicates(course: CourseDraft, report: Report): void {
  const names = course.glossaryTerms.map((term) => normalizeText(term.term));
  for (const name of findDuplicates(names)) {
    const original = course.glossaryTerms.find((term) => normalizeText(term.term) === name)?.term ?? name;
    report(`Дублікат назви терміна «${original}» у реєстрі`, ['glossaryTerms']);
  }
}

/** ПРН: результати тем і практичні посилаються на зареєстровані ПРН; кожен ПРН покритий і узгоджений з реєстрами. */
export function checkOutcomeCoverage(course: CourseDraft, report: Report): void {
  const outcomeIds = new Set(course.learningOutcomes.map((o) => o.id));
  course.topics.forEach((topic, index) => {
    for (const prn of new Set(topic.results.flatMap((result) => result.prn))) {
      if (!outcomeIds.has(prn)) report(`Тема «${topic.id}»: результат посилається на невідомий ПРН «${prn}»`, ['topics', index, 'results']);
    }
  });
  course.practicals.forEach((practical, index) => {
    for (const prn of practical.prn) {
      if (!outcomeIds.has(prn)) report(`Практична «${practical.id}» посилається на невідомий ПРН «${prn}»`, ['practicals', index, 'prn']);
    }
  });

  course.learningOutcomes.forEach((outcome, index) => {
    const path = ['learningOutcomes', index];
    const coveringTopics = course.topics.filter((t) => t.results.some((r) => r.prn.includes(outcome.id))).map((t) => t.id);
    const coveringPracticals = course.practicals.filter((p) => p.prn.includes(outcome.id)).map((p) => p.id);
    if (coveringTopics.length === 0) report(`ПРН «${outcome.id}» не покритий жодною темою`, path);
    if (coveringPracticals.length === 0) report(`ПРН «${outcome.id}» не покритий жодною практичною роботою`, path);
    if (!sameIds(outcome.topics, coveringTopics)) {
      report(`ПРН «${outcome.id}»: теми ${listIds(outcome.topics)} не збігаються з темами, чиї результати його заявляють ${listIds(coveringTopics)}`, path);
    }
    if (!sameIds(outcome.practicals, coveringPracticals)) {
      report(`ПРН «${outcome.id}»: практичні ${listIds(outcome.practicals)} не збігаються з практичними, що його заявляють ${listIds(coveringPracticals)}`, path);
    }
  });
}

export function checkCompetences(course: CourseDraft, report: Report): void {
  const topicIds = new Set(course.topics.map((t) => t.id));
  reportDuplicates(course.competences.map((c) => c.id), 'ID компетентності', ['competences'], report);
  reportDuplicates(course.competences.map((c) => c.code), 'коду компетентності', ['competences'], report);
  course.competences.forEach((competence, index) => {
    const expectedPrefix = competence.kind === 'general' ? 'zk' : 'sk';
    if (!competence.id.startsWith(expectedPrefix)) {
      report(`Компетентність «${competence.id}»: ID для виду ${competence.kind} має починатися з «${expectedPrefix}»`, ['competences', index]);
    }
    for (const topic of competence.topics) {
      if (!topicIds.has(topic)) report(`Компетентність «${competence.id}» посилається на невідому тему «${topic}»`, ['competences', index]);
    }
  });
}

export function checkPracticals(course: CourseDraft, report: Report): void {
  const moduleIds = new Set(course.modules.map((m) => m.id));
  const topicModule = new Map(course.topics.map((t) => [t.id, t.module]));
  reportDuplicates(course.practicals.map((p) => p.id), 'ID практичної', ['practicals'], report);
  course.practicals.forEach((practical, index) => {
    const path = ['practicals', index];
    if (!moduleIds.has(practical.module)) report(`Практична «${practical.id}» посилається на невідомий модуль «${practical.module}»`, path);
    for (const topic of practical.topics) {
      if (!topicModule.has(topic)) report(`Практична «${practical.id}» посилається на невідому тему «${topic}»`, path);
    }
    const primaryModule = topicModule.get(practical.topics[0] ?? '');
    if (primaryModule !== undefined && primaryModule !== practical.module) {
      report(`Практична «${practical.id}»: модуль «${practical.module}» не збігається з модулем першої теми («${primaryModule}»)`, path);
    }
  });
}

/** Кейси: зареєстровані; повна фабула — в основній темі; аспекти в різних темах не повторюються; у темі є український і міжнародний кейс. */
export function checkCases(course: CourseDraft, report: Report): void {
  const cases = new Map(course.cases.map((item) => [item.id, item]));
  reportDuplicates(course.cases.map((c) => c.id), 'ID кейсу', ['cases'], report);

  course.topics.forEach((topic, index) => {
    const path = ['topics', index, 'cases'];
    for (const item of topic.cases) {
      if (!cases.has(item.case)) report(`Тема «${topic.id}» посилається на незареєстрований кейс «${item.case}»`, path);
    }
    for (const duplicate of findDuplicates(topic.cases.map((item) => item.case))) {
      report(`Тема «${topic.id}»: кейс «${duplicate}» вказано двічі`, path);
    }
    const regions = new Set(topic.cases.map((item) => cases.get(item.case)?.region));
    if (!regions.has('ua')) report(`Тема «${topic.id}» не має українського кейсу`, path);
    if (!regions.has('international')) report(`Тема «${topic.id}» не має міжнародного кейсу`, path);
  });

  course.cases.forEach((item, index) => {
    const uses = course.topics.flatMap((topic) =>
      topic.cases.filter((use) => use.case === item.id).map((use) => ({ topic: topic.id, focus: normalizeText(use.focus) })),
    );
    if (!uses.some((use) => use.topic === item.primaryTopic)) {
      report(`Кейс «${item.id}»: основна тема «${item.primaryTopic}» не містить цього кейсу`, ['cases', index]);
    }
    for (const focus of findDuplicates(uses.map((use) => use.focus))) {
      const topics = uses.filter((use) => use.focus === focus).map((use) => use.topic);
      report(`Кейс «${item.id}»: однаковий фокус у темах ${topics.join(', ')} — фабула не повинна дублюватися`, ['cases', index]);
    }
  });
}

export function checkRegulationRefs(course: CourseDraft, report: Report): void {
  const known = new Set(course.regulations.map((r) => r.id));
  reportDuplicates(course.regulations.map((r) => r.id), 'ID положення', ['regulations'], report);
  const refs = [
    ...course.grading.admission.basis,
    course.grading.scaleBasis,
    ...course.policies.basis,
    ...course.policies.aiModel.basis,
  ];
  for (const ref of refs) {
    if (!known.has(ref.regulation)) report(`Посилання на невідоме положення «${ref.regulation}»`, ['regulations']);
  }
}

export function checkLiterature(course: CourseDraft, report: Report): void {
  const { main, additional } = course.literature;
  reportDuplicates([...main, ...additional].map((book) => book.id), 'ID джерела літератури', ['literature'], report);
}
