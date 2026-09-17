/** Спільні блоки тренажерів: покроковий розбір, вердикт зі знаком, норми з датою перевірки, перевірка задачі. */
import type { ReactNode } from 'react';
import { formatDate } from '../../../lib/course-data-pure';
import { Icon } from '../../quiz/Icon';
import type { NormRef } from '../norms';
import type { TaskCheck } from '../model/task-check';

export function Steps({ title, steps, name }: { readonly title: string; readonly steps: readonly string[]; readonly name: string }) {
  if (steps.length === 0) return null;
  return (
    <div className="steps" data-steps={name}>
      <h4 className="steps-title">{title}</h4>
      <ol className="steps-list">
        {steps.map((step, index) => (
          <li key={index} className="num">
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface VerdictProps {
  readonly ok: boolean;
  readonly title: string;
  readonly children?: ReactNode;
  readonly name?: string;
}

/** Вердикт: знак (чек / хрест) з підписом + текст — стан не лише кольором. */
export function Verdict({ ok, title, children, name }: VerdictProps) {
  return (
    <div className={`tverdict ${ok ? 'is-ok' : 'is-err'}`} data-verdict={name} data-state={ok ? 'ok' : 'err'}>
      <Icon name={ok ? 'check' : 'x'} className="icon" />
      <div>
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  );
}

export interface NormItem {
  readonly norm: NormRef;
  /** Значення з рушія, якщо норма задає число: «більше 50 % голосуючих акцій». */
  readonly value?: string;
}

export function NormNotes({ items, note }: { readonly items: readonly NormItem[]; readonly note?: string }) {
  return (
    <aside className="tnorms" aria-label="Норми, за якими рахує тренажер">
      <h4 className="steps-title">Норми за замовчуванням</h4>
      <ul>
        {items.map(({ norm, value }) => (
          <li key={`${norm.code}-${norm.article}`}>
            <Icon name="scale" className="icon icon-sm" />
            <span>
              {value && <b>{value}. </b>}
              {norm.summary}{' '}
              <span className="tnorm-src">
                <a href={norm.url} target="_blank" rel="noopener noreferrer">
                  {norm.article} {norm.law}
                  <Icon name="external" className="icon icon-sm" label="відкривається в новій вкладці" />
                </a>
                <span className="verified">
                  <Icon name="check" className="icon icon-sm" />
                  перевірено {formatDate(norm.checkedAt)}
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="tnorm-note">{note}</p>}
    </aside>
  );
}

export function CheckParts({ check }: { readonly check: TaskCheck }) {
  return (
    <ul className="tparts" aria-label="Перевірка за частинами">
      {check.parts.map((part) => (
        <li key={part.id} data-part={part.id} data-state={part.correct ? 'ok' : 'err'}>
          <Icon name={part.correct ? 'check' : 'x'} className="icon icon-sm" label={part.correct ? 'правильно' : 'неправильно'} />
          <span>
            <span className="tpart-label">{part.label}</span> <b className="num">{part.given}</b>
            {!part.correct && (
              <span className="tpart-expected">
                {' '}
                — правильно: <b className="num">{part.expected}</b>
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Значення у фабулі задачі: сире число в data-атрибуті, щоб E2E і скрінрідер читали те саме. */
export function TaskValue({ name, raw, children }: { readonly name: string; readonly raw: number; readonly children: ReactNode }) {
  return (
    <b className="num tvalue" data-task-value={name} data-raw={raw}>
      {children}
    </b>
  );
}

/**
 * Посилання на норму поруч із поясненням: стаття (з кодом рядка legal-baseline у дужках, якщо його там
 * записано), акт і дата перевірки. Код додається окремо лише тоді, коли його немає в самій статті.
 */
export function NormRefLink({ norm }: { readonly norm: NormRef }) {
  const article = norm.article.includes(`(${norm.code})`) ? norm.article : `${norm.article} (${norm.code})`;
  return (
    <span className="tnorm-src" data-norm={norm.code}>
      <a href={norm.url} target="_blank" rel="noopener noreferrer">
        {article} {norm.law}
        <Icon name="external" className="icon icon-sm" label="відкривається в новій вкладці" />
      </a>
      <span className="verified">
        <Icon name="check" className="icon icon-sm" />
        перевірено {formatDate(norm.checkedAt)}
      </span>
    </span>
  );
}
