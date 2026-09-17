/**
 * React-острів «Дивіденди й чисті активи» (client:only): каскад розподілу прибутку, дивіденд на акцію,
 * дивідендний вихід і правило чистих активів; задача з варіантом генератора рушія.
 */
import { useState, type SubmitEvent } from 'react';
import { formatMoney } from '../../engines/shared/number-format';
import { CALCULATOR_TRAINERS } from './catalog';
import {
  DIVIDEND_TASK_LABELS,
  calculateDividendForm,
  checkDividendAnswer,
  createDividendVariant,
  dividendSolution,
  type DividendAnswer,
  type DividendCalculation,
  type DividendForm,
} from './model/dividends';
import { money, num, percent } from './model/format';
import { issuesByField, type FieldIssues } from './model/task-check';
import { trainerStatusText } from './model/xp-text';
import { NORMS } from './norms';
import { NumberField, YesNoField } from './ui/fields';
import { ModeTabs, panelId, tabId, type TrainerMode } from './ui/ModeTabs';
import { NormNotes, Steps, TaskValue, Verdict } from './ui/parts';
import { TaskShell } from './ui/TaskShell';
import { useTrainerTask } from './ui/use-trainer-task';

const PREFIX = 'dividends';
const ACTIVITY_ID = CALCULATOR_TRAINERS.find((trainer) => trainer.key === 'dividends')?.activityId ?? 'dividend-distribution';

/** Приклад за замовчуванням — еталонний каскад «ПАТ Мрія» (reference-cases.ts, profit-full-waterfall). */
const INITIAL_FORM: DividendForm = {
  netProfit: '2 000 000',
  reserveRate: '5',
  preferredShares: '20 000',
  preferredDividendPerShare: '5',
  commonShares: '240 000',
  commonPayoutRatio: '40',
  checkNetAssets: true,
  equityBeforeDividends: '12 000 000',
  statutoryCapital: '10 000 000',
  reserveCapitalAfter: '600 000',
  preferredLiquidationExcess: '200 000',
};
const EMPTY_ANSWER: DividendAnswer = { commonPerShare: '', totalDividends: '', payoutPercent: '', compliant: '' };

type TextField = Exclude<keyof DividendForm, 'checkNetAssets'>;

const MAIN_INPUTS: readonly { readonly name: TextField; readonly label: string; readonly suffix?: string; readonly hint?: string }[] = [
  { name: 'netProfit', label: 'Чистий прибуток', suffix: 'грн' },
  { name: 'reserveRate', label: 'Відрахування до резервного капіталу', suffix: '%', hint: 'За статутом; мінімуму закон не встановлює.' },
  { name: 'preferredShares', label: 'Привілейовані акції', suffix: 'шт.' },
  { name: 'preferredDividendPerShare', label: 'Дивіденд на привілейовану акцію', suffix: 'грн' },
  { name: 'commonShares', label: 'Прості акції', suffix: 'шт.' },
  { name: 'commonPayoutRatio', label: 'На дивіденди за простими — частка залишку', suffix: '%' },
];

const NET_ASSET_INPUTS: readonly { readonly name: TextField; readonly label: string; readonly hint?: string }[] = [
  { name: 'equityBeforeDividends', label: 'Власний капітал до виплати' },
  { name: 'statutoryCapital', label: 'Статутний капітал' },
  { name: 'reserveCapitalAfter', label: 'Резервний капітал після відрахування', hint: 'Порожнє поле — 0.' },
  { name: 'preferredLiquidationExcess', label: 'Перевищення ліквідаційної вартості привілейованих над номіналом', hint: 'Порожнє поле — 0.' },
];

function computeOrIssues(form: DividendForm): { readonly result: DividendCalculation | null; readonly issues: FieldIssues } {
  const computed = calculateDividendForm(form);
  return computed.ok ? { result: computed.value, issues: [] } : { result: null, issues: computed.error };
}

function CalcPanel() {
  const [form, setForm] = useState<DividendForm>(INITIAL_FORM);
  const [computed, setComputed] = useState(() => ({ form: INITIAL_FORM, ...computeOrIssues(INITIAL_FORM) }));
  const errors = issuesByField(computed.issues);
  const stale = JSON.stringify(form) !== JSON.stringify(computed.form);
  const calc = computed.result;
  const update = (patch: Partial<DividendForm>) => setForm((previous) => ({ ...previous, ...patch }));

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { form, ...computeOrIssues(form) };
    setComputed(next);
    const first = next.issues[0];
    if (first) requestAnimationFrame(() => document.getElementById(`${PREFIX}-calc-${first.field}`)?.focus());
  };

  const input = (spec: { readonly name: TextField; readonly label: string; readonly suffix?: string; readonly hint?: string }) => (
    <NumberField
      key={spec.name}
      id={`${PREFIX}-calc-${spec.name}`}
      name={spec.name}
      label={spec.label}
      suffix={spec.suffix ?? 'грн'}
      hint={spec.hint}
      value={form[spec.name]}
      onChange={(value) => update({ [spec.name]: value })}
      error={errors[spec.name]}
    />
  );

  const check = calc?.result.netAssetsCheck ?? null;
  return (
    <div className="tcalc">
      <form className="tform card" onSubmit={submit} noValidate data-calc-form>
        <fieldset>
          <legend>Прибуток і акції</legend>
          {MAIN_INPUTS.map(input)}
        </fieldset>
        <fieldset>
          <legend>Правило чистих активів</legend>
          <label className="tcheck">
            <input type="checkbox" checked={form.checkNetAssets} onChange={(event) => update({ checkNetAssets: event.target.checked })} data-calc-net-assets />
            <span>Перевірити, чи дозволяє виплату власний капітал</span>
          </label>
          {form.checkNetAssets && NET_ASSET_INPUTS.map(input)}
        </fieldset>
        <p className="tfield-hint">Десятковий знак — кома: 1,5 грн, 12,5 %. Пробіли між розрядами можна залишати.</p>
        <button type="submit" className="btn btn-primary" data-calc-submit>
          Розрахувати
        </button>
      </form>

      <section className="tresult" aria-live="polite" aria-labelledby={`${PREFIX}-calc-result`} data-calc-result data-stale={stale ? '' : undefined}>
        <h3 className="visually-hidden" id={`${PREFIX}-calc-result`}>
          Результат розрахунку
        </h3>
        {stale && <p className="tstale">Дані змінено — натисніть «Розрахувати», щоб оновити результат.</p>}
        {calc ? (
          <>
            <dl className="tfigures" data-calc-figures>
              <div>
                <dt>Дивіденд на просту акцію</dt>
                <dd className="num" data-figure="commonPerShare">
                  {formatMoney(calc.result.commonPerShare)}
                </dd>
              </div>
              <div>
                <dt>Усього дивідендів</dt>
                <dd className="num" data-figure="totalDividends">
                  {money(calc.result.totalDividends)}
                </dd>
              </div>
              <div>
                <dt>Дивідендний вихід</dt>
                <dd className="num" data-figure="payoutRatio">
                  {percent(calc.result.payoutRatio)}
                </dd>
              </div>
              <div>
                <dt>За привілейованими</dt>
                <dd className="num" data-figure="preferredDividends">
                  {money(calc.result.preferredDividends)}
                </dd>
              </div>
            </dl>
            {check && (
              <Verdict ok={check.compliant} title={check.compliant ? 'Правило чистих активів дотримано' : 'Правило чистих активів порушено'} name="net-assets">
                <p className="num">
                  Капітал після виплати {money(check.equityAfter)} {check.compliant ? '≥' : '<'} мінімуму {money(check.minimumEquity)}.
                </p>
              </Verdict>
            )}
            <Steps title="Розбір: розподіл прибутку" steps={calc.steps} name="dividends" />
          </>
        ) : (
          <p className="tempty">Виправте дані у формі — помилки показано біля полів.</p>
        )}
        <NormNotes items={[{ norm: NORMS.dividendDefinition }, { norm: NORMS.reserveCapital }, { norm: NORMS.preferredFirst }, { norm: NORMS.netAssetsRule }]} />
      </section>
    </div>
  );
}

function TaskPanel() {
  const task = useTrainerTask({ activityId: ACTIVITY_ID, create: createDividendVariant, check: checkDividendAnswer, emptyAnswer: EMPTY_ANSWER });
  const { variant } = task;
  const { input } = variant;
  const netAssets = input.netAssets;
  const id = (field: string) => `${PREFIX}-task-${field}-${task.number}`;
  return (
    <TaskShell
      prefix={PREFIX}
      number={task.number}
      status={trainerStatusText(task.statusState.state, ACTIVITY_ID)}
      check={task.check}
      solution={task.check ? dividendSolution(variant) : []}
      outcomeText={task.outcomeText}
      onSubmit={task.submit}
      onNext={task.next}
      fabula={
        <>
          <p>
            Умовне АТ «Мрія» за рік отримало чистий прибуток{' '}
            <TaskValue name="netProfit" raw={input.netProfit}>
              {money(input.netProfit)}
            </TaskValue>
            . За статутом до резервного капіталу відраховують{' '}
            <TaskValue name="reserveRate" raw={input.reserveRate}>
              {percent(input.reserveRate)}
            </TaskValue>{' '}
            прибутку.{' '}
            {input.preferredShares > 0 ? (
              <>
                Привілейованих акцій —{' '}
                <TaskValue name="preferredShares" raw={input.preferredShares}>
                  {num(input.preferredShares)}
                </TaskValue>
                , дивіденд за статутом —{' '}
                <TaskValue name="preferredDividendPerShare" raw={input.preferredDividendPerShare}>
                  {formatMoney(input.preferredDividendPerShare)}
                </TaskValue>{' '}
                на акцію.
              </>
            ) : (
              'Привілейованих акцій немає.'
            )}{' '}
            На дивіденди за простими акціями збори спрямовують{' '}
            <TaskValue name="commonPayoutRatio" raw={input.commonPayoutRatio}>
              {percent(input.commonPayoutRatio)}
            </TaskValue>{' '}
            прибутку, що лишився після резерву й привілейованих; простих акцій —{' '}
            <TaskValue name="commonShares" raw={input.commonShares}>
              {num(input.commonShares)}
            </TaskValue>
            .
          </p>
          {netAssets && (
            <p>
              Баланс: власний капітал до виплати{' '}
              <TaskValue name="equityBeforeDividends" raw={netAssets.equityBeforeDividends}>
                {money(netAssets.equityBeforeDividends)}
              </TaskValue>
              , статутний капітал{' '}
              <TaskValue name="statutoryCapital" raw={netAssets.statutoryCapital}>
                {money(netAssets.statutoryCapital)}
              </TaskValue>
              , резервний капітал після відрахування{' '}
              <TaskValue name="reserveCapitalAfter" raw={netAssets.reserveCapitalAfter ?? 0}>
                {money(netAssets.reserveCapitalAfter ?? 0)}
              </TaskValue>
              , перевищення ліквідаційної вартості привілейованих над номіналом{' '}
              <TaskValue name="preferredLiquidationExcess" raw={netAssets.preferredLiquidationExcess ?? 0}>
                {money(netAssets.preferredLiquidationExcess ?? 0)}
              </TaskValue>
              .
            </p>
          )}
        </>
      }
      fields={
        <>
          <NumberField id={id('commonPerShare')} name="commonPerShare" label={DIVIDEND_TASK_LABELS.commonPerShare} hint="До копійки." value={task.answer.commonPerShare} onChange={(commonPerShare) => task.setAnswer({ commonPerShare })} error={task.errors['commonPerShare']} />
          <NumberField id={id('totalDividends')} name="totalDividends" label={DIVIDEND_TASK_LABELS.totalDividends} value={task.answer.totalDividends} onChange={(totalDividends) => task.setAnswer({ totalDividends })} error={task.errors['totalDividends']} />
          <NumberField id={id('payoutPercent')} name="payoutPercent" label={DIVIDEND_TASK_LABELS.payoutPercent} hint="Усі дивіденди / чистий прибуток, до десятої відсотка." value={task.answer.payoutPercent} onChange={(payoutPercent) => task.setAnswer({ payoutPercent })} error={task.errors['payoutPercent']} />
          <YesNoField id={id('compliant')} name="compliant" legend={DIVIDEND_TASK_LABELS.compliant} value={task.answer.compliant} onChange={(compliant) => task.setAnswer({ compliant })} error={task.errors['compliant']} />
        </>
      }
    />
  );
}

export function DividendTrainer() {
  const [mode, setMode] = useState<TrainerMode>('calc');
  return (
    <div className="trainer" data-trainer-island="dividends" data-mode={mode}>
      <ModeTabs prefix={PREFIX} mode={mode} onChange={setMode} label="Режим тренажера дивідендів" />
      <div role="tabpanel" id={panelId(PREFIX, 'calc')} aria-labelledby={tabId(PREFIX, 'calc')} hidden={mode !== 'calc'}>
        <CalcPanel />
      </div>
      <div role="tabpanel" id={panelId(PREFIX, 'task')} aria-labelledby={tabId(PREFIX, 'task')} hidden={mode !== 'task'}>
        <TaskPanel />
      </div>
    </div>
  );
}
