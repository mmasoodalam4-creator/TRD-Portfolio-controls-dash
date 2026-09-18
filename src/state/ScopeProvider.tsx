import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Aggregate, Portfolio, Project, Scope, ScopeLevel } from '@/domain/types';
import type { ScopedRegisters } from '@/domain/rollup';
import type { ScopePosition } from '@/domain/position';
import { positionOfProject, positionOfScope } from '@/domain/position';
import { active, agg, scoped } from '@/domain/calc';
import { rollUpRegisters } from '@/domain/rollup';
import type { OperatingMonth } from '@/domain/history';
import { combineHistory, operatingHistory } from '@/domain/history';
import { useCorporate, useProjects, useRegistersFor } from './DataProvider';

const LEVELS: ScopeLevel[] = ['Corporate', 'Portfolio', 'Project'];

interface ScopeContextValue {
  scope: Scope;
  setScope: (next: Scope) => void;
  /** Change one field and let the rest stay consistent with it. */
  updateScope: (patch: Partial<Scope>) => void;
  /** Projects in scope. */
  list: Project[];
  /** The roll-up of those projects. */
  totals: Aggregate;
  /** The single project a project-level screen should show. */
  project: Project;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

const DEFAULT_SCOPE: Scope = { level: 'Corporate', portfolio: 'Residential', project: 'RES-01' };

/**
 * The scope selector's state, held in the URL.
 *
 * Putting it in the query string makes a view shareable — "the cost position
 * for COM-01" is a link, not a sequence of clicks — and it survives a reload.
 * The router is hash-based so this still works when the single-file build is
 * opened straight off the filesystem.
 *
 * This is the only place scope lives. Every roll-up on every screen derives
 * from it plus the project list, which is what stops two screens disagreeing.
 */
export function ScopeProvider({ children }: { children: ReactNode }) {
  const projects = useProjects();
  const [params, setParams] = useSearchParams();

  /**
   * The scope, validated against the developments that actually exist.
   *
   * A bookmarked link names a project id and a portfolio. The day the
   * fixtures are replaced, every such link names something that is not
   * there — and an unknown id used to render a dashboard of zeros with
   * a hundred NaN console errors, while the project screens silently showed
   * RES-01 under the wrong heading. An unknown project now resolves to the
   * first development in the chosen portfolio, an unknown portfolio to the
   * chosen project's own, and the URL is repaired on the next navigation.
   */
  const scope = useMemo<Scope>(() => {
    const level = params.get('level');
    const portfolioParam = params.get('portfolio');
    const projectParam = params.get('project');

    const portfolios = new Set(projects.map((p) => p.portfolio));
    const known = projects.find((p) => p.id === projectParam);
    const portfolio: Portfolio = known
      ? (portfolios.has(portfolioParam as Portfolio) ? (portfolioParam as Portfolio) : known.portfolio)
      : (portfolios.has(portfolioParam as Portfolio) ? (portfolioParam as Portfolio)
        : projects[0]?.portfolio ?? DEFAULT_SCOPE.portfolio);
    const project = known
      ? known.id
      : projects.find((p) => p.portfolio === portfolio)?.id ?? projects[0]?.id ?? DEFAULT_SCOPE.project;

    return {
      level: LEVELS.includes(level as ScopeLevel) ? (level as ScopeLevel) : DEFAULT_SCOPE.level,
      portfolio,
      project,
    };
  }, [params, projects]);

  const setScope = useCallback((next: Scope) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('level', next.level);
      p.set('portfolio', next.portfolio);
      p.set('project', next.project);
      return p;
    }, { replace: true });
  }, [setParams]);

  /**
   * Keep the scope internally consistent.
   *
   * Choosing a portfolio that does not contain the selected project used to
   * leave the two contradicting each other: the dropdown displayed the new
   * portfolio's first project while state still held the old one, so the
   * selector read "Commercial / COM-01" while every screen rendered RES-01.
   * Selecting a portfolio now moves the project into it.
   */
  const updateScope = useCallback((patch: Partial<Scope>) => {
    const next: Scope = { ...scope, ...patch };
    if (patch.portfolio && patch.portfolio !== scope.portfolio) {
      const inPortfolio = projects.filter((p) => p.portfolio === patch.portfolio);
      if (!inPortfolio.some((p) => p.id === next.project)) {
        next.project = inPortfolio[0]?.id ?? next.project;
      }
    }
    setScope(next);
  }, [scope, projects, setScope]);

  const value = useMemo<ScopeContextValue>(() => {
    // WHAT "THE LIST" MEANS DEPENDS ON THE LEVEL, and this is the one place
    // that decides it.
    //
    // At Corporate and Portfolio level the question is "what am I steering?",
    // so a development that has been delivered and closed out is not in it —
    // it cannot move again, and counting it would quietly inflate every
    // portfolio figure on every screen.
    //
    // At Project level the question is "show me THIS development", and the
    // answer is that development whether it is closed or not. Otherwise
    // opening a completed job would show a screen of zeros, which is the
    // opposite of keeping the record readable.
    const inScope = scoped(projects, scope);
    const list = scope.level === 'Project' ? inScope : active(inScope);
    const project = projects.find((p) => p.id === scope.project) ?? projects[0];

    return { scope, setScope, updateScope, list, totals: agg(list, 'as-given'), project };
  }, [scope, projects, setScope, updateScope]);

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const v = useContext(ScopeContext);
  if (!v) throw new Error('useScope must be used inside <ScopeProvider>');
  return v;
}

/**
 * THE REGISTERS OF EVERYTHING IN SCOPE, not of the selected development.
 *
 * Every module read `useRegisters(scope.project)`, which is one development at
 * any level — so Corporate showed one development's variations, claims and
 * non-conformances under a corporate heading. This is the roll-up the sidebar
 * modules were always meant to be: `rollUpRegisters` concatenates the
 * registers that record events, tagging each row with the development it
 * belongs to, and folds the ones that describe a position onto their own key.
 *
 * At Project level it returns that development's own rows, so the workspace,
 * the drill-in and every reconciliation control see exactly what they always
 * did.
 */
export function useScopedRegisters(): ScopedRegisters {
  const { list } = useScope();
  const registersFor = useRegistersFor();
  return useMemo(
    () => rollUpRegisters(list.map((p) => ({
      id: p.id, name: p.name, registers: registersFor(p.id),
    }))),
    [list, registersFor],
  );
}

/**
 * THE POSITION THE SCREEN IS DESCRIBING.
 *
 * The development at Project level, the roll-up of what is in scope above it.
 * Modules read this instead of `useScope().project`, which is one development
 * at every level and is why a Corporate screen used to be headed by RES-02.
 */
export function usePosition(): ScopePosition {
  const { scope, list, totals, project } = useScope();
  return useMemo(
    () => (scope.level === 'Project'
      ? positionOfProject(project)
      : positionOfScope(scope.level, list, totals, scope.portfolio)),
    [scope.level, scope.portfolio, list, totals, project],
  );
}

/**
 * The monthly operating history of everything in scope.
 *
 * One development's own history at Project level, the combination above it —
 * so the trend charts on Quality, HSE, Manpower and Risk describe the same
 * scope as the tiles beside them rather than one development's.
 */
export function useScopedHistory(): OperatingMonth[] {
  const { list } = useScope();
  const registersFor = useRegistersFor();
  const { months, scurve } = useCorporate();
  return useMemo(
    () => combineHistory(list.map((p) => operatingHistory(p, registersFor(p.id), months, scurve))),
    [list, registersFor, months, scurve],
  );
}
