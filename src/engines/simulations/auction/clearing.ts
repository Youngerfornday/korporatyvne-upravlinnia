import { err, ok, type Result } from '../../shared/result';

/**
 * Аукціон заявок (ділова гра «Фондова біржа»): одна ціна для всіх угод раунду.
 * Кандидати — ціни всіх лімітних заявок. Для кожної: попит = заявки на купівлю з лімітом ≥ ціни,
 * пропозиція = заявки на продаж з лімітом ≤ ціни, обсяг угод = min(попит, пропозиція).
 * Правило вибору ціни (як в аукціонах відкриття бірж):
 * 1) найбільший обсяг угод; 2) найменший дисбаланс |попит − пропозиція|;
 * 3) тиск ринку: якщо в усіх кандидатів переважає попит — найвища ціна, пропозиція — найнижча;
 * 4) найближча до ціни попереднього раунду (референтної); 5) найнижча з решти.
 * Виконання: пріоритет ціни (краща ціна раніше), далі часу (порядок подання заявок).
 */
export type OrderSide = 'buy' | 'sell';

export interface AuctionOrder {
  readonly id: string;
  readonly participantId: string;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly limitPrice: number;
}

export interface PriceLevel {
  readonly price: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly executable: number;
  /** Попит мінус пропозиція. */
  readonly imbalance: number;
}

export interface Fill {
  readonly orderId: string;
  readonly participantId: string;
  readonly side: OrderSide;
  readonly filled: number;
  readonly remaining: number;
}

export type PriceRule = 'volume' | 'imbalance' | 'pressure' | 'reference' | 'lowest';

export interface ClearingResult {
  readonly price: number | null;
  readonly volume: number;
  readonly levels: readonly PriceLevel[];
  /** Крок правила, яким визначено ціну; null — угод немає. */
  readonly decidedBy: PriceRule | null;
  readonly fills: readonly Fill[];
}

export interface ClearingOptions {
  readonly referencePrice?: number;
}

export type AuctionErrorCode = 'invalid-order' | 'duplicate-order';

export interface AuctionError {
  readonly code: AuctionErrorCode;
  readonly orderId: string;
  readonly message: string;
}

export function validateOrder(order: AuctionOrder): AuctionError | null {
  const valid =
    order.id.trim() !== '' &&
    (order.side === 'buy' || order.side === 'sell') &&
    Number.isInteger(order.quantity) &&
    order.quantity > 0 &&
    Number.isFinite(order.limitPrice) &&
    order.limitPrice > 0;
  return valid
    ? null
    : { code: 'invalid-order', orderId: order.id, message: 'Заявка має містити напрям, цілу додатну кількість акцій і додатну ціну.' };
}

function buildLevels(orders: readonly AuctionOrder[]): PriceLevel[] {
  const prices = [...new Set(orders.map((order) => order.limitPrice))].sort((a, b) => a - b);
  return prices.map((price) => {
    const buyVolume = orders.filter((order) => order.side === 'buy' && order.limitPrice >= price).reduce((acc, order) => acc + order.quantity, 0);
    const sellVolume = orders.filter((order) => order.side === 'sell' && order.limitPrice <= price).reduce((acc, order) => acc + order.quantity, 0);
    return { price, buyVolume, sellVolume, executable: Math.min(buyVolume, sellVolume), imbalance: buyVolume - sellVolume };
  });
}

function keepBest(levels: readonly PriceLevel[], score: (level: PriceLevel) => number): PriceLevel[] {
  const best = Math.min(...levels.map(score));
  return levels.filter((level) => score(level) === best);
}

function choosePrice(levels: readonly PriceLevel[], referencePrice: number | undefined): { level: PriceLevel; rule: PriceRule } | null {
  const maxVolume = Math.max(0, ...levels.map((level) => level.executable));
  if (maxVolume === 0) return null;

  const byVolume = levels.filter((level) => level.executable === maxVolume);
  if (byVolume.length === 1) return { level: byVolume[0] as PriceLevel, rule: 'volume' };

  const byImbalance = keepBest(byVolume, (level) => Math.abs(level.imbalance));
  if (byImbalance.length === 1) return { level: byImbalance[0] as PriceLevel, rule: 'imbalance' };

  if (byImbalance.every((level) => level.imbalance > 0)) return { level: byImbalance.at(-1) as PriceLevel, rule: 'pressure' };
  if (byImbalance.every((level) => level.imbalance < 0)) return { level: byImbalance[0] as PriceLevel, rule: 'pressure' };

  if (referencePrice !== undefined) {
    const byReference = keepBest(byImbalance, (level) => Math.abs(level.price - referencePrice));
    if (byReference.length === 1) return { level: byReference[0] as PriceLevel, rule: 'reference' };
    return { level: byReference[0] as PriceLevel, rule: 'lowest' };
  }
  return { level: byImbalance[0] as PriceLevel, rule: 'lowest' };
}

function allocate(orders: readonly AuctionOrder[], price: number, volume: number): Map<string, number> {
  const fills = new Map<string, number>();
  const indexed = orders.map((order, index) => ({ order, index }));
  const fillSide = (side: OrderSide) => {
    const eligible = indexed
      .filter(({ order }) => order.side === side && (side === 'buy' ? order.limitPrice >= price : order.limitPrice <= price))
      .sort((a, b) => (side === 'buy' ? b.order.limitPrice - a.order.limitPrice : a.order.limitPrice - b.order.limitPrice) || a.index - b.index);
    let left = volume;
    for (const { order } of eligible) {
      const filled = Math.min(order.quantity, left);
      fills.set(order.id, filled);
      left -= filled;
    }
  };
  fillSide('buy');
  fillSide('sell');
  return fills;
}

export function clearCallAuction(orders: readonly AuctionOrder[], options: ClearingOptions = {}): Result<ClearingResult, AuctionError> {
  const seen = new Set<string>();
  for (const order of orders) {
    const problem = validateOrder(order);
    if (problem) return err(problem);
    if (seen.has(order.id)) return err({ code: 'duplicate-order', orderId: order.id, message: `Заявку з номером «${order.id}» подано двічі.` });
    seen.add(order.id);
  }

  const levels = buildLevels(orders);
  const chosen = choosePrice(levels, options.referencePrice);
  const fills = chosen ? allocate(orders, chosen.level.price, chosen.level.executable) : new Map<string, number>();
  return ok({
    price: chosen?.level.price ?? null,
    volume: chosen?.level.executable ?? 0,
    levels,
    decidedBy: chosen?.rule ?? null,
    fills: orders.map((order) => {
      const filled = fills.get(order.id) ?? 0;
      return { orderId: order.id, participantId: order.participantId, side: order.side, filled, remaining: order.quantity - filled };
    }),
  });
}
