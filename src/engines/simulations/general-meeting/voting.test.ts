import { describe, expect, it } from 'vitest';
import { zoriaScenario } from './__fixtures__/zoria';
import { registerShareholders, validateScenario } from './registration';
import type { ElectionItem, MeetingScenario, ResolutionItem } from './types';
import { electBoard, tallyResolution } from './voting';

function registration(scenario: MeetingScenario = zoriaScenario()) {
  return registerShareholders(scenario);
}

function item<T extends 'resolution' | 'cumulative-election'>(id: string, kind: T): T extends 'resolution' ? ResolutionItem : ElectionItem {
  const found = zoriaScenario().agenda.find((candidate) => candidate.id === id && candidate.kind === kind);
  if (!found) throw new Error(id);
  return found as T extends 'resolution' ? ResolutionItem : ElectionItem;
}

describe('registerShareholders', () => {
  it('registers personal attendance and the latest valid proxy, rejecting defective proxies with a reason', () => {
    // Act
    const result = registration();

    // Assert
    expect(result.votingShares).toBe(10_000);
    expect(result.registeredShares).toBe(7_500);
    expect(result.entries.map((entry) => [entry.shareholderId, entry.status, entry.via, entry.representative])).toEqual([
      ['agroinvest', 'registered', 'personal', null],
      ['kovalenko', 'registered', 'proxy', 'Петренко В.'],
      ['melnyk', 'rejected', 'proxy', 'Ткач Р.'],
      ['shevchuk', 'registered', 'proxy', 'Гнатюк М.'],
      ['bondar', 'absent', null, null],
      ['small-holders', 'registered', 'personal', null],
    ]);
    expect(result.entries[2]?.reason).toContain('не посвідчена');
  });

  it('rejects a representative whose latest proxy is invalid even if an older one was valid', () => {
    const scenario = zoriaScenario();
    const proxies = [
      { id: 'old', shareholderId: 'shevchuk', representative: 'А', issuedOn: '2026-01-01', valid: true },
      { id: 'new', shareholderId: 'shevchuk', representative: 'Б', issuedOn: '2026-02-01', valid: false, defect: 'підпис підроблено' },
    ];
    const entry = registration({ ...scenario, proxies }).entries.find((candidate) => candidate.shareholderId === 'shevchuk');
    expect(entry).toMatchObject({ status: 'rejected', representative: 'Б', reason: expect.stringContaining('підпис підроблено') });
  });

  it('rejects a representative without any proxy', () => {
    const scenario = { ...zoriaScenario(), proxies: [] };
    const entry = registration(scenario).entries.find((candidate) => candidate.shareholderId === 'kovalenko');
    expect(entry).toMatchObject({ status: 'rejected', reason: expect.stringContaining('довіреності') });
  });
});

describe('validateScenario', () => {
  it('accepts the reference scenario', () => {
    expect(validateScenario(zoriaScenario())).toBeNull();
  });

  it.each([
    ['duplicate shareholder', (s: MeetingScenario) => ({ ...s, shareholders: [...s.shareholders, s.shareholders[0]!] })],
    ['fractional shares', (s: MeetingScenario) => ({ ...s, shareholders: [{ id: 'x', name: 'X', shares: 1.5 }] })],
    ['no shareholders', (s: MeetingScenario) => ({ ...s, shareholders: [] })],
    ['proxy of an unknown shareholder', (s: MeetingScenario) => ({ ...s, proxies: [{ id: 'p', shareholderId: 'ghost', representative: 'R', issuedOn: '2026-01-01', valid: true }] })],
    ['duplicate attendance', (s: MeetingScenario) => ({ ...s, attendance: [...s.attendance, s.attendance[0]!] })],
    ['unsafe agenda item id', (s: MeetingScenario) => ({ ...s, agenda: [{ ...s.agenda[0]!, id: '__proto__' }] })],
    ['vote of an unknown shareholder', (s: MeetingScenario) => ({ ...s, agenda: [{ ...item('annual-report', 'resolution'), votes: [{ shareholderId: 'ghost', choice: 'for' as const }] }] })],
    ['two ballots from one shareholder', (s: MeetingScenario) => ({ ...s, agenda: [{ ...item('supervisory-board', 'cumulative-election'), ballots: [{ shareholderId: 'agroinvest', allocation: {} }, { shareholderId: 'agroinvest', allocation: {} }] }] })],
    ['election without seats', (s: MeetingScenario) => ({ ...s, agenda: [{ ...item('supervisory-board', 'cumulative-election'), seats: 0 }] })],
  ])('reports %s', (_label, mutate) => {
    expect(validateScenario(mutate(zoriaScenario()))).toMatch(/[а-яіїєґ]/i);
  });
});

describe('tallyResolution', () => {
  it('counts only registered shareholders and applies a simple majority of registered votes', () => {
    const result = tallyResolution(item('annual-report', 'resolution'), registration());
    expect(result.ok && result.value).toMatchObject({
      votesFor: 5_000,
      votesAgainst: 1_500,
      abstained: 1_000,
      notVoted: 0,
      ignored: ['melnyk'],
      decision: { adopted: true, requiredVotes: 3_751, base: 7_500 },
    });
  });

  it('applies the qualified majority, counting shareholders who did not vote as not in favour', () => {
    const result = tallyResolution(item('charter-amendments', 'resolution'), registration());
    expect(result.ok && result.value).toMatchObject({
      votesFor: 5_200,
      votesAgainst: 1_500,
      abstained: 800,
      notVoted: 0,
      decision: { adopted: false, requiredVotes: 5_626 },
    });
    const partial = { ...item('charter-amendments', 'resolution'), votes: [{ shareholderId: 'agroinvest', choice: 'for' as const }] };
    expect(tallyResolution(partial, registration()).ok && tallyResolution(partial, registration())).toMatchObject({ value: { notVoted: 3_300 } });
  });
});

describe('electBoard (cumulative voting)', () => {
  it('invalidates over-allocated ballots, ignores unregistered voters and elects the top candidates', () => {
    // Act
    const result = electBoard(item('supervisory-board', 'cumulative-election'), registration());

    // Assert
    expect(result.candidates.map((candidate) => [candidate.id, candidate.votes, candidate.elected])).toEqual([
      ['c4', 6_900, true],
      ['c1', 6_300, true],
      ['c2', 6_300, true],
      ['c3', 0, false],
    ]);
    expect(result.formed).toBe(true);
    expect(result.elected).toEqual(['c4', 'c1', 'c2']);
    expect(result.ignored).toEqual(['melnyk']);
    expect(result.invalidBallots).toEqual([{ shareholderId: 'small-holders', reason: expect.stringMatching(/3\u00A0001/) }]);
  });

  it('does not form the board when a tie at the last seat makes the composition undetermined', () => {
    const election: ElectionItem = {
      ...item('supervisory-board', 'cumulative-election'),
      ballots: [
        { shareholderId: 'agroinvest', allocation: { c1: 6_300, c2: 6_300 } },
        { shareholderId: 'kovalenko', allocation: { c3: 2_250, c4: 2_250 } },
      ],
    };
    const result = electBoard(election, registration());
    expect(result).toMatchObject({ formed: false, elected: [], reason: expect.stringContaining('ст. 53') });
  });

  it('does not form the board when fewer candidates received votes than there are seats', () => {
    const election = { ...item('supervisory-board', 'cumulative-election'), ballots: [{ shareholderId: 'agroinvest', allocation: { c1: 12_600 } }] };
    expect(electBoard(election, registration())).toMatchObject({ formed: false, reason: expect.stringContaining('менше') });
  });

  it('invalidates ballots with unknown candidates or non-integer votes', () => {
    const election: ElectionItem = {
      ...item('supervisory-board', 'cumulative-election'),
      ballots: [
        { shareholderId: 'agroinvest', allocation: { ghost: 10 } },
        { shareholderId: 'kovalenko', allocation: { c1: 1.5 } },
      ],
    };
    const result = electBoard(election, registration());
    expect(result.invalidBallots.map((ballot) => ballot.shareholderId)).toEqual(['agroinvest', 'kovalenko']);
  });
});
