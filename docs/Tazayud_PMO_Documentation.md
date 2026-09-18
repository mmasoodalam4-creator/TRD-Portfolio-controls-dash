# Tazayud Owner PMO — Integrated Portfolio & Project Controls System
### Complete Project Documentation

**Document version:** 1.0
**Workbook version:** Integrated, testing phase (protection removed)
**Owner:** Strategy Management Office (SMO) / Owner PMO, Tazayud Real Estate Development
**File:** `Tazayud_Owner_PMO_Integrated_Controls_System.xlsm`
**Scale:** 29 sheets · ~9,180 live formulas · 4 portfolios · 8 projects · zero calculation errors

---

## 1. What this project is

Tazayud Real Estate Development is a **real-estate developer, owner and operator** — **not a contractor**. It delivers its buildings and land developments in one of two ways:

- **PMC-Delivered** — through an appointed **Project Management Consultant (PMC)** who administers the contracts and certifies the contractors' work on Tazayud's behalf, or
- **Self-Execution** — through Tazayud's own internal project managers and PMO delivery teams.

Either way, the physical works are carried out by **contractors**. This single fact drives the entire commercial logic of the workbook:

> **Every contract value in this system is a COST committed to a contractor — never revenue.**
> When Tazayud awards a package, it *spends* budget; it does not *earn* income.

The workbook is the Owner PMO's **single source of truth** for monitoring and controlling that spend across the whole development portfolio: schedule, cost, earned value, variations, procurement, resources, quality, HSE, risk and issues — rolled up from individual projects to portfolios to the corporate view, and re-cuttable to any of those levels on demand.

### The four portfolios

| # | Portfolio | Example projects in the workbook |
|---|-----------|----------------------------------|
| 1 | **Residential** | RES-01 Riyadh Residences (Towers B & C), RES-02 Buraydah Compound Phase 2 |
| 2 | **Commercial** | COM-01 Business Park Tower A, COM-02 Commercial Offices Block B |
| 3 | **Mixed Use** | MXU-01 Mixed-Use District, MXU-02 Boulevard (Hospitality/Retail) |
| 4 | **Land Development** | LND-01 Master Community Infrastructure, LND-02 Utility & Road Network |

*(All figures in the workbook are illustrative sample data — replace with live data before issuing.)*

---

## 2. Where we started vs. where we are

### The starting point
The project began as a **single-project contractor-style PMO controls tracker** — one project, contractor terminology (contract value = revenue, gross profit margin, EAC), a single dashboard.

### The journey (in order)

1. **Multi-project consolidation.** Rebuilt the data model for **4 portfolios × 8 projects** with a **scope-filter engine** — one selector re-cuts the entire workbook to corporate, portfolio or single-project view. Added the Master Tracker, 10 reconciliation controls, S-curves, earned-schedule and regression analytics.

2. **Owner/developer reframing (round 1).** The reviewing team clarified Tazayud is a developer, not a contractor. Reframed every commercial term: contract value → **Approved Development Budget** (a cost sanction), gross margin → **budget headroom**, EAC → **Anticipated Final Cost (AFC)**, IPC certified/paid → **contractor payments out**, and split delivery into PMC-Delivered vs Self-Execution routes.

3. **Financial-position refinement (round 2).** Renamed Section 2 to **"Financial Position"**, replaced the headroom tile with **Contractor Payments Made to Date** (and fixed a percentage-format bug that showed `8534302900%`), removed gross-margin/headroom language entirely in favour of a **Budget Variance** view, reordered Change Log before Variation Orders, renamed portfolios to the final four, stripped rate/cost detail out of the Manpower register (availability & utilisation only), and built the **project templates**.

4. **IPC logic fix.** Corrected a placeholder that computed "IPC Submitted" as a fixed 1.18× of certified — made it a proper per-project input reflecting the real contractor→PMC→owner certification flow.

5. **Full integration.** Linked every consolidated register **live** to the project templates so nothing is typed in the consolidated sheets. Added a **three-colour cell system**, protection/locking with a password, a **colour legend**, and **Add/Remove Project** buttons (macro + manual fallback). Produced the setup guide.

6. **Corruption fix.** The `.xlsm` was reported corrupt — caused by a plain-workbook content-type inside a macro-enabled container. Patched the OOXML content-type so Excel opens it cleanly.

7. **Macro & integration fixes (this round).** Fixed six reported issues: new projects now appear in the **dashboard dropdown** and **Master Tracker**; **portfolio, ID and name** now populate correctly in the consolidated Projects sheet; **Remove** now clears every sheet and dropdown; portfolio selection and project-removal are now **dropdowns** (via on-sheet input panels), not typed. Also fixed two real structural bugs found in testing (RANK ranges and blank-template zeros) and switched the macro to an **insert-within-range** strategy so summary totals auto-extend. Removed all protection for the testing phase.

### Net result
A fully integrated, self-consistent, colour-coded controls system where project managers fill their own template and the entire corporate dashboard updates automatically — with a one-click (macro) or documented-manual way to add or remove projects.

---

## 3. What we fixed (issue-by-issue log)

| # | Issue reported | Root cause | Fix applied |
|---|----------------|-----------|-------------|
| 1 | Contractor-style tracker for an owner-developer | Terminology inherited from contractor PMO | Reframed all commercial terms to owner/developer language |
| 2 | `8534302900%` in the payments tile | A SAR value formatted as a percentage | Re-pointed tile to Contractor Payments Made to Date, fixed number format |
| 3 | Gross margin / headroom not wanted | Not relevant to Tazayud's PMO scope | Replaced with a SAR-only **Budget Variance** view everywhere |
| 4 | IPC Submitted = 1.18 × certified | Lazy placeholder ratio | Made IPC Submitted a proper per-project input |
| 5 | Manual entry risk in consolidated sheets | Registers held raw data as inputs | **Linked every register cell** to the project templates |
| 6 | File reported corrupt | Plain-workbook content-type in an `.xlsm` shell | Patched OOXML content-type to macro-enabled |
| 7 | New project missing from dashboard dropdown | Dropdown used a hardcoded inline list | Dropdowns now read dynamic named ranges (`ProjectIDs`, `PortfolioList`) |
| 8 | New project missing from Master Tracker | Fixed 8-row block that didn't grow | Macro clones a Master Tracker row within the block |
| 9 | Wrong portfolio / blank ID & name in Projects | Name/portfolio were hardcoded, not linked | Linked Projects B/C/D/E to the template identity cells |
| 10 | Remove left data behind | Block detection / partial coverage | Remove now walks every register + Master Tracker + dropdowns |
| 11 | Portfolio & project typed manually | `InputBox` can't show a dropdown | Added on-sheet **Add/Remove input panels** with real dropdowns |
| 12 | (found in testing) `#N/A` on new rows | RANK ranges fixed to the old block end | Widened RANK ranges to a generous bound |
| 13 | (found in testing) `#VALUE!` on empty project | Blank template numeric cells | Seeded 103 template input cells with 0 |

---

## 4. What each sheet does

The workbook has **29 sheets** in four groups: the front end, the consolidated engine, the analytics, and the per-project templates plus helpers.

### Group A — Front end

| Sheet | Purpose | Manual entry? |
|-------|---------|---------------|
| **1. Dashboard** | The high-level view. Scope selector (Corporate / Portfolio / Project), KPI tiles (% complete, SPI, CPI, composite health), the **Financial Position** band (Approved Development Budget, Control Budget, Anticipated Final Cost, **Contractor Payments Made to Date**), six charts (S-curve, SPI/CPI trend, monthly PV/EV/cost, cost-category bars, portfolio and project comparisons), register snapshot, top exposures, and the assurance conclusion. Also hosts the **Add/Remove Project** input panels and buttons. | Only the scope selector + Add/Remove panels |
| **2. Instructions** | How the workbook works: the scope selector, the **three-colour cell legend**, the sheet map, the monthly update routine, definitions, and assumptions. | No |

### Group B — Consolidated engine (all linked from templates)

| Sheet | Purpose | Data source |
|-------|---------|-------------|
| **3. Projects** | The register of the 8 developments — ID, name, portfolio, delivery route, PMC/PM, dates, approved budget, control budget, IPC position, and every rolled-up EV metric. | **Linked** from templates |
| **4. Master_Tracker** | The integrated control heart. Consolidated position for the selected scope, the live control panel (one row per control domain, each sourced from one register), portfolio summary, project summary, and the **10 data-integrity reconciliation controls** that must all read OK before issuing. | Calculated (no inputs) |
| **5. WBS_Register** | 72 contract/work packages (9 per project) — budget, planned %, actual %, cost incurred, committed, PV, EV, SPI, CPI, status. The earned-value engine. | **Linked** from templates |
| **6. Cost_Financials** | Development cost control — approved budget vs cost vs commitment, four **AFC** forecast methods, **Budget Variance**, capital-deployment/cash position, and the cost-category register (10 owner cost categories). | **Linked** from templates |
| **7. Change_Log** | Change requests upstream of variations — impact assessment, delegated authority, decision status. (Deliberately placed **before** Variation Orders.) | **Linked** from templates |
| **8. Variation_Orders** | Contractor variations — budget uplift, contract-award impact, time impact, status. Only *Approved* variations move the budget. | **Linked** from templates |
| **9. Procurement_Register** | Contract award & procurement — tender → award → completion dates, award value, committed, delivery performance. | **Linked** from templates |
| **10. Manpower_Register** | Contractor & PMC workforce — headcount, availability, attended vs productive man-hours, **utilisation** (no rates or cost — resource control only). | **Linked** from templates |
| **11. Equipment_Register** | Contractor plant — deployment, availability, utilisation, indicative cost exposure (monitored, not paid directly). | **Linked** from templates |
| **12. Quality_Register** | Inspection performance (WIR/MIR), first-time-right rate, NCR log, rework cost. | **Linked** from templates |
| **13. HSE_Register** | Contractor HSE — exposure hours, TRIR, LTIFR, observations, training compliance, incident log. | **Linked** from templates |
| **14. Risk_Register** | Risks retained by the developer — probability × impact, inherent and residual score, **expected monetary value (EMV)**, mitigation. | **Linked** from templates |
| **15. Issues_Register** | Live issues escalated by the PMC/contractors — priority, cost/schedule impact, ageing. | **Linked** from templates |

### Group C — Analytics (fully derived)

| Sheet | Purpose |
|-------|---------|
| **16. Performance_Indices** | 18 performance indices (SPI, CPI, earned-schedule, quality, HSE, procurement, workforce, plant, budget-variance, etc.) rolled into one **weighted Composite Project Health Index**. |
| **17. Monthly_Trend** | The only place time-phased money lives — 24 periods × 8 projects of PV, EV, cost, certified value and man-hours. |
| **18. Cumulative_Trend** | Scope-filtered cumulative S-curves, actual-to-date then forecast, plus **earned schedule** and SPI(t). |
| **19. Regression_Analysis** | Six least-squares models and a six-method AFC triangulation — a second, independent forecast view. |

### Group D — Templates & helpers

| Sheet | Purpose | Visible? |
|-------|---------|----------|
| **20–27. PT_RES-01 … PT_LND-02** | One **project data template per project** — the *only* sheets a project manager fills. Sections mirror the consolidated engine one-to-one: identity, budget, earned value, WBS, cost categories, variations/change, contract awards, workforce, quality/HSE, risk/issues. | Visible |
| **28. Lists** | Hidden helper — the dynamic list of project IDs and the four portfolio names that the dropdowns read from. | Hidden |
| **29. PT_TEMPLATE** | Hidden blank template — the master the Add-Project macro copies. Numeric inputs pre-seeded with 0. | Hidden |

---

## 5. Key features

### 5.1 The scope-filter engine
Three cells on the Dashboard (Scope Level / Portfolio / Project) drive the whole workbook. Every register carries an **In-Scope flag** (1/0) derived from those cells, and every consolidated figure is a `SUMPRODUCT` against that flag. Switch to a portfolio or a single project and every KPI, chart, index, curve and regression re-cuts instantly. Two things deliberately ignore the selector: the portfolio/project comparison tables (so context is never lost) and the 10 reconciliation controls (which always test all projects).

### 5.2 Single source of truth (full integration)
Project managers fill only their template. Every data cell in every consolidated register is a **live link** back to a template. The flow is one-way and unbreakable:
`Project template → consolidated register → Master Tracker → Dashboard.`

### 5.3 Three-colour cell system
- **Cream** — manual entry (templates only)
- **White** — in-sheet formula
- **Pale blue** — linked from a project sheet
- **Navy** — header / total (structural)

A legend is printed on the Instructions sheet.

### 5.4 Ten reconciliation controls
Corporate-wide integrity checks on the Master Tracker (e.g. WBS budget = control budget; WBS cost = cost-category cost; monthly cumulative = WBS roll-up; workforce hours = HSE exposure hours). **All must read OK before a report is issued** — a FAIL means two sheets disagree.

### 5.5 Owner-correct commercials
No revenue, no gross margin. Contract awards are cost; the commercial control is **Budget Variance** (Approved Development Budget − Anticipated Final Cost) in SAR. Contractor plant and labour sit inside the contract rates and are monitored for productivity, not carried as owner cost lines. Only PMC/owner fees are a direct cost category.

### 5.6 Add / Remove Project automation
On-sheet input panels with **dropdowns** (portfolio; project-to-remove) feed two macros that create a new template, insert a linked block into every register and the Master Tracker, refresh the dropdown list — or reverse all of it. A documented **manual fallback** does the same without macros for locked-down environments.

### 5.7 Analytics depth
Earned-value **and** earned-schedule (SPI(t) that stays honest late in a project), six-method AFC triangulation, six regression models, and an 18-index composite health score.

---

## 6. Known limitations & future additions

### Current limitations (by design, for the testing phase)
- **Protection is currently OFF** — all sheets unlocked for testing. Re-enable before go-live (password `Tazayud#PMO2026`).
- **The Add/Remove macro is provided but not Excel-verified** — it was validated as far as a non-Excel environment allows. Test on a saved copy first.
- Fixed rows-per-project per register (9 WBS, 11 cost categories, etc.). Projects with more packages need the block sizes adjusted.
- Roll-ups are simple sums — no joint-venture share, currency weighting or inter-company elimination.

### Recommended future additions
1. **Gross Development Value (GDV) & development margin.** Add GDV per project on the template; the workbook can then show true development margin (revenue side) alongside cost control. The structure already anticipates this.
2. **Cash-flow forecasting & S-curve funding profile** at portfolio level, with drawdown scheduling.
3. **Baseline vs current vs forecast versioning** — snapshot each period to trend the movement of the baseline itself.
4. **Automated period roll-forward** — a macro to advance the data date and open the next reporting period.
5. **Power BI / live dashboard** layer reading the same templates for executive distribution.
6. **Document links** — hyperlink each variation, NCR and risk to its supporting file/DMS record.
7. **Approval workflow** — status-driven sign-off gates on variations and change requests.
8. **Dynamic block sizing** — let the Add-Project macro ask how many packages a project has and size its register blocks accordingly.
9. **Automated integrity email** — a macro that emails the PMO if any reconciliation control reads FAIL.
10. **Re-lock & audit trail** — protection auto-restore plus a change log of who edited which template and when.

---

## 7. Files delivered

| File | What it is |
|------|-----------|
| `Tazayud_Owner_PMO_Integrated_Controls_System.xlsm` | The integrated workbook (29 sheets, macro-enabled). |
| `Tazayud_PMO_Macros.bas` | The complete VBA for Add/Remove Project — import once via the VBA editor. |
| `Tazayud_PMO_Setup_Guide.docx` | Step-by-step setup, colour system, password, macro install, manual fallback. |
| `Tazayud_PMO_Documentation.md` | This document. |
| `Tazayud_PMO_NewChat_Handoff.md` | Instructions to resume this project in a fresh chat/account. |

---

## 8. Quick reference

| Item | Value |
|------|-------|
| Protection password | `Tazayud#PMO2026` |
| Sheets that accept typing | Project templates (`PT_`) only, cream cells only |
| Corporate approved budget (sample) | SAR 991,228,356 |
| Reporting calendar | Apr 2026 → Mar 2028 (24 periods), data date 31 Aug 2026 |
| Reconciliation controls | 10, on Master_Tracker §6, must all read OK |
| Named ranges | `ProjectIDs`, `PortfolioList` |
| Add/Remove panels | Projects sheet (Add rows 24–25, Remove rows 27–28) |

*End of documentation.*
