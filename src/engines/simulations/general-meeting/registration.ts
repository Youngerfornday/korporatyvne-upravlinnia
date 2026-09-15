import type { MeetingScenario, Proxy, Registration, RegistrationEntry } from './types';

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function agendaProblem(scenario: MeetingScenario, known: ReadonlySet<string>): string | null {
  if (hasDuplicates(scenario.agenda.map((item) => item.id))) return 'Питання порядку денного мають унікальні ID.';
  for (const item of scenario.agenda) {
    if (!SAFE_ID.test(item.id)) return `ID питання «${item.id}» має містити лише латиницю, цифри й дефіси.`;
    const voters = item.kind === 'resolution' ? item.votes.map((vote) => vote.shareholderId) : item.ballots.map((ballot) => ballot.shareholderId);
    if (voters.some((id) => !known.has(id))) return `У питанні «${item.title}» голосує невідомий акціонер.`;
    if (hasDuplicates(voters)) return `У питанні «${item.title}» акціонер голосує двічі.`;
    if (item.kind === 'cumulative-election') {
      if (!Number.isInteger(item.seats) || item.seats < 1) return `У питанні «${item.title}» кількість місць має бути цілим додатним числом.`;
      if (hasDuplicates(item.candidates.map((candidate) => candidate.id))) return `У питанні «${item.title}» кандидати мають унікальні ID.`;
    }
  }
  return null;
}

/** Повідомлення українською про ваду сценарію або null. Сценарій пише автор курсу — перевіряємо зв’язність. */
export function validateScenario(scenario: MeetingScenario): string | null {
  const ids = scenario.shareholders.map((shareholder) => shareholder.id);
  if (ids.length === 0) return 'Сценарій має містити реєстр акціонерів.';
  if (hasDuplicates(ids)) return 'Акціонери в реєстрі мають унікальні ID.';
  if (scenario.shareholders.some((shareholder) => !Number.isInteger(shareholder.shares) || shareholder.shares <= 0)) {
    return 'Кількість акцій кожного акціонера має бути цілим додатним числом.';
  }
  const known = new Set(ids);
  if (scenario.proxies.some((proxy) => !known.has(proxy.shareholderId) || !ISO_DATE.test(proxy.issuedOn))) {
    return 'Кожна довіреність має посилатися на акціонера з реєстру й мати дату РРРР-ММ-ДД.';
  }
  const attending = scenario.attendance.map((entry) => entry.shareholderId);
  if (attending.some((id) => !known.has(id)) || hasDuplicates(attending)) return 'Явка має містити кожного акціонера з реєстру не більше одного разу.';
  return agendaProblem(scenario, known);
}

/** Остання за датою довіреність акціонера; за однакової дати — пізніша в списку. */
function latestProxy(proxies: readonly Proxy[], shareholderId: string): Proxy | null {
  return proxies.filter((proxy) => proxy.shareholderId === shareholderId).reduce<Proxy | null>((latest, proxy) => (latest === null || proxy.issuedOn >= latest.issuedOn ? proxy : latest), null);
}

/**
 * Реєстрація учасників (ст. 50, 52 Закону № 2465-IX): особисто — реєструється; через представника —
 * за останньою довіреністю, якщо вона дійсна. Відсутні й не допущені не враховуються в кворумі.
 */
export function registerShareholders(scenario: MeetingScenario): Registration {
  const entries = scenario.shareholders.map((shareholder): RegistrationEntry => {
    const base = { shareholderId: shareholder.id, name: shareholder.name, shares: shareholder.shares };
    const attendance = scenario.attendance.find((entry) => entry.shareholderId === shareholder.id);
    if (!attendance) return { ...base, status: 'absent', via: null, representative: null, reason: null };
    if (attendance.via === 'personal') return { ...base, status: 'registered', via: 'personal', representative: null, reason: null };

    const proxy = latestProxy(scenario.proxies, shareholder.id);
    if (!proxy) return { ...base, status: 'rejected', via: 'proxy', representative: null, reason: 'Представник не надав довіреності.' };
    if (!proxy.valid) {
      const defect = proxy.defect ?? 'довіреність оформлено з порушенням';
      return { ...base, status: 'rejected', via: 'proxy', representative: proxy.representative, reason: `Не допущено: ${defect}.` };
    }
    return { ...base, status: 'registered', via: 'proxy', representative: proxy.representative, reason: null };
  });
  return {
    entries,
    votingShares: scenario.shareholders.reduce((acc, shareholder) => acc + shareholder.shares, 0),
    registeredShares: entries.filter((entry) => entry.status === 'registered').reduce((acc, entry) => acc + entry.shares, 0),
  };
}
