import { calculateQuorum, DEFAULT_MEETING_RULES, type MeetingRules } from '../../calculators/meeting-rules';
import { formatNumber, formatPercent } from '../../shared/number-format';
import { err, ok, type Result } from '../../shared/result';
import type { ElectionItem, MeetingScenario, Registration, ResolutionItem } from './types';
import { electBoard, tallyResolution, type ElectionResult, type ResolutionTally } from './voting';

/** Сцена симуляції: заголовок (на нього переводиться фокус), текст, питання до студента, пояснення для aria-live. */
export type SceneAnswer = number | boolean | readonly string[];

export type SceneQuestion =
  | { readonly kind: 'number'; readonly prompt: string; readonly unit: string; readonly answer: number }
  | { readonly kind: 'yes-no'; readonly prompt: string; readonly answer: boolean }
  | {
      readonly kind: 'select-candidates';
      readonly prompt: string;
      readonly options: readonly { readonly id: string; readonly label: string }[];
      /** Відсортовані ID обраних; порожній масив — раду не сформовано. */
      readonly answer: readonly string[];
    };

export type SceneKind = 'briefing' | 'registration' | 'quorum' | 'resolution' | 'election' | 'protocol';

export interface MeetingScene {
  readonly id: string;
  readonly kind: SceneKind;
  readonly title: string;
  readonly body: string;
  readonly question: SceneQuestion | null;
  /** Показується після відповіді (або одразу, якщо питання немає). */
  readonly explanation: string;
}

export interface ScenarioError {
  readonly code: 'invalid-scenario';
  readonly message: string;
}

const n = (value: number) => formatNumber(value, { maximumFractionDigits: 0 });

function registrationScene(scenario: MeetingScenario, registration: Registration): MeetingScene {
  const rejected = registration.entries.filter((entry) => entry.status === 'rejected');
  const absent = registration.entries.filter((entry) => entry.status === 'absent');
  const rejectedText = rejected.length > 0 ? ` Не допущено: ${rejected.map((entry) => `${entry.name} — ${entry.reason ?? ''}`).join('; ')}` : '';
  const absentText = absent.length > 0 ? ` Не з’явилися: ${absent.map((entry) => entry.name).join(', ')}.` : '';
  return {
    id: 'registration',
    kind: 'registration',
    title: 'Реєстрація учасників',
    body: `Лічильна комісія перевіряє паспорти й довіреності ${scenario.shareholders.length} акціонерів із переліку.`,
    question: { kind: 'number', prompt: 'Скільки голосуючих акцій зареєстровано?', unit: 'акцій', answer: registration.registeredShares },
    explanation: `Зареєстровано ${n(registration.registeredShares)} з ${n(registration.votingShares)} голосуючих акцій.${rejectedText}${absentText}`,
  };
}

function resolutionScene(item: ResolutionItem, tally: ResolutionTally): MeetingScene {
  const { decision } = tally;
  const baseText = decision.threshold.base === 'total' ? 'загальної кількості голосуючих акцій' : 'зареєстрованих голосів';
  return {
    id: `item-${item.id}`,
    kind: 'resolution',
    title: item.title,
    body: `Голосування бюлетенями. Вимога: частка «за» від ${baseText} — більше ${decision.threshold.numerator}/${decision.threshold.denominator}.`,
    question: { kind: 'yes-no', prompt: 'Чи прийнято рішення?', answer: decision.adopted },
    explanation:
      `За — ${n(tally.votesFor)}, проти — ${n(tally.votesAgainst)}, утрималися — ${n(tally.abstained)}, не голосували — ${n(tally.notVoted)}. ` +
      `Потрібно щонайменше ${n(decision.requiredVotes)} голосів «за» з ${n(decision.base)}. Рішення ${decision.adopted ? 'прийнято' : 'не прийнято'}.`,
  };
}

function electionScene(item: ElectionItem, result: ElectionResult): MeetingScene {
  const elected = result.candidates.filter((candidate) => candidate.elected).map((candidate) => candidate.name);
  const tallyText = result.candidates.map((candidate) => `${candidate.name} — ${n(candidate.votes)}`).join('; ');
  const invalidText = result.invalidBallots.length > 0 ? ` ${result.invalidBallots.map((ballot) => ballot.reason).join(' ')}` : '';
  return {
    id: `item-${item.id}`,
    kind: 'election',
    title: item.title,
    body: `Кумулятивне голосування: кожен акціонер має акції × ${item.seats} голосів і розподіляє їх між кандидатами.`,
    question: {
      kind: 'select-candidates',
      prompt: 'Кого обрано до ради? Якщо раду не сформовано — не вибирайте нікого.',
      options: item.candidates.map((candidate) => ({ id: candidate.id, label: candidate.name })),
      answer: [...result.elected].sort(),
    },
    explanation: `${tallyText}.${invalidText} ${result.formed ? `Обрано: ${elected.join(', ')}.` : (result.reason ?? '')}`,
  };
}

/** Будує сцени з сценарію. Без кворуму питання порядку денного не розглядаються. */
export function buildMeetingScenes(
  scenario: MeetingScenario,
  registration: Registration,
  rules: MeetingRules = DEFAULT_MEETING_RULES,
): Result<readonly MeetingScene[], ScenarioError> {
  const quorum = calculateQuorum({ votingShares: registration.votingShares, registeredShares: registration.registeredShares }, rules);
  if (!quorum.ok) return err({ code: 'invalid-scenario', message: quorum.error.message });

  const briefing: MeetingScene = {
    id: 'briefing',
    kind: 'briefing',
    title: scenario.title,
    body: `${scenario.company}. Порядок денний: ${scenario.agenda.map((item) => `«${item.title}»`).join(', ')}.`,
    question: null,
    explanation: 'Ви — секретар лічильної комісії. Перевірте реєстрацію, кворум і підрахунок голосів за кожним питанням.',
  };
  const quorumScene: MeetingScene = {
    id: 'quorum',
    kind: 'quorum',
    title: 'Кворум',
    body: 'Кворум визначається на момент закінчення реєстрації (ст. 40 Закону № 2465-IX).',
    question: { kind: 'yes-no', prompt: 'Чи мають збори кворум?', answer: quorum.value.hasQuorum },
    explanation:
      `Потрібно щонайменше ${n(quorum.value.requiredShares)} з ${n(registration.votingShares)} голосуючих акцій; ` +
      `зареєстровано ${n(registration.registeredShares)} (${formatPercent(quorum.value.registeredShare)}). Кворум ${quorum.value.hasQuorum ? 'є' : 'відсутній'}.`,
  };

  const items: MeetingScene[] = [];
  const outcomes: string[] = [];
  if (quorum.value.hasQuorum) {
    for (const item of scenario.agenda) {
      if (item.kind === 'resolution') {
        const tally = tallyResolution(item, registration, rules);
        if (!tally.ok) return err({ code: 'invalid-scenario', message: tally.error.message });
        items.push(resolutionScene(item, tally.value));
        outcomes.push(`«${item.title}» — ${tally.value.decision.adopted ? 'прийнято' : 'не прийнято'}`);
      } else {
        const result = electBoard(item, registration);
        items.push(electionScene(item, result));
        outcomes.push(`«${item.title}» — ${result.formed ? 'раду обрано' : 'раду не сформовано'}`);
      }
    }
  }

  const protocol: MeetingScene = {
    id: 'protocol',
    kind: 'protocol',
    title: 'Протокол загальних зборів',
    body: 'Протокол складається протягом 10 днів після закриття зборів (ст. 57 Закону № 2465-IX).',
    question: null,
    explanation: quorum.value.hasQuorum
      ? `Підсумки: ${outcomes.join('; ')}.`
      : 'Загальні збори не відбулися: кворуму немає, питання порядку денного не розглядалися.',
  };
  return ok([briefing, registrationScene(scenario, registration), quorumScene, ...items, protocol]);
}
