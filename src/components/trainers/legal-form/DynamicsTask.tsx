/**
 * Режим «Задача»: динаміка кількості юридичних осіб за ЄДРПОУ. Варіант — форма і пара дат з ряду
 * практичної, перевірка й XP — через спільний шар тренажерів-калькуляторів (`useTrainerTask`).
 */
import { useMemo } from 'react';
import type { RegistrySeriesDefinition } from '../../../engines/legal-form';
import { formatDate } from '../../../lib/course-data-pure';
import { num } from '../model/format';
import { DYNAMICS_TASK_LABELS, EMPTY_DYNAMICS_ANSWER, checkDynamicsAnswer, createLegalFormVariant, dynamicsSolution } from '../model/legal-form';
import { trainerStatusText } from '../model/xp-text';
import { NumberField, YesNoField } from '../ui/fields';
import { TaskShell } from '../ui/TaskShell';
import { TaskValue } from '../ui/parts';
import { useTrainerTask } from '../ui/use-trainer-task';

export interface DynamicsTaskProps {
  readonly prefix: string;
  readonly activityId: string;
  readonly series: RegistrySeriesDefinition;
}

export function DynamicsTask({ prefix, activityId, series }: DynamicsTaskProps) {
  const create = useMemo(() => createLegalFormVariant(series), [series]);
  const task = useTrainerTask({ activityId, create, check: checkDynamicsAnswer, emptyAnswer: EMPTY_DYNAMICS_ANSWER });
  const { change } = task.variant;
  const id = (field: string) => `${prefix}-task-${field}-${task.number}`;

  return (
    <TaskShell
      prefix={prefix}
      number={task.number}
      status={trainerStatusText(task.statusState.state, activityId)}
      check={task.check}
      solution={task.check ? dynamicsSolution(task.variant) : []}
      outcomeText={task.outcomeText}
      onSubmit={task.submit}
      onNext={task.next}
      fabula={
        <p data-task-form={change.formKey} data-task-from={change.from.date} data-task-to={change.to.date}>
          За таблицями ЄДРПОУ Держстату показник «{change.formTitle}» становив{' '}
          <TaskValue name="previous" raw={change.previous}>
            {num(change.previous)}
          </TaskValue>{' '}
          на {formatDate(change.from.date)} і{' '}
          <TaskValue name="current" raw={change.current}>
            {num(change.current)}
          </TaskValue>{' '}
          на {formatDate(change.to.date)}. Порахуйте зміну і скажіть, чи можна порівнювати поділ акціонерних товариств на
          публічні й приватні між цими двома таблицями.
        </p>
      }
      fields={
        <>
          <NumberField
            id={id('absoluteChange')}
            name="absoluteChange"
            label={DYNAMICS_TASK_LABELS.absoluteChange}
            hint="Зменшення записуйте зі знаком мінус."
            value={task.answer.absoluteChange}
            onChange={(absoluteChange) => task.setAnswer({ absoluteChange })}
            error={task.errors['absoluteChange']}
          />
          <NumberField
            id={id('growthRate')}
            name="growthRate"
            label={DYNAMICS_TASK_LABELS.growthRate}
            hint="Темп зростання мінус 100 %, до сотих. Десятковий знак — кома."
            value={task.answer.growthRate}
            onChange={(growthRate) => task.setAnswer({ growthRate })}
            error={task.errors['growthRate']}
          />
          <YesNoField
            id={id('splitComparable')}
            name="splitComparable"
            legend={DYNAMICS_TASK_LABELS.splitComparable}
            value={task.answer.splitComparable}
            onChange={(splitComparable) => task.setAnswer({ splitComparable })}
            error={task.errors['splitComparable']}
          />
        </>
      }
    />
  );
}
