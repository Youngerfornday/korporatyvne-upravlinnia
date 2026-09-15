import { describe, expect, it } from 'vitest';
import type { AuctionOrder } from './clearing';
import { clearRound, nextRound, roundSummaryText, startAuctionGame, submitOrder, withdrawOrder, type AuctionGameConfig, type AuctionGameState } from './game';

const NBSP = '\u00A0';

const config: AuctionGameConfig = {
  id: 'birzha-1',
  security: 'ПрАТ «Зоря»',
  rounds: 2,
  referencePrice: 100,
  participants: [
    { id: 'broker-a', name: 'Брокер А', cash: 50_000, shares: 0 },
    { id: 'broker-b', name: 'Брокер Б', cash: 10_000, shares: 500 },
    { id: 'broker-c', name: 'Брокер В', cash: 0, shares: 300 },
  ],
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function buy(id: string, participantId: string, quantity: number, limitPrice: number): AuctionOrder {
  return { id, participantId, side: 'buy', quantity, limitPrice };
}

function sell(id: string, participantId: string, quantity: number, limitPrice: number): AuctionOrder {
  return { id, participantId, side: 'sell', quantity, limitPrice };
}

function withOrders(state: AuctionGameState, orders: readonly AuctionOrder[]): AuctionGameState {
  return orders.reduce((acc, current) => unwrap(submitOrder(acc, current)), state);
}

describe('auction game rounds', () => {
  it('starts in the collecting phase of round 1 with the configured portfolios', () => {
    const state = unwrap(startAuctionGame(config));
    expect(state).toMatchObject({ round: 1, totalRounds: 2, phase: 'collecting', referencePrice: 100, orders: [], history: [] });
    expect(state.portfolios).toEqual([
      { participantId: 'broker-a', cash: 50_000, shares: 0 },
      { participantId: 'broker-b', cash: 10_000, shares: 500 },
      { participantId: 'broker-c', cash: 0, shares: 300 },
    ]);
  });

  it('clears a round, settles cash and shares at the auction price and moves the reference price', () => {
    // Arrange
    const start = unwrap(startAuctionGame(config));
    const collected = withOrders(start, [buy('o1', 'broker-a', 400, 104), sell('o2', 'broker-b', 200, 101), sell('o3', 'broker-c', 300, 103)]);

    // Act
    const cleared = unwrap(clearRound(collected));

    // Assert
    expect(cleared.phase).toBe('cleared');
    // 101: 400 / 200 → 200; 103 і 104: 400 / 500 → 400, дисбаланс −100 → тиск продавців → нижча ціна 103.
    expect(cleared.referencePrice).toBe(103);
    expect(cleared.history).toHaveLength(1);
    expect(cleared.history[0]?.clearing).toMatchObject({ price: 103, volume: 400 });
    expect(cleared.portfolios).toEqual([
      { participantId: 'broker-a', cash: 8_800, shares: 400 },
      { participantId: 'broker-b', cash: 30_600, shares: 300 },
      { participantId: 'broker-c', cash: 20_600, shares: 100 },
    ]);
    expect(collected.phase).toBe('collecting');
  });

  it('advances to the next round with an empty book and finishes after the last round', () => {
    const cleared = unwrap(clearRound(unwrap(startAuctionGame(config))));
    const second = unwrap(nextRound(cleared));
    expect(second).toMatchObject({ round: 2, phase: 'collecting', orders: [], referencePrice: 100 });
    const finished = unwrap(nextRound(unwrap(clearRound(second))));
    expect(finished.phase).toBe('finished');
    expect(nextRound(finished)).toMatchObject({ ok: false, error: { code: 'wrong-phase' } });
  });

  it('lets a participant withdraw an order before clearing', () => {
    const state = withOrders(unwrap(startAuctionGame(config)), [buy('o1', 'broker-a', 10, 100)]);
    expect(unwrap(withdrawOrder(state, 'o1')).orders).toEqual([]);
    expect(withdrawOrder(state, 'nope')).toMatchObject({ ok: false, error: { code: 'unknown-order' } });
  });
});

describe('auction game rules', () => {
  const start = () => unwrap(startAuctionGame(config));

  it('reserves cash for buy orders and shares for sell orders', () => {
    const state = withOrders(start(), [buy('o1', 'broker-b', 90, 100)]);
    expect(submitOrder(state, buy('o2', 'broker-b', 20, 100))).toMatchObject({ ok: false, error: { code: 'insufficient-cash' } });
    const selling = withOrders(start(), [sell('o1', 'broker-c', 200, 100)]);
    expect(submitOrder(selling, sell('o2', 'broker-c', 101, 100))).toMatchObject({ ok: false, error: { code: 'insufficient-shares' } });
  });

  it('rejects unknown participants, duplicate IDs, invalid orders and orders outside the collecting phase', () => {
    const state = withOrders(start(), [buy('o1', 'broker-a', 10, 100)]);
    expect(submitOrder(state, buy('o2', 'ghost', 10, 100))).toMatchObject({ ok: false, error: { code: 'unknown-participant' } });
    expect(submitOrder(state, buy('o1', 'broker-a', 10, 100))).toMatchObject({ ok: false, error: { code: 'duplicate-order' } });
    expect(submitOrder(state, buy('o3', 'broker-a', 0, 100))).toMatchObject({ ok: false, error: { code: 'invalid-order' } });
    const cleared = unwrap(clearRound(state));
    expect(submitOrder(cleared, buy('o4', 'broker-a', 1, 100))).toMatchObject({ ok: false, error: { code: 'wrong-phase' } });
    expect(clearRound(cleared)).toMatchObject({ ok: false, error: { code: 'wrong-phase' } });
    expect(withdrawOrder(cleared, 'o1')).toMatchObject({ ok: false, error: { code: 'wrong-phase' } });
  });

  it.each([
    [{ ...config, rounds: 0 }],
    [{ ...config, referencePrice: 0 }],
    [{ ...config, participants: [] }],
    [{ ...config, participants: [config.participants[0]!, config.participants[0]!] }],
    [{ ...config, participants: [{ id: 'x', name: 'X', cash: -1, shares: 0 }] }],
  ])('rejects an invalid configuration (%#)', (bad) => {
    expect(startAuctionGame(bad)).toMatchObject({ ok: false, error: { code: 'invalid-config' } });
  });
});

describe('roundSummaryText', () => {
  it('announces the price and volume of a round', () => {
    const bigger = { ...config, participants: [{ ...config.participants[0]!, cash: 100_000 }, { ...config.participants[1]!, shares: 2_000 }, config.participants[2]!] };
    const orders = [buy('o1', 'broker-a', 1_200, 20), sell('o2', 'broker-b', 1_200, 20)];
    const record = unwrap(clearRound(withOrders(unwrap(startAuctionGame(bigger)), orders))).history[0]!;
    expect(roundSummaryText(record)).toBe(`Раунд 1: ціна 20,00${NBSP}грн, укладено угод на 1${NBSP}200 акцій.`);
  });

  it('explains a round without trades', () => {
    const record = unwrap(clearRound(unwrap(startAuctionGame(config)))).history[0]!;
    expect(roundSummaryText(record)).toBe('Раунд 1: угод не укладено — жодна ціна покупця не досягла ціни продавця.');
  });
});
