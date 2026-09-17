/**
 * React-острів «Визначте модель компанії» (client:only): для кожного опису — модель і дві ключові ознаки,
 * перевірка рушієм матриці з розбором ключових ознак і джерелом. Навчальне завдання: без XP і без збереження.
 */
import { useRef, useState, type SubmitEvent } from 'react';
import { REQUIRED_KEY_FEATURES, gradeCompanyTask, type CompanyGrade, type CompanyTaskDefinition, type MatrixDefinition } from '../../engines/matrix';
import { Icon } from '../quiz/Icon';
import { SourceLinks, type MatrixSources } from './matrix/SourceLinks';
import { FieldError } from './ui/fields';

export interface CompanyTasksProps {
  readonly matrix: MatrixDefinition;
  readonly tasks: readonly CompanyTaskDefinition[];
  readonly sources: MatrixSources;
}

const STATE_TEXT: Readonly<Record<CompanyGrade['state'], string>> = {
  right: 'Правильно: модель і обидві ключові ознаки',
  partial: 'Модель правильна, але ознаки не ті, що її видають',
  wrong: 'Модель визначено неправильно',
};

interface TaskProps {
  readonly task: CompanyTaskDefinition;
  readonly index: number;
  readonly matrix: MatrixDefinition;
  readonly sources: MatrixSources;
}

function CompanyTask({ task, index, matrix, sources }: TaskProps) {
  const [model, setModel] = useState<string | null>(null);
  const [features, setFeatures] = useState<readonly string[]>([]);
  const [grade, setGrade] = useState<CompanyGrade | null>(null);
  const [issue, setIssue] = useState<{ readonly field: 'model' | 'features'; readonly message: string } | null>(null);
  const verdictRef = useRef<HTMLHeadingElement>(null);
  const idBase = `company-${task.id}`;
  const modelTitle = (id: string) => matrix.models.find((entry) => entry.id === id)?.title ?? id;

  const toggle = (featureId: string, checked: boolean) => {
    setFeatures((previous) => (checked ? [...previous, featureId] : previous.filter((id) => id !== featureId)));
    if (issue?.field === 'features') setIssue(null);
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = gradeCompanyTask(task, matrix, { model, features });
    if (!result.ok) {
      const field = result.error.code === 'no-model' || result.error.code === 'unknown-model' ? 'model' : 'features';
      setIssue({ field, message: result.error.message });
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#${idBase}-${field} input`)?.focus());
      return;
    }
    setIssue(null);
    setGrade(result.value);
    requestAnimationFrame(() => verdictRef.current?.focus());
  };

  const reset = () => {
    setModel(null);
    setFeatures([]);
    setGrade(null);
    setIssue(null);
  };

  return (
    <article className="company card" aria-labelledby={`${idBase}-title`} data-company={task.id} data-state={grade?.state}>
      <h3 className="h4" id={`${idBase}-title`}>
        <span className="faint num">{index + 1}.</span> {task.company}
      </h3>
      <p className="company-text">{task.description}</p>
      <form onSubmit={submit} noValidate>
        <fieldset className="company-group" id={`${idBase}-model`} disabled={grade !== null} aria-describedby={issue?.field === 'model' ? `${idBase}-model-error` : undefined}>
          <legend>Модель</legend>
          <div className="company-options">
            {matrix.models.map((entry) => (
              <label key={entry.id} className="yesno-option" data-checked={model === entry.id ? '' : undefined}>
                <input type="radio" name={`${idBase}-model-choice`} value={entry.id} checked={model === entry.id} onChange={() => setModel(entry.id)} />
                <span>{entry.short}</span>
              </label>
            ))}
          </div>
          <FieldError id={`${idBase}-model-error`} message={issue?.field === 'model' ? issue.message : undefined} />
        </fieldset>
        <fieldset className="company-group" id={`${idBase}-features`} disabled={grade !== null} aria-describedby={issue?.field === 'features' ? `${idBase}-features-error` : undefined}>
          <legend>
            Ознаки, які видають модель <span className="faint">(оберіть {REQUIRED_KEY_FEATURES})</span>
          </legend>
          <div className="company-features">
            {matrix.features.map((feature) => (
              <label key={feature.id} className="tcheck">
                <input type="checkbox" checked={features.includes(feature.id)} onChange={(event) => toggle(feature.id, event.target.checked)} />
                <span>{feature.title}</span>
              </label>
            ))}
          </div>
          <FieldError id={`${idBase}-features-error`} message={issue?.field === 'features' ? issue.message : undefined} />
        </fieldset>
        <div className="tactions">
          {grade === null ? (
            <button type="submit" className="btn btn-primary" data-company-check>
              Перевірити
            </button>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={reset} data-company-reset>
              Спробувати ще раз
            </button>
          )}
        </div>
      </form>

      {grade && (
        <section className={`company-review tverdict ${grade.state === 'right' ? 'is-ok' : 'is-err'}`} aria-labelledby={`${idBase}-verdict`} data-company-review>
          <Icon name={grade.state === 'right' ? 'check' : 'x'} className="icon" />
          <div>
            <h4 id={`${idBase}-verdict`} tabIndex={-1} ref={verdictRef}>
              {STATE_TEXT[grade.state]}
            </h4>
            <p>
              Модель: <b>{modelTitle(grade.correctModel)}</b>
              {!grade.modelCorrect && <> (ви обрали: {modelTitle(grade.chosenModel)})</>}.
            </p>
            <ul className="company-keys" aria-label="Ключові ознаки">
              {grade.keyFeatures.map((key) => (
                <li key={key.featureId} data-chosen={key.chosen ? '' : undefined}>
                  <Icon name={key.chosen ? 'check' : 'info'} className="icon icon-sm" label={key.chosen ? 'ви обрали' : 'ви не обрали'} />
                  <span>
                    <b>{key.title}:</b> {key.statement}
                  </span>
                </li>
              ))}
            </ul>
            <p className="opt-why">{grade.explanation}</p>
            <SourceLinks ids={[grade.source]} sources={sources} />
          </div>
        </section>
      )}
    </article>
  );
}

export function CompanyTasks({ matrix, tasks, sources }: CompanyTasksProps) {
  return (
    <div className="companies" data-company-tasks>
      {tasks.map((task, index) => (
        <CompanyTask key={task.id} task={task} index={index} matrix={matrix} sources={sources} />
      ))}
    </div>
  );
}
