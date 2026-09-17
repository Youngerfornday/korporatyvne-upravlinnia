/**
 * Вид кабінету (Викладач / Студент) — у localStorage `ku:v1:view`; представлення (картки, таблиця, матриця) —
 * у параметрі адреси `?vid=`, щоб посиланням можна було поділитися. Сервер рендерить типовий стан,
 * після гідрації острів читає збережений.
 */
import { useCallback, useEffect, useState } from 'react';
import { VIEW_STORAGE_KEY } from '../../lib/site-nav';
import type { Audience } from './types';

export type Presentation = 'kartky' | 'tablytsia' | 'matrytsia';
export const PRESENTATIONS: readonly Presentation[] = ['kartky', 'tablytsia', 'matrytsia'];
export const DEFAULT_PRESENTATION: Presentation = 'tablytsia';
export const PRESENTATION_PARAM = 'vid';
const DEFAULT_AUDIENCE: Audience = 'teacher';

export function parsePresentation(value: string | null): Presentation {
  return PRESENTATIONS.find((presentation) => presentation === value) ?? DEFAULT_PRESENTATION;
}

function readAudience(): Audience {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === 'student' || stored === 'teacher' ? stored : DEFAULT_AUDIENCE;
  } catch {
    return DEFAULT_AUDIENCE;
  }
}

function writeAudience(audience: Audience): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, audience);
  } catch {
    // Сховище недоступне (приватний режим): вид живе до перезавантаження сторінки.
  }
}

function writePresentation(presentation: Presentation): void {
  const address = new URL(window.location.href);
  if (presentation === DEFAULT_PRESENTATION) address.searchParams.delete(PRESENTATION_PARAM);
  else address.searchParams.set(PRESENTATION_PARAM, presentation);
  window.history.replaceState(window.history.state, '', address);
}

export interface CabinetView {
  readonly hydrated: boolean;
  readonly audience: Audience;
  readonly presentation: Presentation;
  readonly setAudience: (audience: Audience) => void;
  readonly setPresentation: (presentation: Presentation) => void;
}

export function useCabinetView(): CabinetView {
  const [hydrated, setHydrated] = useState(false);
  const [audience, setAudienceState] = useState<Audience>(DEFAULT_AUDIENCE);
  const [presentation, setPresentationState] = useState<Presentation>(DEFAULT_PRESENTATION);

  useEffect(() => {
    setAudienceState(readAudience());
    setPresentationState(parsePresentation(new URLSearchParams(window.location.search).get(PRESENTATION_PARAM)));
    setHydrated(true);
  }, []);

  const setAudience = useCallback((next: Audience) => {
    setAudienceState(next);
    writeAudience(next);
  }, []);

  const setPresentation = useCallback((next: Presentation) => {
    setPresentationState(next);
    writePresentation(next);
  }, []);

  return { hydrated, audience, presentation, setAudience, setPresentation };
}
