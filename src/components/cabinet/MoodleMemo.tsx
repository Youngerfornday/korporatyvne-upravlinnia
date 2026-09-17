/** Пам’ятка після запуску тесту в Moodle і примітка про контрольні банки. */
import { Icon } from '../quiz/Icon';

export function MoodleMemo({ moodleGuideHref }: { readonly moodleGuideHref: string }) {
  return (
    <aside className="memo" aria-labelledby="memo-title" data-moodle-memo>
      <Icon name="info" className="icon icon-lg" />
      <div>
        <p>
          <b id="memo-title">Пам’ятка після запуску тесту в Moodle.</b> Через тиждень відкрийте статистику тесту: легкість
          питання має бути в межах 30–80&nbsp;%, індекс дискримінації — не нижче 0,3. Питання поза межами позначте в банку
          тегом «переглянути» й відредагуйте до наступного потоку.
        </p>
        <p>
          Контрольних банків на сайті немає: вони зберігаються в приватному репозиторії курсу. Тут і в резервній копії
          для Moodle — лише тренувальні банки.
        </p>
        <p>
          <a href={moodleGuideHref}>
            Як завантажити курс у Moodle
            <Icon name="arrow-r" className="icon icon-sm" />
          </a>
        </p>
      </div>
    </aside>
  );
}
