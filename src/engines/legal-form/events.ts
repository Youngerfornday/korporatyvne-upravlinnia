/**
 * ID активності тренажера «Вибір форми бізнесу». XP нараховує загальний шар тренажерів-калькуляторів
 * (`trainer-completed` з `variantId`), тому тут потрібен лише стабільний ідентифікатор.
 */
const PRACTICAL_ID = /^p\d{2}$/;

export function legalFormActivityId(practicalId: string): string {
  if (!PRACTICAL_ID.test(practicalId)) throw new Error(`Некоректний ID практичної «${practicalId}»`);
  return `${practicalId}-legal-form`;
}
