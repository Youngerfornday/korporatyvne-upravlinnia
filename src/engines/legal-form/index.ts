/**
 * Тренажер практичної 2 «Вибір форми бізнесу»: конструктор рішення (параметри стартапу → допустимі форми
 * з причинами) і динаміка кількості юридичних осіб за даними ЄДРПОУ. Чистий TS без DOM — для сайту й SCORM.
 */
export { FORM_STATUS_LABELS, choiceSummaryText, defaultProfile, evaluateForms, profileIssues, summarizeChoice } from './choice';
export type { ChoiceDefinition, ChoiceError, ChoiceSummary } from './choice';
export { createDynamicsVariant, dynamicsVariantId, registryChange, registryForm } from './dynamics';
export type { DynamicsVariant, RegistryChange } from './dynamics';
export { legalFormActivityId } from './events';
export type * from './types';
