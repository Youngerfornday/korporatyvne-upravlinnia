/**
 * Запуск тренажера в пакеті SCORM: ті самі React-острови, що на сайті, але клієнт прогресу працює над
 * SCORM 1.2 API LMS (suspend_data, бал, статус), а не над localStorage. Стилі — ті самі файли сайту.
 */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { installProgressStore } from '../../../../src/components/progress/client';
import { attachScormLifecycle, createScormProgressStore, scormNoticeText, type ScormNotice } from '../../../../src/engines/progress/scorm-store';
import { PACKAGE_DATA_ELEMENT_ID, PACKAGE_NOTICE_ELEMENT_ID, PACKAGE_ROOT_ELEMENT_ID, parsePackageData, type ScormPackageData, type ScormPackageKind } from './data';
import '../../../../src/styles/global.css';
import '../../../../src/styles/topic.css';
import '../../../../src/components/quiz/quiz.css';
import '../../../../src/components/trainers/trainers.css';
import './scorm.css';

function showNotice(notice: ScormNotice): void {
  const target = document.getElementById(PACKAGE_NOTICE_ELEMENT_ID);
  if (!target) return;
  target.textContent = scormNoticeText(notice);
  target.hidden = false;
  target.dataset['notice'] = notice.code;
}

export function bootScormPackage<K extends ScormPackageKind>(kind: K, render: (data: Extract<ScormPackageData, { readonly kind: K }>) => ReactNode): void {
  const root = document.getElementById(PACKAGE_ROOT_ELEMENT_ID);
  if (!root) throw new Error(`У пакеті SCORM немає елемента #${PACKAGE_ROOT_ELEMENT_ID}.`);
  const data = parsePackageData(document.getElementById(PACKAGE_DATA_ELEMENT_ID)?.textContent, kind) as Extract<ScormPackageData, { readonly kind: K }>;

  const store = createScormProgressStore({ activityId: data.activityId, masteryPercent: data.masteryPercent, onNotice: showNotice });
  installProgressStore(store);
  attachScormLifecycle(store, window);
  document.documentElement.dataset['scorm'] = store.isPersistent() ? 'lms' : 'memory';

  createRoot(root).render(<StrictMode>{render(data)}</StrictMode>);
}
