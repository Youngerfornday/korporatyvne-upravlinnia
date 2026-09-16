/** Іконка зі спрайта Icons.astro для React-островів. Декоративна, якщо немає label. */
interface Props {
  readonly name: string;
  readonly className?: string;
  readonly label?: string;
}

/** Шестикутник бренду в спрайті має id без префікса i- (Icons.astro). */
function symbolHref(name: string): string {
  return name === 'hex' ? '#hex' : `#i-${name}`;
}

export function Icon({ name, className = 'icon', label }: Props) {
  if (label) {
    return (
      <svg className={className} role="img" aria-label={label}>
        <use href={symbolHref(name)} />
      </svg>
    );
  }
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <use href={symbolHref(name)} />
    </svg>
  );
}
