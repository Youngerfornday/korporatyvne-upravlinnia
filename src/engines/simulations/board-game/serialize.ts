import { z } from 'zod';
import { err, ok, type Result } from '../../shared/result';
import { chooseOption, startBoardGame, type GameState } from './engine';
import type { BoardGame } from './types';

/**
 * Серіалізація стану кейс-гри: зберігаємо лише ID гри й послідовність вибраних варіантів.
 * Метрики й поточний вузол відтворюються повторним проходженням — підробити їх у збереженому рядку неможливо,
 * а зміна графа гри одразу виявляється як 'invalid-path'.
 */
export const MAX_SERIALIZED_GAME_LENGTH = 4000;
const MAX_CHOICES = 100;

const SavedGameSchema = z.object({
  v: z.literal(1),
  gameId: z.string().max(64),
  choices: z
    .array(
      z
        .string()
        .max(64)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    )
    .max(MAX_CHOICES),
});

export type RestoreErrorCode = 'too-large' | 'invalid-json' | 'invalid-format' | 'wrong-game' | 'invalid-path' | 'invalid-graph';

export interface RestoreError {
  readonly code: RestoreErrorCode;
  readonly message: string;
}

const MESSAGES: Readonly<Record<RestoreErrorCode, string>> = {
  'too-large': 'Збережений стан гри задовгий.',
  'invalid-json': 'Збережений стан гри пошкоджений.',
  'invalid-format': 'Збережений стан гри має невідомий формат.',
  'wrong-game': 'Збережений стан належить іншій грі.',
  'invalid-path': 'Збережені рішення не відповідають поточній версії гри — почніть заново.',
  'invalid-graph': 'Граф кейс-гри містить помилки.',
};

function restoreError(code: RestoreErrorCode): { readonly ok: false; readonly error: RestoreError } {
  return err({ code, message: MESSAGES[code] });
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify({ v: 1, gameId: state.gameId, choices: state.path.map((step) => step.optionId) });
}

export function restoreGameState(game: BoardGame, raw: string): Result<GameState, RestoreError> {
  if (raw.length > MAX_SERIALIZED_GAME_LENGTH) return restoreError('too-large');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    // Пошкоджений рядок зі сховища — очікувана ситуація, а не збій програми.
    return restoreError('invalid-json');
  }
  const parsed = SavedGameSchema.safeParse(data);
  if (!parsed.success) return restoreError('invalid-format');
  if (parsed.data.gameId !== game.id) return restoreError('wrong-game');

  const started = startBoardGame(game);
  if (!started.ok) return restoreError('invalid-graph');
  let state = started.value;
  for (const optionId of parsed.data.choices) {
    const step = chooseOption(game, state, optionId);
    if (!step.ok) return restoreError('invalid-path');
    state = step.value.state;
  }
  return ok(state);
}
