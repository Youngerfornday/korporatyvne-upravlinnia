/**
 * Тренажер-матриця практичних: зіставлення формулювань клітинок з моделями (навчальна й оцінювана спроби),
 * бал за рубрикою реєстру, завдання «визнач модель компанії», подія XP. Чистий TS без DOM — для сайту й SCORM.
 */
export { attemptProgress, checkFeature, finishMatrixAttempt, itemIdOf, reviewItem, selectModel, startMatrixAttempt, summarizeMatrixAttempt } from './attempt';
export type { StartMatrixAttemptInput } from './attempt';
export { COMPANY_ERROR_MESSAGES, REQUIRED_KEY_FEATURES, gradeCompanyTask } from './company';
export type { CompanyError, CompanyErrorCode, CompanyGrade, CompanyKeyFeature, CompanyResponse } from './company';
export { matrixActivityId, matrixCompletedEvent } from './events';
export { rubricBandsFromLevels, rubricMark } from './rubric';
export type { RubricBand, RubricLevelInput, RubricMark, RubricParseError } from './rubric';
export { currentAttempt, matrixStage, replaceCurrentAttempt, startGradedAttempt, startMatrixSession } from './session';
export type { MatrixSession, MatrixStage } from './session';
export { MATRIX_ERROR_MESSAGES, featureCheckText, itemStateLabel, marksOfText, matrixProgressText, matrixSummaryText, recordedResultText } from './texts';
export type * from './types';
