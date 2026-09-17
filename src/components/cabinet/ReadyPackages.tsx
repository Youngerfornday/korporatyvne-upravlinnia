/** Готові пакети з маніфесту (kind bundle і backup): пряме завантаження; резервна копія — зовнішня адреса. */
import { Icon } from '../quiz/Icon';
import { formatBytes, formatLabel } from './texts';
import type { Audience, MaterialFile } from './types';

export interface ReadyPackagesProps {
  readonly packages: readonly MaterialFile[];
  readonly audience: Audience;
  readonly hasManifest: boolean;
  readonly generatedLabel: string | undefined;
  readonly buildCommand: string;
}

function PackageCard({ file, generatedLabel }: { readonly file: MaterialFile; readonly generatedLabel: string | undefined }) {
  const meta = [formatLabel(file.format), formatBytes(file.bytes), file.external ? 'GitHub Releases' : generatedLabel && `зібрано ${generatedLabel}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <li>
      <a
        className="card ready-card"
        href={file.href}
        data-package={file.id}
        {...(file.external ? { rel: 'noopener' } : { download: '' })}
      >
        <Icon name={file.kind === 'backup' ? 'cab-scorm' : 'cab-archive'} className="icon icon-lg" />
        <span>
          <b>{file.title}</b>
          <small>{meta}</small>
          {file.description && <small className="ready-desc">{file.description}</small>}
          {file.external && <span className="visually-hidden"> (зовнішнє посилання)</span>}
        </span>
        <Icon name={file.external ? 'external' : 'download'} />
      </a>
    </li>
  );
}

export function ReadyPackages({ packages, audience, hasManifest, generatedLabel, buildCommand }: ReadyPackagesProps) {
  const visible = audience === 'teacher' ? packages : packages.filter((file) => file.audience === 'student');
  return (
    <section className="ready-section" id="pakety" aria-labelledby="ready-title" data-ready-packages>
      <h2 className="h3" id="ready-title">
        Готові пакети
      </h2>
      {!hasManifest && (
        <p className="ready-empty">
          Пакети на модуль, на курс і резервна копія для Moodle з’являться після збирання матеріалів: <code>{buildCommand}</code>.
        </p>
      )}
      {hasManifest && visible.length === 0 && (
        <p className="ready-empty">
          {audience === 'student' ? 'Готові пакети призначені викладачам: перемкніть вид на «Викладач».' : 'Готових пакетів у маніфесті матеріалів немає.'}
        </p>
      )}
      {visible.length > 0 && (
        <ul className="ready">
          {visible.map((file) => (
            <PackageCard key={file.id} file={file} generatedLabel={generatedLabel} />
          ))}
        </ul>
      )}
    </section>
  );
}
