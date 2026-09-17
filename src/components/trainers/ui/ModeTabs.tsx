/**
 * Перемикач режимів тренажера за патерном ARIA tabs: стрілки ←/→, Home/End, активна вкладка в порядку Tab.
 * Панелі рендерить батько з role="tabpanel" і aria-labelledby={tabId(prefix, mode)}.
 */
import { useRef, type KeyboardEvent } from 'react';

export type TrainerMode = 'calc' | 'task';

const MODES: readonly { readonly id: TrainerMode; readonly label: string }[] = [
  { id: 'calc', label: 'Розрахунок' },
  { id: 'task', label: 'Задача' },
];

export const tabId = (prefix: string, mode: TrainerMode) => `${prefix}-tab-${mode}`;
export const panelId = (prefix: string, mode: TrainerMode) => `${prefix}-panel-${mode}`;

interface Props {
  readonly prefix: string;
  readonly mode: TrainerMode;
  readonly onChange: (mode: TrainerMode) => void;
  readonly label: string;
  /** Власні підписи вкладок, якщо «Розрахунок / Задача» не описують режими тренажера. */
  readonly labels?: Partial<Record<TrainerMode, string>> | undefined;
}

export function ModeTabs({ prefix, mode, onChange, label, labels }: Props) {
  const refs = useRef<Partial<Record<TrainerMode, HTMLButtonElement | null>>>({});

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = MODES.findIndex((item) => item.id === mode);
    const targets: Partial<Record<string, number>> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: MODES.length - 1 };
    const raw = targets[event.key];
    if (raw === undefined) return;
    event.preventDefault();
    const next = MODES[(raw + MODES.length) % MODES.length];
    if (!next) return;
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <div className="seg trainer-tabs" role="tablist" aria-label={label}>
      {MODES.map((item) => (
        <button
          key={item.id}
          ref={(element) => {
            refs.current[item.id] = element;
          }}
          type="button"
          role="tab"
          id={tabId(prefix, item.id)}
          aria-selected={mode === item.id}
          aria-controls={panelId(prefix, item.id)}
          tabIndex={mode === item.id ? 0 : -1}
          data-mode={item.id}
          onClick={() => onChange(item.id)}
          onKeyDown={move}
        >
          {labels?.[item.id] ?? item.label}
        </button>
      ))}
    </div>
  );
}
