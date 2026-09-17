/** Каркас режиму «Задача»: фабула варіанта, поля відповіді, перевірка з розбором, XP і новий варіант. */
import { useEffect, useRef, type SubmitEvent, type ReactNode } from 'react';
import { Icon } from '../../quiz/Icon';
import type { FieldIssues, TaskCheck } from '../model/task-check';
import { CheckParts, Steps } from './parts';

export interface TaskShellProps {
  readonly prefix: string;
  readonly number: number;
  readonly fabula: ReactNode;
  readonly fields: ReactNode;
  readonly check: TaskCheck | null;
  readonly solution: readonly string[];
  readonly outcomeText: string | null;
  readonly status: string;
  readonly onSubmit: () => FieldIssues;
  readonly onNext: () => void;
}

export function TaskShell({ prefix, number, fabula, fields, check, solution, outcomeText, status, onSubmit, onNext }: TaskShellProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const verdictRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [number]);

  useEffect(() => {
    if (check) verdictRef.current?.focus();
  }, [check]);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issues = onSubmit();
    const first = issues[0];
    if (first) {
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(`#${prefix}-task [data-field="${first.field}"] input`);
        field?.focus();
      });
    }
  };

  return (
    <div className="ttask" id={`${prefix}-task`} data-task data-variant-number={number}>
      <div className="ttask-head">
        <h3 className="h4" tabIndex={-1} ref={headingRef} data-task-heading>
          Варіант {number}
        </h3>
        <p className="faint small" data-trainer-status>
          {status}
        </p>
      </div>
      <div className="ttask-fabula">{fabula}</div>

      <form className="ttask-form" onSubmit={submit} noValidate>
        <fieldset className="ttask-fields" disabled={check !== null}>
          <legend className="visually-hidden">Ваша відповідь</legend>
          {fields}
        </fieldset>
        <div className="tactions">
          {check === null && (
            <button type="submit" className="btn btn-primary" data-task-check>
              Перевірити
            </button>
          )}
          <button type="button" className={check === null ? 'btn btn-ghost' : 'btn btn-primary'} onClick={onNext} data-task-next>
            Новий варіант <Icon name="arrow-r" />
          </button>
        </div>
      </form>

      {check && (
        <section className={`ttask-result ${check.solved ? 'is-ok' : 'is-err'}`} aria-labelledby={`${prefix}-verdict`} data-task-result data-solved={check.solved}>
          <h4 className="tverdict-title" id={`${prefix}-verdict`} tabIndex={-1} ref={verdictRef}>
            <Icon name={check.solved ? 'check' : 'x'} className="icon" />
            {check.solved ? 'Правильно' : 'Неправильно'}
          </h4>
          <CheckParts check={check} />
          <p className="summary-xp" role="status" data-task-outcome data-solved={check.solved}>
            <Icon name="hex" className="icon summary-hex" />
            {outcomeText}
          </p>
          <Steps title="Розв’язок" steps={solution} name="solution" />
        </section>
      )}
    </div>
  );
}
