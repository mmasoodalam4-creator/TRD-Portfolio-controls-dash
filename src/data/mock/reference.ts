// Corporate-level reference data and lookups.
// Generated from the legacy src/data.js so the demo figures are provably
// unchanged by the migration. Every screen reads from here, which is what
// keeps the numbers consistent across modules.
import type {
  ScurvePoint, ActivityEntry, ReconciliationControl,
  ReportDefinition, NotificationItem, Role,
} from '@/domain/types';
// A VALUE import, so relative and with the extension. The server imports the
// fixtures through `src/data/index.ts`, and the serverless bundler does not
// resolve the `@/` alias — `check:bundle` fails the build on one that needs it
// at runtime, which is exactly how this line was caught.
import { SHIPPED_PORTFOLIOS, type PortfolioRef } from '../../domain/portfolios.js';

/**
 * The four, as names, for the seed.
 *
 * `db/seed.ts` writes this into the `corporate` key/value row the way it
 * always has, so a replay of the seed against an older build still works. The
 * PORTFOLIOS THE APPLICATION READS are rows in their own table since
 * migration 017 — `domain/portfolios.ts` holds what the product ships with,
 * and this is derived from it so the two cannot drift.
 */
export const portfolios: string[] = SHIPPED_PORTFOLIOS.map((p: PortfolioRef) => p.name);

export const months: string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

export const scurve: ScurvePoint[] = [
  {
    "month": "Jan",
    "pv": 600000000,
    "ev": 500000000,
    "ac": 450000000
  },
  {
    "month": "Feb",
    "pv": 1320000000,
    "ev": 1120000000,
    "ac": 1030000000
  },
  {
    "month": "Mar",
    "pv": 2040000000,
    "ev": 1740000000,
    "ac": 1610000000
  },
  {
    "month": "Apr",
    "pv": 2760000000,
    "ev": 2360000000,
    "ac": 2190000000
  },
  {
    "month": "May",
    "pv": 3480000000,
    "ev": 2980000000,
    "ac": 2770000000
  },
  {
    "month": "Jun",
    "pv": 4200000000,
    "ev": 3600000000,
    "ac": 3350000000
  },
  {
    "month": "Jul",
    "pv": 4920000000,
    "ev": 4220000000,
    "ac": 3930000000
  },
  {
    "month": "Aug",
    "pv": 5640000000,
    "ev": 4840000000,
    "ac": 4510000000
  },
  {
    "month": "Sep",
    "pv": 6360000000,
    "ev": null,
    "ac": null
  },
  {
    "month": "Oct",
    "pv": 7080000000,
    "ev": null,
    "ac": null
  },
  {
    "month": "Nov",
    "pv": 7800000000,
    "ev": null,
    "ac": null
  },
  {
    "month": "Dec",
    "pv": 8520000000,
    "ev": null,
    "ac": null
  }
];

export const activities: ActivityEntry[] = [
  {
    "icon": "file",
    "title": "Monthly Report Submitted",
    "sub": "RES-01 Naseem Residences",
    "time": "2h ago"
  },
  {
    "icon": "check",
    "title": "Variation VO-015 Approved",
    "sub": "COM-01 Business Park Tower A",
    "time": "5h ago"
  },
  {
    "icon": "cart",
    "title": "Procurement PO-120 Issued",
    "sub": "MXU-02 Boulevard",
    "time": "1d ago"
  },
  {
    "icon": "alert",
    "title": "New Risk Added",
    "sub": "LND-01 Master Community Infrastructure",
    "time": "1d ago"
  }
];

export const reconciliation: ReconciliationControl[] = [
  {
    "no": 1,
    "name": "WBS Budget vs Control Budget",
    "a": 1180000000,
    "b": 1180000000,
    "result": "OK"
  },
  {
    "no": 2,
    "name": "WBS Cost vs Cost Financials",
    "a": 720000000,
    "b": 720000000,
    "result": "OK"
  },
  {
    "no": 3,
    "name": "Monthly PV vs WBS PV",
    "a": 850000000,
    "b": 850000000,
    "result": "OK"
  },
  {
    "no": 4,
    "name": "Monthly EV vs WBS EV",
    "a": 680000000,
    "b": 680000000,
    "result": "OK"
  },
  {
    "no": 5,
    "name": "Monthly Cost vs Cost Register",
    "a": 720000000,
    "b": 720000000,
    "result": "OK"
  },
  {
    "no": 6,
    "name": "Variations vs Approved Budget",
    "a": 52300000,
    "b": 52300000,
    "result": "OK"
  },
  {
    "no": 7,
    "name": "Procurement vs Commitments",
    "a": 920000000,
    "b": 920000000,
    "result": "OK"
  },
  {
    "no": 8,
    "name": "Workforce Hours vs HSE Exposure Hours",
    "a": 38450,
    "b": 38450,
    "result": "OK"
  },
  {
    "no": 9,
    "name": "Quality Register Reconciliation",
    "a": 245,
    "b": 245,
    "result": "OK"
  },
  {
    "no": 10,
    "name": "Risk / Issue Integrity",
    "a": 28,
    "b": 28,
    "result": "OK"
  }
];

export const reports: ReportDefinition[] = [
  {
    "name": "Executive Summary",
    "icon": "chart"
  },
  {
    "name": "Corporate PMO Report",
    "icon": "building"
  },
  {
    "name": "Portfolio Performance",
    "icon": "grid"
  },
  {
    "name": "Project Performance",
    "icon": "target"
  },
  {
    "name": "Financial Position",
    "icon": "wallet"
  },
  {
    "name": "Cost Report",
    "icon": "coins"
  },
  {
    "name": "Monthly Progress Report",
    "icon": "calendar"
  },
  {
    "name": "Risk Report",
    "icon": "alert"
  },
  {
    "name": "Issues Report",
    "icon": "issue"
  },
  {
    "name": "Variations Report",
    "icon": "edit"
  },
  {
    "name": "Procurement Report",
    "icon": "cart"
  },
  {
    "name": "Quality Report",
    "icon": "check"
  },
  {
    "name": "HSE Report",
    "icon": "shield"
  }
];

export const notifications: NotificationItem[] = [
  {
    "type": "red",
    "title": "AFC exceeds Approved Budget",
    "sub": "RES-02 Rimal Heights",
    "time": "10m"
  },
  {
    "type": "amber",
    "title": "Variation awaiting approval",
    "sub": "VO-014 · RES-01",
    "time": "1h"
  },
  {
    "type": "amber",
    "title": "NCR overdue",
    "sub": "NCR-023 · RES-01",
    "time": "2h"
  },
  {
    "type": "red",
    "title": "SPI dropped below threshold",
    "sub": "LND-02 · SPI 0.87",
    "time": "3h"
  },
  {
    "type": "blue",
    "title": "Monthly update submitted",
    "sub": "MXU-01",
    "time": "5h"
  },
  {
    "type": "amber",
    "title": "Procurement delay",
    "sub": "PR-002 · RES-01",
    "time": "1d"
  }
];

export const roles: Role[] = [
  "Owner Admin",
  "PMO Director",
  "Portfolio Manager",
  "Project Manager",
  "PMC User",
  "Executive Viewer"
];
