import { pluralUk } from '../../../lib/plural';
import { formatMoney, roundTo } from '../../shared/number-format';
import { err, ok, type Result } from '../../shared/result';
import { clearCallAuction, validateOrder, type AuctionOrder, type ClearingResult } from './clearing';

/**
 * Раунди ділової гри «Фондова біржа»: збір заявок → аукціон → розрахунки → наступний раунд.
 * Стан — незмінні дані; кожна дія повертає новий стан або типізовану помилку.
 */
export interface AuctionParticipant {
  readonly id: string;
  readonly name: string;
  readonly cash: number;
  readonly shares: number;
}

export interface AuctionGameConfig {
  readonly id: string;
  readonly security: string;
  readonly rounds: number;
  readonly referencePrice: number;
  readonly participants: readonly AuctionParticipant[];
}

export interface Portfolio {
  readonly participantId: string;
  readonly cash: number;
  readonly shares: number;
}

export interface RoundRecord {
  readonly round: number;
  readonly orders: readonly AuctionOrder[];
  readonly clearing: ClearingResult;
}

export interface AuctionGameState {
  readonly gameId: string;
  readonly round: number;
  readonly totalRounds: number;
  readonly phase: 'collecting' | 'cleared' | 'finished';
  readonly referencePrice: number;
  readonly orders: readonly AuctionOrder[];
  readonly portfolios: readonly Portfolio[];
  readonly history: readonly RoundRecord[];
}

export type AuctionGameErrorCode =
  | 'invalid-config'
  | 'wrong-phase'
  | 'unknown-participant'
  | 'unknown-order'
  | 'duplicate-order'
  | 'invalid-order'
  | 'insufficient-cash'
  | 'insufficient-shares';

export interface AuctionGameError {
  readonly code: AuctionGameErrorCode;
  readonly message: string;
}

const MESSAGES: Readonly<Record<AuctionGameErrorCode, string>> = {
  'invalid-config': 'Налаштування гри некоректні: потрібні раунди, додатна стартова ціна й учасники з невід’ємними рахунками.',
  'wrong-phase': 'Зараз ця дія недоступна: спершу завершіть поточний етап раунду.',
  'unknown-participant': 'Такого учасника торгів немає.',
  'unknown-order': 'Такої заявки немає.',
  'duplicate-order': 'Заявку з таким номером уже подано.',
  'invalid-order': 'Заявка має містити напрям, цілу додатну кількість акцій і додатну ціну.',
  'insufficient-cash': 'Недостатньо коштів: сума всіх заявок на купівлю перевищує залишок на рахунку.',
  'insufficient-shares': 'Недостатньо акцій: сума всіх заявок на продаж перевищує пакет учасника.',
};

function gameError(code: AuctionGameErrorCode): { readonly ok: false; readonly error: AuctionGameError } {
  return err({ code, message: MESSAGES[code] });
}

function configIsValid(config: AuctionGameConfig): boolean {
  const ids = config.participants.map((participant) => participant.id);
  return (
    Number.isInteger(config.rounds) &&
    config.rounds > 0 &&
    Number.isFinite(config.referencePrice) &&
    config.referencePrice > 0 &&
    config.participants.length > 0 &&
    new Set(ids).size === ids.length &&
    config.participants.every(
      (participant) =>
        participant.id.trim() !== '' &&
        Number.isFinite(participant.cash) &&
        participant.cash >= 0 &&
        Number.isInteger(participant.shares) &&
        participant.shares >= 0,
    )
  );
}

export function startAuctionGame(config: AuctionGameConfig): Result<AuctionGameState, AuctionGameError> {
  if (!configIsValid(config)) return gameError('invalid-config');
  return ok({
    gameId: config.id,
    round: 1,
    totalRounds: config.rounds,
    phase: 'collecting',
    referencePrice: config.referencePrice,
    orders: [],
    portfolios: config.participants.map(({ id, cash, shares }) => ({ participantId: id, cash, shares })),
    history: [],
  });
}

function reservedBy(orders: readonly AuctionOrder[], participantId: string) {
  const own = orders.filter((order) => order.participantId === participantId);
  return {
    cash: own.filter((order) => order.side === 'buy').reduce((acc, order) => acc + order.quantity * order.limitPrice, 0),
    shares: own.filter((order) => order.side === 'sell').reduce((acc, order) => acc + order.quantity, 0),
  };
}

export function submitOrder(state: AuctionGameState, order: AuctionOrder): Result<AuctionGameState, AuctionGameError> {
  if (state.phase !== 'collecting') return gameError('wrong-phase');
  if (validateOrder(order)) return gameError('invalid-order');
  const portfolio = state.portfolios.find((candidate) => candidate.participantId === order.participantId);
  if (!portfolio) return gameError('unknown-participant');
  if (state.orders.some((existing) => existing.id === order.id)) return gameError('duplicate-order');

  const orders = [...state.orders, order];
  const reserved = reservedBy(orders, order.participantId);
  if (reserved.cash > portfolio.cash) return gameError('insufficient-cash');
  if (reserved.shares > portfolio.shares) return gameError('insufficient-shares');
  return ok({ ...state, orders });
}

export function withdrawOrder(state: AuctionGameState, orderId: string): Result<AuctionGameState, AuctionGameError> {
  if (state.phase !== 'collecting') return gameError('wrong-phase');
  if (!state.orders.some((order) => order.id === orderId)) return gameError('unknown-order');
  return ok({ ...state, orders: state.orders.filter((order) => order.id !== orderId) });
}

function settle(portfolios: readonly Portfolio[], clearing: ClearingResult): Portfolio[] {
  const price = clearing.price ?? 0;
  return portfolios.map((portfolio) => {
    const own = clearing.fills.filter((fill) => fill.participantId === portfolio.participantId);
    const bought = own.filter((fill) => fill.side === 'buy').reduce((acc, fill) => acc + fill.filled, 0);
    const sold = own.filter((fill) => fill.side === 'sell').reduce((acc, fill) => acc + fill.filled, 0);
    return { ...portfolio, cash: roundTo(portfolio.cash + (sold - bought) * price, 2), shares: portfolio.shares + bought - sold };
  });
}

export function clearRound(state: AuctionGameState): Result<AuctionGameState, AuctionGameError> {
  if (state.phase !== 'collecting') return gameError('wrong-phase');
  const clearing = clearCallAuction(state.orders, { referencePrice: state.referencePrice });
  // Заявки перевірено під час подання, тож помилка тут неможлива; захист від зміненого ззовні стану.
  if (!clearing.ok) return gameError('invalid-order');
  return ok({
    ...state,
    phase: 'cleared',
    referencePrice: clearing.value.price ?? state.referencePrice,
    portfolios: settle(state.portfolios, clearing.value),
    history: [...state.history, { round: state.round, orders: state.orders, clearing: clearing.value }],
  });
}

export function nextRound(state: AuctionGameState): Result<AuctionGameState, AuctionGameError> {
  if (state.phase !== 'cleared') return gameError('wrong-phase');
  if (state.round >= state.totalRounds) return ok({ ...state, phase: 'finished', orders: [] });
  return ok({ ...state, round: state.round + 1, phase: 'collecting', orders: [] });
}

const SHARE_FORMS = { one: 'акцію', few: 'акції', many: 'акцій', other: 'акції' } as const;

/** Підсумок раунду для `aria-live`. */
export function roundSummaryText(record: RoundRecord): string {
  const { price, volume } = record.clearing;
  if (price === null || volume === 0) {
    return `Раунд ${record.round}: угод не укладено — жодна ціна покупця не досягла ціни продавця.`;
  }
  return `Раунд ${record.round}: ціна ${formatMoney(price)}, укладено угод на ${pluralUk(volume, SHARE_FORMS)}.`;
}
