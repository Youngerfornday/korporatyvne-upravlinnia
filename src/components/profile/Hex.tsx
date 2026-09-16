/** Шестикутник рівня чи бейджа з лінійною піктограмою. Лише тут і в шапці — так велить DESIGN.md. */
const GLYPHS: Readonly<Record<string, string>> = {
  level: 'M17 30V19l7-4 7 4v11M17 24h14',
  'kvorum-zibrano': 'M15 25h18M15 30h18M24 17v4',
  'kumuliatyvnyi-holos': 'M17 32V20M24 32V16M31 32v-8',
  'uvazhnyi-chytach': 'M16 24c2.5-4 5-6 8-6s5.5 2 8 6c-2.5 4-5 6-8 6s-5.5-2-8-6Z',
  'protokol-pidpysano': 'M17 16h14v16H17zM20 22h8M20 26h5',
  'sumlinnyi-dyrektor': 'M24 15l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L15 22l6-1z',
  'dyvidendna-dystsyplina': 'M16 31l5-7 5 4 6-9',
  'tsina-vidsikannia': 'M16 30l5-5 4 3 7-8M28 20h4v4',
  prozorist: 'M17 30h14M20 18h8v12h-8z',
  'try-linii': 'M24 15v18M17 20l7-5 7 5M17 28l7 5 7-5',
};

interface Props {
  readonly glyph: string;
  readonly off?: boolean;
  readonly className?: string;
}

export function Hex({ glyph, off = false, className = 'hex' }: Props) {
  return (
    <svg className={off ? `${className} is-off` : className} aria-hidden="true" focusable="false" viewBox="0 0 48 48">
      <use href="#hex" fill={off ? 'var(--badge-off)' : 'var(--badge-fill)'} />
      <path className="g" d={GLYPHS[glyph] ?? GLYPHS['level']} />
    </svg>
  );
}
