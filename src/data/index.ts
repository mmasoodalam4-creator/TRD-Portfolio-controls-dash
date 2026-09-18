// Single source of truth for the demo.
//
// Every screen reads from here, which is what keeps the figures consistent
// across modules — the property the integrity engine exists to prove.
//
// Reached through the repository in src/data/repository.ts; screens do not
// import this directly, so replacing the fixtures with an API is a change to
// one file.
import {
  projects, portfolios, wbs, costCategories, variations, changes, procurement, claims,
  manpower, equipment, ncrs, risks, issues, scurve, months, activities,
  reconciliation, reports, notifications, roles,
} from './mock/index.js';

export const DB = {
  projects,
  portfolios,
  wbs,
  costCategories,
  variations,
  changes,
  procurement,
  claims,
  manpower,
  equipment,
  ncrs,
  risks,
  issues,
  scurve,
  months,
  activities,
  reconciliation,
  reports,
  notifications,
  roles,
} as const;

export type Database = typeof DB;
