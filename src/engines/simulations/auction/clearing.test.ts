import { describe, expect, it } from 'vitest';
import { clearCallAuction, type AuctionOrder } from './clearing';

function order(id: string, side: 'buy' | 'sell', quantity: number, limitPrice: number, participantId = id): AuctionOrder {
  return { id, participantId, side, quantity, limitPrice };
}

function clear(orders: readonly AuctionOrder[], referencePrice?: number) {
  const result = clearCallAuction(orders, referencePrice === undefined ? {} : { referencePrice });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('clearCallAuction: price of maximum volume', () => {
  it('builds the cumulative demand and supply table for every limit price', () => {
    // Arrange
    const orders = [order('b1', 'buy', 300, 102), order('b2', 'buy', 200, 100), order('s1', 'sell', 250, 99), order('s2', 'sell', 300, 101)];

    // Act
    const result = clear(orders);

    // Assert
    expect(result.levels).toEqual([
      { price: 99, buyVolume: 500, sellVolume: 250, executable: 250, imbalance: 250 },
      { price: 100, buyVolume: 500, sellVolume: 250, executable: 250, imbalance: 250 },
      { price: 101, buyVolume: 300, sellVolume: 550, executable: 300, imbalance: -250 },
      { price: 102, buyVolume: 300, sellVolume: 550, executable: 300, imbalance: -250 },
    ]);
    expect(result.price).toBe(101);
    expect(result.volume).toBe(300);
  });

  it('picks the single price with the largest executable volume', () => {
    // 102: 250 / 100 → 100; 103: 250 / 250 → 250; 105: 150 / 250 → 150.
    const orders = [order('b1', 'buy', 150, 105), order('b2', 'buy', 100, 103), order('s1', 'sell', 100, 102), order('s2', 'sell', 150, 103)];
    const result = clear(orders);
    expect(result).toMatchObject({ price: 103, volume: 250, decidedBy: 'volume' });
  });

  it('breaks volume ties by the smallest imbalance', () => {
    // 10: попит 100, пропозиція 100 → 100, дисбаланс 0; 11 і 12: 100 / 150 → 100, дисбаланс −50.
    const orders = [order('b1', 'buy', 100, 12), order('s1', 'sell', 100, 10), order('s2', 'sell', 50, 11)];
    expect(clear(orders)).toMatchObject({ price: 10, volume: 100, decidedBy: 'imbalance' });
  });

  it('uses market pressure: buy surplus → highest price, sell surplus → lowest price', () => {
    const buyPressure = [order('b1', 'buy', 200, 12), order('s1', 'sell', 100, 10)];
    expect(clear(buyPressure)).toMatchObject({ price: 12, volume: 100, decidedBy: 'pressure' });
    const sellPressure = [order('b1', 'buy', 100, 12), order('s1', 'sell', 200, 10)];
    expect(clear(sellPressure)).toMatchObject({ price: 10, volume: 100, decidedBy: 'pressure' });
  });

  it('falls back to the price closest to the reference price, then to the lowest price', () => {
    const balanced = [order('b1', 'buy', 100, 12), order('s1', 'sell', 100, 10)];
    expect(clear(balanced, 11.9)).toMatchObject({ price: 12, decidedBy: 'reference' });
    expect(clear(balanced, 10.2)).toMatchObject({ price: 10, decidedBy: 'reference' });
    expect(clear(balanced, 11)).toMatchObject({ price: 10, decidedBy: 'lowest' });
    expect(clear(balanced)).toMatchObject({ price: 10, decidedBy: 'lowest' });
  });

  it('reports no trade when every buyer bids below every seller', () => {
    const result = clear([order('b1', 'buy', 100, 9), order('s1', 'sell', 100, 10)]);
    expect(result).toMatchObject({ price: null, volume: 0, decidedBy: null });
    expect(result.fills.every((fill) => fill.filled === 0)).toBe(true);
  });

  it('handles an empty order book and one-sided books', () => {
    expect(clear([])).toMatchObject({ price: null, volume: 0, levels: [], fills: [] });
    expect(clear([order('b1', 'buy', 10, 5)])).toMatchObject({ price: null, volume: 0 });
  });
});

describe('clearCallAuction: allocation by price, then time priority', () => {
  it('fills better-priced orders first and earlier orders at the same price', () => {
    // Arrange
    const orders = [
      order('b-early', 'buy', 100, 50),
      order('b-best', 'buy', 100, 52),
      order('b-late', 'buy', 100, 50),
      order('b-low', 'buy', 100, 48),
      order('s1', 'sell', 250, 49),
    ];

    // Act
    const result = clear(orders);

    // Assert
    expect(result.price).toBe(50);
    expect(result.volume).toBe(250);
    expect(result.fills).toEqual([
      { orderId: 'b-early', participantId: 'b-early', side: 'buy', filled: 100, remaining: 0 },
      { orderId: 'b-best', participantId: 'b-best', side: 'buy', filled: 100, remaining: 0 },
      { orderId: 'b-late', participantId: 'b-late', side: 'buy', filled: 50, remaining: 50 },
      { orderId: 'b-low', participantId: 'b-low', side: 'buy', filled: 0, remaining: 100 },
      { orderId: 's1', participantId: 's1', side: 'sell', filled: 250, remaining: 0 },
    ]);
  });

  it('does not mutate the order list', () => {
    const orders = Object.freeze([order('b', 'buy', 10, 5), order('s', 'sell', 10, 5)]);
    expect(() => clear(orders)).not.toThrow();
  });
});

describe('clearCallAuction: validation', () => {
  it.each([
    [[order('x', 'buy', 0, 10)], 'invalid-order'],
    [[order('x', 'buy', 1.5, 10)], 'invalid-order'],
    [[order('x', 'sell', 10, -1)], 'invalid-order'],
    [[order('x', 'sell', 10, Number.NaN)], 'invalid-order'],
    [[{ ...order('x', 'sell', 10, 10), side: 'hold' as 'sell' }], 'invalid-order'],
    [[order('', 'sell', 10, 10)], 'invalid-order'],
    [[order('x', 'buy', 10, 10), order('x', 'sell', 10, 10)], 'duplicate-order'],
  ])('rejects %o as %s with a Ukrainian message', (orders, code) => {
    const result = clearCallAuction(orders);
    expect(result).toMatchObject({ ok: false, error: { code } });
    if (!result.ok) expect(result.error.message).toMatch(/[а-яіїєґ]/i);
  });
});
