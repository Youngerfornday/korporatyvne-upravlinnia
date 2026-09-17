/** Пакет «Матриця моделей»: оцінюваний тренажер-матриця і навчальне завдання «Визначте модель компанії». */
import { CompanyTasks } from '../../../../src/components/trainers/CompanyTasks';
import { MatrixTrainer } from '../../../../src/components/trainers/MatrixTrainer';
import { bootScormPackage } from './boot';

bootScormPackage('matrix', (data) => (
  <>
    <section className="scorm-section" aria-labelledby="scorm-matrix-title">
      <h2 className="h2" id="scorm-matrix-title">
        Тренажер: матриця моделей
      </h2>
      <MatrixTrainer practicalId={data.practicalId} matrix={data.matrix} sources={data.sources} rubric={data.rubric} />
    </section>
    <section className="scorm-section" aria-labelledby="scorm-companies-title">
      <h2 className="h2" id="scorm-companies-title">
        Визначте модель компанії
      </h2>
      <p className="lead muted">
        Для кожного опису оберіть модель і дві ознаки, які її видають. Це навчальне завдання: воно не оцінюється й не впливає на бал.
      </p>
      <CompanyTasks matrix={data.matrix} tasks={data.companyTasks} sources={data.sources} />
    </section>
  </>
));
