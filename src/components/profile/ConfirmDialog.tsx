/** Підтвердження незворотної дії: нативний <dialog> (пастка фокуса, Esc, inert для решти сторінки). */
import { useEffect, useRef } from 'react';

interface Props {
  readonly open: boolean;
  readonly title: string;
  readonly text: string;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({ open, title, text, confirmLabel, danger = false, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="confirm" aria-labelledby="confirm-title" aria-describedby="confirm-text" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id="confirm-title" className="h3">
        {title}
      </h2>
      <p id="confirm-text" className="muted small">
        {text}
      </p>
      <div className="confirm-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} data-confirm-cancel>
          Скасувати
        </button>
        <button type="button" className={danger ? 'btn btn-primary btn-danger' : 'btn btn-primary'} onClick={onConfirm} data-confirm-ok>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
