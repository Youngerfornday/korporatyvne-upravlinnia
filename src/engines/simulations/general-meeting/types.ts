import type { MajorityKind } from '../../calculators/meeting-rules';

/** Сценарій симуляції загальних зборів: реєстр, довіреності, явка, порядок денний із голосами. */
export interface Shareholder {
  readonly id: string;
  readonly name: string;
  /** Голосуючі акції (без викуплених товариством). */
  readonly shares: number;
}

export interface Proxy {
  readonly id: string;
  readonly shareholderId: string;
  readonly representative: string;
  /** Дата видачі РРРР-ММ-ДД: за кількох довіреностей реєструється та, що видана пізніше (ст. 50 ч. 6). */
  readonly issuedOn: string;
  readonly valid: boolean;
  /** Чому довіреність недійсна — показується в поясненні реєстрації. */
  readonly defect?: string;
}

export interface Attendance {
  readonly shareholderId: string;
  readonly via: 'personal' | 'proxy';
}

export type VoteChoice = 'for' | 'against' | 'abstain';

export interface ResolutionItem {
  readonly id: string;
  readonly kind: 'resolution';
  readonly title: string;
  readonly majority: MajorityKind;
  readonly votes: readonly { readonly shareholderId: string; readonly choice: VoteChoice }[];
}

export interface Candidate {
  readonly id: string;
  readonly name: string;
}

export interface ElectionItem {
  readonly id: string;
  readonly kind: 'cumulative-election';
  readonly title: string;
  readonly seats: number;
  readonly candidates: readonly Candidate[];
  readonly ballots: readonly { readonly shareholderId: string; readonly allocation: Readonly<Record<string, number>> }[];
}

export type AgendaItem = ResolutionItem | ElectionItem;

export interface MeetingScenario {
  readonly id: string;
  readonly title: string;
  readonly company: string;
  readonly shareholders: readonly Shareholder[];
  readonly proxies: readonly Proxy[];
  readonly attendance: readonly Attendance[];
  readonly agenda: readonly AgendaItem[];
}

export interface RegistrationEntry {
  readonly shareholderId: string;
  readonly name: string;
  readonly shares: number;
  readonly status: 'registered' | 'rejected' | 'absent';
  readonly via: Attendance['via'] | null;
  readonly representative: string | null;
  readonly reason: string | null;
}

export interface Registration {
  readonly entries: readonly RegistrationEntry[];
  readonly votingShares: number;
  readonly registeredShares: number;
}
