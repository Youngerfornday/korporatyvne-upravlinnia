import { datasetItems } from './dataset-items.ts';
import { PENALTY_NONE, combinedFeedback, feedbackField, questionHeader, type QuestionOf } from './question-parts.ts';
import { formatFraction, formatNumber, htmlText } from './text.ts';
import { element, textElement, type XmlElement } from './xml.ts';

/** Числові питання: numerical і calculated. Усі числа в XML — з крапкою (кома лише в тексті для студента). */

/** `<tolerancetype>` Moodle: 1 — відносний, 2 — номінальний, 3 — геометричний (qtype_calculated::tolerance_types). */
const TOLERANCE_TYPES = { relative: '1', nominal: '2', geometric: '3' } as const;
/** `<correctanswerformat>`: 1 — знаки після коми, 2 — значущі цифри. */
const ANSWER_FORMATS = { decimals: '1', 'significant-figures': '2' } as const;

/** Без одиниць виміру: `showunits` 3 = UNITNONE; решта полів — як у фікстурі спайку. */
function unitFields(): XmlElement[] {
  return [
    textElement('unitgradingtype', '0'),
    textElement('unitpenalty', '0.1'),
    textElement('showunits', '3'),
    textElement('unitsleft', '0'),
  ];
}

export function numericalBody(question: QuestionOf<'numerical'>): XmlElement[] {
  return [
    ...questionHeader(question, {
      questionText: htmlText(question.stem),
      generalFeedback: htmlText(question.generalFeedback),
      penalty: PENALTY_NONE,
    }),
    ...question.answers.map((answer) =>
      element(
        'answer',
        [
          textElement('text', formatNumber(answer.value)),
          feedbackField(answer.feedback),
          textElement('tolerance', formatNumber(answer.tolerance)),
        ],
        { fraction: formatFraction(answer.fraction), format: 'moodle_auto_format' },
      ),
    ),
    ...unitFields(),
  ];
}

function datasetDefinition(question: QuestionOf<'calculated'>, dataset: QuestionOf<'calculated'>['datasets'][number]): XmlElement {
  const count = String(question.itemCount);
  const items = datasetItems(question, dataset).map((value, index) =>
    element('dataset_item', [textElement('number', String(index + 1)), textElement('value', value)]),
  );
  return element('dataset_definition', [
    element('status', [textElement('text', 'private')]),
    element('name', [textElement('text', dataset.name)]),
    textElement('type', 'calculated'),
    element('distribution', [textElement('text', dataset.distribution)]),
    element('minimum', [textElement('text', formatNumber(dataset.min))]),
    element('maximum', [textElement('text', formatNumber(dataset.max))]),
    element('decimals', [textElement('text', String(dataset.decimals))]),
    textElement('itemcount', count),
    element('dataset_items', items),
    textElement('number_of_items', count),
  ]);
}

export function calculatedBody(question: QuestionOf<'calculated'>): XmlElement[] {
  return [
    ...questionHeader(question, {
      questionText: htmlText(question.stem),
      generalFeedback: htmlText(question.generalFeedback),
      penalty: PENALTY_NONE,
    }),
    textElement('synchronize', '0'),
    textElement('single', '0'),
    textElement('answernumbering', 'abc'),
    textElement('shuffleanswers', '0'),
    ...combinedFeedback('empty'),
    ...question.answers.map((answer) =>
      element(
        'answer',
        [
          textElement('text', answer.formula),
          textElement('tolerance', formatNumber(answer.tolerance)),
          textElement('tolerancetype', TOLERANCE_TYPES[answer.toleranceType]),
          textElement('correctanswerformat', ANSWER_FORMATS[answer.correctAnswerFormat]),
          textElement('correctanswerlength', String(answer.correctAnswerLength)),
          feedbackField(answer.feedback),
        ],
        { fraction: formatFraction(answer.fraction) },
      ),
    ),
    ...unitFields(),
    element(
      'dataset_definitions',
      question.datasets.map((dataset) => datasetDefinition(question, dataset)),
    ),
  ];
}
