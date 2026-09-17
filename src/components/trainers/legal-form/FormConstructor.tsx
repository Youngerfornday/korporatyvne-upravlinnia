/**
 * Режим «Конструктор»: параметри стартапу → форми, що лишаються, і норма, яка закриває решту.
 * Навчальний режим без XP: вердикт рахує рушій `engines/legal-form`, острів лише показує його.
 */
import { useMemo, useState } from 'react';
import {
  FORM_STATUS_LABELS,
  choiceSummaryText,
  defaultProfile,
  evaluateForms,
  summarizeChoice,
  type ChoiceDefinition,
  type FormStatus,
  type FormVerdict,
  type StartupProfile,
} from '../../../engines/legal-form';
import { Icon } from '../../quiz/Icon';
import type { NormRef } from '../norms';
import { RadioGroupField } from '../ui/fields';
import { NormRefLink } from '../ui/parts';

export interface StartupPreset {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly preset: StartupProfile;
}

export interface FormConstructorProps {
  readonly prefix: string;
  readonly definition: ChoiceDefinition;
  readonly norms: Readonly<Record<string, NormRef>>;
  readonly presets: readonly StartupPreset[];
}

const STATUS_ORDER: Readonly<Record<FormStatus, number>> = { fits: 0, costly: 1, blocked: 2 };
const STATUS_ICON: Readonly<Record<FormStatus, string>> = { fits: 'check', costly: 'alert', blocked: 'x' };
const EFFECT_ICON = { blocks: 'x', burden: 'alert', fits: 'check' } as const;
const EFFECT_LABELS = { blocks: 'закриває форму', burden: 'здорожчує', fits: 'підтверджує вибір' } as const;

function FormCard({ verdict, title, short, summary, norms }: { readonly verdict: FormVerdict; readonly title: string; readonly short: string; readonly summary: string; readonly norms: Readonly<Record<string, NormRef>> }) {
  return (
    <article className="card lfcard" data-form={verdict.formId} data-status={verdict.status} aria-labelledby={`lf-${verdict.formId}-title`}>
      <h4 className="lfcard-head" id={`lf-${verdict.formId}-title`}>
        <Icon name={STATUS_ICON[verdict.status]} className="icon" />
        <span>{title}</span>
        <span className="chip" data-form-status={verdict.status}>
          {FORM_STATUS_LABELS[verdict.status]}
        </span>
      </h4>
      <p className="faint small">
        {short}. {summary}
      </p>
      {verdict.reasons.length === 0 ? (
        <p className="small muted">Жоден із ваших параметрів цю форму не обмежує.</p>
      ) : (
        <ul className="lfreasons" aria-label={`Наслідки для форми «${short}»`}>
          {verdict.reasons.map((reason) => {
            const norm = norms[reason.norm];
            return (
              <li key={`${reason.criterion}-${reason.option}`} data-effect={reason.effect}>
                <Icon name={EFFECT_ICON[reason.effect]} className="icon icon-sm" label={EFFECT_LABELS[reason.effect]} />
                <span>
                  <b className="lfreason-key">
                    {reason.criterionTitle}: {reason.optionLabel}
                  </b>{' '}
                  {reason.reason} {norm && <NormRefLink norm={norm} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export function FormConstructor({ prefix, definition, norms, presets }: FormConstructorProps) {
  const [profile, setProfile] = useState<StartupProfile>(() => defaultProfile(definition.criteria));
  const [preset, setPreset] = useState<string | null>(null);

  const verdicts = useMemo(() => {
    const result = evaluateForms(definition, profile);
    return result.ok ? result.value : [];
  }, [definition, profile]);

  const titleOf = (formId: string) => definition.forms.find((form) => form.id === formId)?.short ?? formId;
  const summary = summarizeChoice(verdicts);
  const ordered = [...verdicts].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const formOf = (formId: string) => definition.forms.find((form) => form.id === formId);

  const choose = (criterion: string, option: string) => {
    setProfile((previous) => ({ ...previous, [criterion]: option }));
    setPreset(null);
  };

  return (
    <div className="lfconstructor" data-constructor>
      <form className="tform card" onSubmit={(event) => event.preventDefault()} noValidate data-constructor-form>
        <fieldset className="lfpresets">
          <legend>Готові набори параметрів</legend>
          <p className="tfield-hint">Підставте параметри стартапу із завдання або складіть свій набір нижче.</p>
          <div className="lfpreset-buttons">
            {presets.map((item) => (
              <button
                key={item.id}
                type="button"
                className={preset === item.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                aria-pressed={preset === item.id}
                data-preset={item.id}
                onClick={() => {
                  setProfile(item.preset);
                  setPreset(item.id);
                }}
              >
                {item.title}
              </button>
            ))}
          </div>
        </fieldset>
        {definition.criteria.map((criterion) => (
          <RadioGroupField
            key={criterion.id}
            id={`${prefix}-criterion-${criterion.id}`}
            name={criterion.id}
            legend={criterion.question}
            value={profile[criterion.id] ?? ''}
            options={criterion.options.map((option) => ({ value: option.id, label: option.label }))}
            onChange={(option) => choose(criterion.id, option)}
          />
        ))}
      </form>

      <section className="tresult" aria-labelledby={`${prefix}-forms-title`} data-constructor-result>
        <h3 className="visually-hidden" id={`${prefix}-forms-title`}>
          Форми за вашими параметрами
        </h3>
        <p className="lfsummary" role="status" data-constructor-summary>
          {choiceSummaryText(summary, titleOf)}
        </p>
        <div className="lfcards">
          {ordered.map((verdict) => {
            const form = formOf(verdict.formId);
            if (!form) return null;
            return <FormCard key={verdict.formId} verdict={verdict} title={form.title} short={form.short} summary={form.summary} norms={norms} />;
          })}
        </div>
      </section>
    </div>
  );
}
