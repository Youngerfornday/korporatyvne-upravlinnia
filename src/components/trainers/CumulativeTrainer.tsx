/**
 * React-острів «Кумулятивне голосування» (client:only): мінімальний пакет для k з N місць і перевірка
 * «чи пройдуть кандидати акціонера з пакетом»; задача з варіантом генератора рушія.
 */
import { useState, type SubmitEvent } from 'react';
import { CALCULATOR_TRAINERS } from './catalog';
import { CUMULATIVE_TASK_LABELS, calculateCumulativeForm, checkCumulativeAnswer, createCumulativeVariant, cumulativeSolution, type CumulativeAnswer, type CumulativeCalculation, type CumulativeForm } from './model/cumulative';
import { num, seatsGenitiveText, seatsText, sharesText, sharesWord } from './model/format';
import { issuesByField, type FieldIssues } from './model/task-check';
import { trainerStatusText } from './model/xp-text';
import { CUMULATIVE_FORMULA_NOTE, NORMS } from './norms';
import { NumberField, YesNoField } from './ui/fields';
import { ModeTabs, panelId, tabId, type TrainerMode } from './ui/ModeTabs';
import { NormNotes, Steps, TaskValue, Verdict } from './ui/parts';
import { TaskShell } from './ui/TaskShell';
import { useTrainerTask } from './ui/use-trainer-task';

const PREFIX = 'cumulative';
const ACTIVITY_ID = CALCULATOR_TRAINERS.find((trainer) => trainer.key === 'cumulative')?.activityId ?? 'cumulative-voting-calculator';

/** Приклад за замовчуванням — еталонні випадки 600 акцій, 5 місць (reference-cases.ts). */
const INITIAL_FORM: CumulativeForm = { votingShares: '600', seats: '5', targetSeats: '2', stake: '250' };
const EMPTY_ANSWER: CumulativeAnswer = { minimumShares: '', passes: '' };

function computeOrIssues(form: CumulativeForm): { readonly result: CumulativeCalculation | null; readonly issues: FieldIssues } {
  const computed = calculateCumulativeForm(form);
  return computed.ok ? { result: computed.value, issues: [] } : { result: null, issues: computed.error };
}

function CalcPanel() {
  const [form, setForm] = useState<CumulativeForm>(INITIAL_FORM);
  const [computed, setComputed] = useState(() => ({ form: INITIAL_FORM, ...computeOrIssues(INITIAL_FORM) }));
  const errors = issuesByField(computed.issues);
  const stale = JSON.stringify(form) !== JSON.stringify(computed.form);
  const result = computed.result;
  const update = (patch: Partial<CumulativeForm>) => setForm((previous) => ({ ...previous, ...patch }));

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
          <legend>Рада і голосування</legend>
          <NumberField id={`${PREFIX}-calc-votingShares`} name="votingShares" label="S — акції, що голосують" value={form.votingShares} onChange={(votingShares) => update({ votingShares })} error={errors['votingShares']} />
          <NumberField id={`${PREFIX}-calc-seats`} name="seats" label="N — місць у раді" value={form.seats} onChange={(seats) => update({ seats })} error={errors['seats']} />
          <NumberField
            id={`${PREFIX}-calc-targetSeats`}
            name="targetSeats"
            label="k — скільки своїх кандидатів провести"
            value={form.targetSeats}
            onChange={(targetSeats) => update({ targetSeats })}
            error={errors['targetSeats']}
          />
        </fieldset>
        <fieldset>
          <legend>Чи пройдуть кандидати</legend>
          <NumberField
            id={`${PREFIX}-calc-stake`}
            name="stake"
            label="Пакет акціонера, акцій"
            hint="Необов’язково. Порожнє поле — лише мінімальний пакет."
            value={form.stake}
            onChange={(stake) => update({ stake })}
            error={errors['stake']}
          />
        </fieldset>
        <p className="tfield-hint">Кількості — цілі числа; «1,5» рушій прочитає, але пояснить, що акції й місця цілі.</p>
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
            <div className="tbig" data-calc-minimum>
              <span className="tbig-label">Мінімальний пакет для {seatsGenitiveText(result.input.targetSeats)} з {num(result.input.seats)}</span>
              <b className="num">{sharesText(result.minimum.minimumShares)}</b>
            </div>
            <Steps title="Розбір: мінімальний пакет" steps={result.minimumSteps} name="minimum" />
            {result.stake !== null && result.guaranteed !== null && result.candidatesPass !== null && (
              <>
                <Verdict
                  ok={result.candidatesPass}
                  title={result.candidatesPass ? 'Усі кандидати пройдуть' : 'Гарантії для всіх кандидатів немає'}
                  name="candidates"
                >
                  <p className="num">
                    Пакет {num(result.stake)} гарантує {seatsText(result.guaranteed)}; кандидатів — {num(result.input.targetSeats)}.
                  </p>
                </Verdict>
                <Steps title="Розбір: чи пройде кандидат" steps={result.guaranteedSteps} name="guaranteed" />
              </>
            )}
          </>
        ) : (
          <p className="tempty">Виправте дані у формі — помилки показано біля полів.</p>
        )}
        <NormNotes items={[{ norm: NORMS.cumulativeMechanics }, { norm: NORMS.cumulativeMandatory }]} note={CUMULATIVE_FORMULA_NOTE} />
      </section>
    </div>
  );
}

function TaskPanel() {
  const task = useTrainerTask({ activityId: ACTIVITY_ID, create: createCumulativeVariant, check: checkCumulativeAnswer, emptyAnswer: EMPTY_ANSWER });
  const { variant } = task;
  const id = (field: string) => `${PREFIX}-task-${field}-${task.number}`;
  return (
    <TaskShell
      prefix={PREFIX}
      number={task.number}
      status={trainerStatusText(task.statusState.state, ACTIVITY_ID)}
      check={task.check}
      solution={task.check ? cumulativeSolution(variant) : []}
      outcomeText={task.outcomeText}
      onSubmit={task.submit}
      onNext={task.next}
      fabula={
        <p>
          Наглядову раду умовного ПАТ «Полісся» з{' '}
          <TaskValue name="seats" raw={variant.input.seats}>
            {num(variant.input.seats)}
          </TaskValue>{' '}
          членів обирають кумулятивним голосуванням. Голосують{' '}
          <TaskValue name="votingShares" raw={variant.input.votingShares}>
            {num(variant.input.votingShares)}
          </TaskValue>{' '}
          {sharesWord(variant.input.votingShares)}. Міноритарний акціонер хоче гарантовано провести до ради своїх кандидатів — їх{' '}
          <TaskValue name="targetSeats" raw={variant.input.targetSeats}>
            {num(variant.input.targetSeats)}
          </TaskValue>
          . Зараз у нього{' '}
          <TaskValue name="stake" raw={variant.stake}>
            {num(variant.stake)}
          </TaskValue>{' '}
          {sharesWord(variant.stake)}.
        </p>
      }
      fields={
        <>
          <NumberField id={id('minimumShares')} name="minimumShares" label={CUMULATIVE_TASK_LABELS.minimumShares} value={task.answer.minimumShares} onChange={(minimumShares) => task.setAnswer({ minimumShares })} error={task.errors['minimumShares']} />
          <YesNoField id={id('passes')} name="passes" legend={CUMULATIVE_TASK_LABELS.passes} value={task.answer.passes} onChange={(passes) => task.setAnswer({ passes })} error={task.errors['passes']} />
        </>
      }
    />
  );
}

export function CumulativeTrainer() {
  const [mode, setMode] = useState<TrainerMode>('calc');
  return (
    <div className="trainer" data-trainer-island="cumulative" data-mode={mode}>
      <ModeTabs prefix={PREFIX} mode={mode} onChange={setMode} label="Режим тренажера кумулятивного голосування" />
      <div role="tabpanel" id={panelId(PREFIX, 'calc')} aria-labelledby={tabId(PREFIX, 'calc')} hidden={mode !== 'calc'}>
        <CalcPanel />
      </div>
      <div role="tabpanel" id={panelId(PREFIX, 'task')} aria-labelledby={tabId(PREFIX, 'task')} hidden={mode !== 'task'}>
        <TaskPanel />
      </div>
    </div>
  );
}
