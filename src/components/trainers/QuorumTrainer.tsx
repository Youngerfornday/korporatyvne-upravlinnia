/**
 * React-острів «Кворум і голосування» (client:only). Розрахунок — поля з «1,5»-парсером рушія і покроковий
 * розбір; задача — варіант генератора рушія з фабулою за мотивами кейсу «Зоря», XP лише за новий розв’язаний варіант.
 * Без window.location і base-URL: острів можна без змін зібрати в SCORM.
 */
import { useState, type SubmitEvent } from 'react';
import { DEFAULT_MEETING_RULES, type MajorityKind } from '../../engines/calculators';
import { CALCULATOR_TRAINERS } from './catalog';
import { num, sharesText } from './model/format';
import {
  MAJORITY_ISSUES,
  MAJORITY_KINDS,
  QUORUM_TASK_LABELS,
  calculateQuorumForm,
  checkQuorumAnswer,
  createQuorumVariant,
  majorityLabel,
  quorumSolution,
  thresholdText,
  type QuorumAnswer,
  type QuorumCalculation,
  type QuorumForm,
} from './model/quorum';
import { issuesByField, type FieldIssues } from './model/task-check';
import { trainerStatusText } from './model/xp-text';
import { NORMS, type NormRef } from './norms';
import { NumberField, SelectField, YesNoField } from './ui/fields';
import { ModeTabs, panelId, tabId, type TrainerMode } from './ui/ModeTabs';
import { NormNotes, Steps, TaskValue, Verdict } from './ui/parts';
import { TaskShell } from './ui/TaskShell';
import { useTrainerTask } from './ui/use-trainer-task';

const PREFIX = 'quorum';
const TRAINER = CALCULATOR_TRAINERS.find((trainer) => trainer.key === 'quorum');
const ACTIVITY_ID = TRAINER?.activityId ?? 'quorum-calculator';

/** Приклад за замовчуванням — еталонний випадок «рівно половина» (calculators/__fixtures__/reference-cases.ts). */
const INITIAL_FORM: QuorumForm = { votingShares: '10 000', registeredShares: '5 000', votesFor: '3 101', majority: 'simple' };
const EMPTY_ANSWER: QuorumAnswer = { hasQuorum: '', requiredShares: '', requiredVotes: '' };

const MAJORITY_NORMS: Readonly<Record<MajorityKind, NormRef>> = {
  simple: NORMS.simpleMajority,
  qualified: NORMS.qualifiedMajority,
  'preemptive-waiver': NORMS.preemptiveWaiver,
  'significant-transaction-50': NORMS.significantTransaction,
};

const majorityOptions = MAJORITY_KINDS.map((kind) => ({ value: kind, label: capitalize(MAJORITY_ISSUES[kind]) }));

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('uk-UA') + text.slice(1);
}

function computeOrIssues(form: QuorumForm): { readonly result: QuorumCalculation | null; readonly issues: FieldIssues } {
  const computed = calculateQuorumForm(form);
  return computed.ok ? { result: computed.value, issues: [] } : { result: null, issues: computed.error };
}

function CalcPanel() {
  const [form, setForm] = useState<QuorumForm>(INITIAL_FORM);
  const [computed, setComputed] = useState(() => ({ form: INITIAL_FORM, ...computeOrIssues(INITIAL_FORM) }));
  const errors = issuesByField(computed.issues);
  const stale = JSON.stringify(form) !== JSON.stringify(computed.form);
  const result = computed.result;
  const update = (patch: Partial<QuorumForm>) => setForm((previous) => ({ ...previous, ...patch }));

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { form, ...computeOrIssues(form) };
    setComputed(next);
    const first = next.issues[0];
    if (first) requestAnimationFrame(() => document.getElementById(`${PREFIX}-calc-${first.field}`)?.focus());
  };

  return (
    <div className="tcalc">
      <form className="tform card" onSubmit={submit} noValidate data-calc-form>
        <fieldset>
          <legend>Акції і реєстрація</legend>
          <NumberField
            id={`${PREFIX}-calc-votingShares`}
            name="votingShares"
            label="Голосуючі акції, що враховуються в кворумі"
            hint="Без викуплених товариством акцій і акцій юросіб під його контролем."
            value={form.votingShares}
            onChange={(votingShares) => update({ votingShares })}
            error={errors['votingShares']}
          />
          <NumberField
            id={`${PREFIX}-calc-registeredShares`}
            name="registeredShares"
            label="Зареєстровано голосуючих акцій"
            value={form.registeredShares}
            onChange={(registeredShares) => update({ registeredShares })}
            error={errors['registeredShares']}
          />
        </fieldset>
        <fieldset>
          <legend>Рішення</legend>
          <SelectField
            id={`${PREFIX}-calc-majority`}
            name="majority"
            label="Питання порядку денного"
            hint={`Потрібно ${majorityLabel(form.majority)}.`}
            value={form.majority}
            options={majorityOptions}
            onChange={(majority) => update({ majority })}
          />
          <NumberField id={`${PREFIX}-calc-votesFor`} name="votesFor" label="Голоси «за»" value={form.votesFor} onChange={(votesFor) => update({ votesFor })} error={errors['votesFor']} />
        </fieldset>
        <p className="tfield-hint">Десятковий знак — кома, наприклад 1,5. Пробіли між розрядами можна залишати.</p>
        <button type="submit" className="btn btn-primary" data-calc-submit>
          Розрахувати
        </button>
      </form>

      <section className="tresult" aria-live="polite" aria-labelledby={`${PREFIX}-calc-result`} data-calc-result data-stale={stale ? '' : undefined}>
        <h3 className="visually-hidden" id={`${PREFIX}-calc-result`}>
          Результат розрахунку
        </h3>
        {stale && <p className="tstale">Дані змінено — натисніть «Розрахувати», щоб оновити результат.</p>}
        {result ? (
          <>
            <Verdict ok={result.quorum.hasQuorum} title={result.quorum.hasQuorum ? 'Кворум є' : 'Кворуму немає'} name="quorum">
              <p className="num">
                Потрібно щонайменше {sharesText(result.quorum.requiredShares)}
                {result.quorum.shortfall > 0 ? `, бракує ${num(result.quorum.shortfall)}` : ''}.
              </p>
            </Verdict>
            <Steps title="Розбір: кворум" steps={result.quorumSteps} name="quorum" />
            <Verdict ok={result.resolution.adopted && result.quorum.hasQuorum} title={result.resolution.adopted && result.quorum.hasQuorum ? 'Рішення прийнято' : 'Рішення не прийнято'} name="resolution">
              <p className="num">
                {result.quorum.hasQuorum
                  ? `Потрібно голосів «за»: ${num(result.resolution.requiredVotes)} з бази ${num(result.resolution.base)}.`
                  : `Без кворуму збори неправомочні. Якби кворум був, для рішення потрібно було б «за»: ${num(result.resolution.requiredVotes)} з бази ${num(result.resolution.base)}.`}
              </p>
            </Verdict>
            <Steps title="Розбір: рішення" steps={result.resolutionSteps} name="resolution" />
          </>
        ) : (
          <p className="tempty">Виправте дані у формі — помилки показано біля полів.</p>
        )}
        <NormNotes
          items={[
            { norm: NORMS.quorum, value: `Кворум — ${thresholdText(DEFAULT_MEETING_RULES.quorum)} голосуючих акцій` },
            { norm: MAJORITY_NORMS[computed.form.majority], value: capitalize(majorityLabel(computed.form.majority)) },
          ]}
        />
      </section>
    </div>
  );
}

function TaskPanel() {
  const task = useTrainerTask({ activityId: ACTIVITY_ID, create: createQuorumVariant, check: checkQuorumAnswer, emptyAnswer: EMPTY_ANSWER });
  const { variant } = task;
  const id = (field: string) => `${PREFIX}-task-${field}-${task.number}`;
  return (
    <TaskShell
      prefix={PREFIX}
      number={task.number}
      status={trainerStatusText(task.statusState.state, ACTIVITY_ID)}
      check={task.check}
      solution={task.check ? quorumSolution(variant) : []}
      outcomeText={task.outcomeText}
      onSubmit={task.submit}
      onNext={task.next}
      fabula={
        <p data-task-majority={variant.majority}>
          Умовне ПрАТ «Зоря» проводить загальні збори. Голосуючих акцій, що враховуються в кворумі,{' '}
          <TaskValue name="votingShares" raw={variant.input.votingShares}>
            {num(variant.input.votingShares)}
          </TaskValue>
          . На момент закінчення реєстрації зареєструвалися акціонери з{' '}
          <TaskValue name="registeredShares" raw={variant.input.registeredShares}>
            {num(variant.input.registeredShares)}
          </TaskValue>{' '}
          голосуючими акціями. На порядку денному — {MAJORITY_ISSUES[variant.majority]}.
        </p>
      }
      fields={
        <>
          <YesNoField id={id('hasQuorum')} name="hasQuorum" legend={QUORUM_TASK_LABELS.hasQuorum} value={task.answer.hasQuorum} onChange={(hasQuorum) => task.setAnswer({ hasQuorum })} error={task.errors['hasQuorum']} />
          <NumberField id={id('requiredShares')} name="requiredShares" label={QUORUM_TASK_LABELS.requiredShares} value={task.answer.requiredShares} onChange={(requiredShares) => task.setAnswer({ requiredShares })} error={task.errors['requiredShares']} />
          <NumberField
            id={id('requiredVotes')}
            name="requiredVotes"
            label={QUORUM_TASK_LABELS.requiredVotes}
            hint="Якщо збори правомочні. Базу визначає питання порядку денного."
            value={task.answer.requiredVotes}
            onChange={(requiredVotes) => task.setAnswer({ requiredVotes })}
            error={task.errors['requiredVotes']}
          />
        </>
      }
    />
  );
}

export function QuorumTrainer() {
  const [mode, setMode] = useState<TrainerMode>('calc');
  return (
    <div className="trainer" data-trainer-island="quorum" data-mode={mode}>
      <ModeTabs prefix={PREFIX} mode={mode} onChange={setMode} label="Режим тренажера кворуму" />
      <div role="tabpanel" id={panelId(PREFIX, 'calc')} aria-labelledby={tabId(PREFIX, 'calc')} hidden={mode !== 'calc'}>
        <CalcPanel />
      </div>
      <div role="tabpanel" id={panelId(PREFIX, 'task')} aria-labelledby={tabId(PREFIX, 'task')} hidden={mode !== 'task'}>
        <TaskPanel />
      </div>
    </div>
  );
}
