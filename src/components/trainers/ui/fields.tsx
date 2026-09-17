/** Поля тренажерів: число з підказкою про кому, «Так / Ні», вибір зі списку. Помилка — біля поля, зі знаком. */
import type { ReactNode } from 'react';
import { Icon } from '../../quiz/Icon';
import type { YesNo } from '../model/task-check';

interface FieldErrorProps {
  readonly id: string;
  readonly message: string | undefined;
}

export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className="field-error" id={id} data-field-error>
      <Icon name="alert" className="icon icon-sm" />
      <span>{message}</span>
    </p>
  );
}

function describedBy(...ids: readonly (string | false | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => typeof id === 'string' && id !== '');
  return present.length > 0 ? present.join(' ') : undefined;
}

export interface NumberFieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly suffix?: string | undefined;
  readonly placeholder?: string | undefined;
}

export function NumberField({ id, name, label, value, onChange, error, hint, suffix, placeholder }: NumberFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  return (
    <div className="field tfield" data-field={name}>
      <label htmlFor={id}>{label}</label>
      <div className="tfield-control">
        <input
          id={id}
          name={name}
          className="input num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(hintId, error && errorId)}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && (
          <span className="tfield-suffix" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p className="tfield-hint" id={hintId}>
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export interface YesNoFieldProps {
  readonly id: string;
  readonly name: string;
  readonly legend: ReactNode;
  readonly value: YesNo;
  readonly onChange: (value: YesNo) => void;
  readonly error?: string | undefined;
  readonly disabled?: boolean;
}

export function YesNoField({ id, name, legend, value, onChange, error, disabled = false }: YesNoFieldProps) {
  const errorId = `${id}-error`;
  const options: readonly { readonly value: Exclude<YesNo, ''>; readonly label: string }[] = [
    { value: 'yes', label: 'Так' },
    { value: 'no', label: 'Ні' },
  ];
  return (
    <fieldset className="tfield yesno" data-field={name} aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}>
      <legend>{legend}</legend>
      <div className="yesno-options">
        {options.map((option) => (
          <label key={option.value} className="yesno-option" data-checked={value === option.value ? '' : undefined}>
            <input
              type="radio"
              name={`${id}-choice`}
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

export interface SelectFieldProps<V extends string> {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: V;
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly onChange: (value: V) => void;
  readonly hint?: string | undefined;
}

export function SelectField<V extends string>({ id, name, label, value, options, onChange, hint }: SelectFieldProps<V>) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field tfield" data-field={name}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={name}
        className="select"
        value={value}
        aria-describedby={hintId}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) onChange(next.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p className="tfield-hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Фокус на перше поле з помилкою після невдалої перевірки (id поля = `${prefix}-${field}`). */
export function focusFirstInvalid(prefix: string, fields: readonly string[]): void {
  const first = fields[0];
  if (!first) return;
  requestAnimationFrame(() => {
    const target = document.getElementById(`${prefix}-${first}`) ?? document.querySelector<HTMLElement>(`[data-field="${first}"] input`);
    target?.focus();
  });
}

export interface RadioGroupOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

export interface RadioGroupFieldProps<V extends string> {
  readonly id: string;
  readonly name: string;
  readonly legend: ReactNode;
  readonly value: V | '';
  readonly options: readonly RadioGroupOption<V>[];
  readonly onChange: (value: V) => void;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
}

/** Група радіокнопок з тією самою розміткою, що й «Так / Ні»: стрілки й Tab працюють як у нативній групі. */
export function RadioGroupField<V extends string>({ id, name, legend, value, options, onChange, hint, error }: RadioGroupFieldProps<V>) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = `${id}-error`;
  return (
    <fieldset className="tfield yesno" id={id} data-field={name} aria-describedby={describedBy(hintId, error && errorId)} aria-invalid={error ? true : undefined}>
      <legend>{legend}</legend>
      <div className="yesno-options">
        {options.map((option) => (
          <label key={option.value} className="yesno-option" data-checked={value === option.value ? '' : undefined}>
            <input type="radio" name={`${id}-choice`} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {hint && (
        <p className="tfield-hint" id={hintId}>
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
