import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TERM_BY_ID } from '@/domain/glossary';

/**
 * The small marker beside a term, opening its definition and its formula.
 *
 * It sits on the first place a screen uses a term — a tile label, a column
 * header — not on every cell, because a page of identical markers is noise
 * rather than help.
 *
 * It reads from `@/domain/glossary`, the same list the Glossary screen renders,
 * so the definition here and the definition there cannot disagree.
 */
export function Info({ term }: { term: string }) {
  const entry = TERM_BY_ID[term];
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  // An unknown key renders nothing rather than an empty marker that opens
  // onto a blank panel.
  if (!entry) return null;

  return (
    <span className="info-wrap" ref={box}>
      <button
        type="button"
        className="info-dot"
        aria-expanded={open}
        aria-label={`What is ${entry.name}?`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        i
      </button>
      {open && (
        <span className="info-pop" role="dialog" aria-label={entry.name}>
          <span className="info-name">
            {entry.name}
            {entry.abbr ? <span className="info-abbr">{entry.abbr}</span> : null}
          </span>
          <span className="info-def">{entry.definition}</span>
          {entry.formula ? <span className="formula">{entry.formula}</span> : null}
          <button
            type="button"
            className="info-more"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              void nav(`/glossary?term=${entry.id}`);
            }}
          >
            Full definition and what it feeds →
          </button>
        </span>
      )}
    </span>
  );
}
