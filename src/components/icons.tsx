import type { ReactElement } from 'react';
import { ICONS, type IconName, type IconPath } from './icons.data';

export { ICONS };
export type { IconName };

interface IconProps {
  paths: readonly IconPath[];
  s?: number;
  c?: string;
  w?: number;
  cls?: string;
}

function Icon({ paths, s = 18, c = 'currentColor', w = 2, cls }: IconProps): ReactElement {
  return (
    <svg
      width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      className={cls}
    >
      {paths.map((d, i) =>
        Array.isArray(d)
          ? // [tag, attrs] — circles and other non-path shapes
            <Shape key={i} tag={d[0]} attrs={d[1]} />
          : <path key={i} d={d} />,
      )}
    </svg>
  );
}

function Shape({ tag, attrs }: { tag: string; attrs: Record<string, number> }): ReactElement {
  const El = tag as 'circle';
  return <El {...attrs} />;
}

/**
 * Icon factory kept as a call, not a component: `Ic('plus', 15)` appears at
 * hundreds of call sites across the screens, and preserving the signature
 * keeps the port mechanical and therefore reviewable.
 */
export function Ic(name: string, s?: number, c?: string, w?: number): ReactElement {
  const paths = (ICONS as Record<string, readonly IconPath[]>)[name] ?? ICONS.file;
  return <Icon paths={paths} s={s} c={c} w={w} />;
}
