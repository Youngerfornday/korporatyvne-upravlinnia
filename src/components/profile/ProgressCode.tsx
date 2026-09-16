/**
 * Перенесення прогресу: експорт коду (з копіюванням), імпорт із валідацією рушія й підтвердженням
 * перед перезаписом, скидання з підтвердженням. Усі повідомлення — українською, з рушія.
 */
import { useState } from 'react';
import { formatXp } from '../../engines/gamification';
import {
  PROGRESS_CODE_ERROR_MESSAGES,
  PROGRESS_CODE_EXPORT_ERROR_MESSAGES,
  exportProgressCode,
  importProgressCode,
  type ProgressState,
} from '../../engines/progress';
import type { ProgressClient } from '../progress/client';
import { Icon } from '../quiz/Icon';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  readonly state: ProgressState;
  readonly client: ProgressClient | null;
}

type Pending = { readonly kind: 'import'; readonly state: ProgressState } | { readonly kind: 'reset' } | null;

function toast(text: string): void {
  document.dispatchEvent(new CustomEvent('ku:toast', { detail: { text } }));
}

async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    fallback.focus();
    fallback.select();
    return document.execCommand('copy');
  }
}

export function ProgressCode({ state, client }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [outputEl, setOutputEl] = useState<HTMLTextAreaElement | null>(null);

  const exported = exportProgressCode(state);
  const code = exported.ok ? exported.code : '';
  const exportError = exported.ok ? null : PROGRESS_CODE_EXPORT_ERROR_MESSAGES[exported.error];

  const startImport = () => {
    setNotice(null);
    const parsed = importProgressCode(input);
    if (!parsed.ok) {
      setError(PROGRESS_CODE_ERROR_MESSAGES[parsed.error]);
      return;
    }
    setError(null);
    setPending({ kind: 'import', state: parsed.state });
  };

  const confirm = () => {
    if (!client || !pending) return;
    if (pending.kind === 'import') {
      const replaced = client.replace(pending.state);
      if (!replaced.ok) {
        setError(replaced.error.message);
      } else {
        setInput('');
        setNotice(`Прогрес відновлено: ${formatXp(replaced.value.xp)}.`);
        toast('Прогрес відновлено з коду');
      }
    } else {
      client.reset();
      setNotice('Прогрес скинуто. Ви знову «Акціонер» із 0 XP.');
      toast('Прогрес скинуто');
    }
    setPending(null);
  };

  const confirmText =
    pending?.kind === 'import'
      ? `Поточний прогрес (${formatXp(state.xp)}) буде замінено на прогрес із коду (${formatXp(pending.state.xp)}). Скасувати це не можна — хіба що збережіть поточний код заздалегідь.`
      : 'XP, позначки тем, результати тестів і бейджі буде видалено з цього браузера. Скасувати це не можна.';

  return (
    <section className="block block-code" aria-labelledby="code-title">
      <h2 className="h2" id="code-title">
        Перенести прогрес
      </h2>
      <p className="note">Прогрес живе у вашому браузері. Щоб продовжити на іншому пристрої, скопіюйте код і вставте його там.</p>
      <div className="code">
        <div className="card card-pad">
          <h3>Експортувати код</h3>
          <p>Код містить лише XP, позначки й бейджі — жодних персональних даних.</p>
          <label className="visually-hidden" htmlFor="code-out">
            Код прогресу
          </label>
          <textarea className="input code-area" id="code-out" readOnly value={code} ref={setOutputEl} rows={4} data-progress-code />
          {exportError && (
            <p className="code-error" role="alert">
              {exportError}
            </p>
          )}
          <div className="btns">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!code}
              onClick={() => void copyText(code, outputEl).then((ok) => toast(ok ? 'Код скопійовано' : 'Не вдалося скопіювати — виділіть код вручну'))}
            >
              <Icon name="copy" />
              Скопіювати
            </button>
          </div>
        </div>
        <div className="card card-pad">
          <h3>Імпортувати код</h3>
          <p>Вставте код з іншого пристрою. Наявний прогрес буде замінено після підтвердження.</p>
          <label className="visually-hidden" htmlFor="code-in">
            Вставте код прогресу
          </label>
          <textarea
            className="input code-area"
            id="code-in"
            placeholder="KUP1.…"
            rows={4}
            value={input}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'code-in-error' : undefined}
            onChange={(event) => {
              setInput(event.target.value);
              setError(null);
            }}
            data-progress-import
          />
          {error && (
            <p className="code-error" id="code-in-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="code-notice" role="status">
              {notice}
            </p>
          )}
          <div className="btns">
            <button type="button" className="btn btn-primary" onClick={startImport} disabled={!client} data-progress-import-btn>
              <Icon name="upload" />
              Імпортувати
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPending({ kind: 'reset' })} disabled={!client} data-progress-reset>
              Скинути прогрес
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'reset' ? 'Скинути прогрес?' : 'Замінити прогрес?'}
        text={confirmText}
        confirmLabel={pending?.kind === 'reset' ? 'Скинути' : 'Замінити'}
        danger={pending?.kind === 'reset'}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
