/**
 * Every term the system puts in front of a user, with the calculation behind it.
 *
 * One list, read by two things: the Glossary screen, and the small `Info` dot
 * that sits beside a term where a screen first uses it. They must never drift,
 * which is why the formula shown to a user lives here rather than being
 * retyped into a tooltip — a definition that disagrees with the code is worse
 * than no definition, because it is believed.
 *
 * The formulas are stated the way the code computes them. Where a figure is
 * adopted rather than derived (AFC), that is said plainly.
 */

export type TermGroup = 'Cost' | 'Performance' | 'Commercial' | 'Delivery' | 'Controls';

export const TERM_GROUPS: TermGroup[] = ['Cost', 'Performance', 'Commercial', 'Delivery', 'Controls'];

export interface Term {
  /** Stable key. Used by `Info` and by `#/glossary?term=<id>`. */
  id: string;
  name: string;
  /** Shown as a small tag beside the name. */
  abbr?: string;
  group: TermGroup;
  /** Two or three sentences. What it is, and the thing people get wrong. */
  definition: string;
  /** How the system arrives at it, in the system's own terms. */
  formula?: string;
  /** What it feeds, so the reader can follow the figure onwards. */
  feeds?: string;
}

export const TERMS: Term[] = [
  // ---------------------------------------------------------------- Cost
  {
    id: 'bac',
    name: 'Approved Budget',
    abbr: 'BAC',
    group: 'Cost',
    definition:
      'The sanctioned cost of the development at Board approval — a permission to spend. '
      + 'It is the baseline every variance is measured from and does not move without a formal '
      + 're-baseline. A budget that drifts quietly makes every variance in the system meaningless.',
    formula: 'BAC = original sanction + approved re-baselines',
    feeds: 'Budget Variance · Earned Value · every roll-up',
  },
  {
    id: 'control-budget',
    name: 'Control Budget',
    group: 'Cost',
    definition:
      'The budget the PMO manages to: the approved budget less the contingency the owner holds '
      + 'centrally. It is the working ceiling, deliberately tighter than the approved budget. '
      + 'It is not a smaller approval — the contingency has not been taken away, it is held so that '
      + 'releasing it is a decision somebody signs.',
    formula: 'Control Budget = Approved Budget − contingency held',
    feeds: 'Uncommitted balance · procurement release',
  },
  {
    id: 'contingency',
    name: 'Contingency',
    group: 'Cost',
    definition:
      'Budget held back from the control budget against risk that has not yet materialised. '
      + 'Released deliberately, by decision, rather than absorbed into a package award.',
    formula: 'Contingency = Approved Budget − Control Budget',
    feeds: 'Control Budget · risk response',
  },
  {
    id: 'afc',
    name: 'Anticipated Final Cost',
    abbr: 'AFC',
    group: 'Cost',
    definition:
      'What the development is now expected to cost when it is finished — the adopted position, '
      + 'agreed by the PMO. It is the only one of the four budget figures that moves every period. '
      + 'It is not a budget: if it rises above the approved budget you have a problem to report, '
      + 'not a larger permission. The forecast engine tests the AFC; it does not set it.',
    formula: 'AFC = actual cost + committed remaining + assessed risk + pending variations',
    feeds: 'Budget Variance · Earned Value · forecast divergence',
  },
  {
    id: 'committed',
    name: 'Committed Cost',
    group: 'Cost',
    definition:
      'Value the owner is contractually bound to: awarded contracts plus approved variations. '
      + 'Committing is a decision; paying is a consequence. Committed is not spent — signing a '
      + 'contract commits its full value on day one, and reading that as expenditure makes an '
      + 'on-plan development look badly overrun.',
    formula: 'Committed = Σ awarded package values + Σ approved variations',
    feeds: 'Uncommitted balance · control 18 (packages must sum to it)',
  },
  {
    id: 'actual',
    name: 'Actual Cost',
    abbr: 'AC',
    group: 'Cost',
    definition:
      'Cost incurred to date for work performed, whether or not a certificate has been issued or '
      + 'a payment made.',
    formula: 'AC = Σ period actual cost',
    feeds: 'CPI · Earned Value · control 15 (certified ≤ actual cost)',
  },
  {
    id: 'certified',
    name: 'Certified',
    group: 'Cost',
    definition:
      'The amount approved for payment across issued certificates and approved payment claims. '
      + 'It never exceeds actual cost, because a period covering the work is filed before the '
      + 'certificate for it. Certified is not paid: retention held and approvals awaiting transfer '
      + 'sit between the two.',
    formula: 'Certified = Σ approved payment claims (gross)',
    feeds: 'Retention base · net payable · control 15',
  },
  {
    id: 'paid',
    name: 'Paid',
    group: 'Cost',
    definition:
      'Cash actually released to the counterparty. Always behind certified by the retention held '
      + 'as security and by anything approved but not yet transferred.',
    formula: 'Paid = certified − retention held − approved awaiting payment',
    feeds: 'Cash flow curve · the dashboard payment tile',
  },
  {
    id: 'retention',
    name: 'Retention',
    group: 'Cost',
    definition:
      'A percentage withheld from each approved payment claim and held as security. The rate is a '
      + 'property of that claim, defaulting from the payment terms of the package and editable on '
      + 'every claim, because terms differ between contractors and sometimes between claims. It is '
      + 'released at handover and closeout, as a recorded and approved event.',
    formula: 'Held = Σ (approved claim × claim retention rate) − Σ released',
    feeds: 'Net payable · amount held as security · contractor exposure',
  },
  {
    id: 'variance',
    name: 'Budget Variance',
    abbr: 'VAC',
    group: 'Cost',
    definition:
      'Expected under- or overrun against the approved budget at completion. Positive is '
      + 'favourable to the owner: the development is expected to finish under its sanction.',
    formula: 'Variance = Approved Budget − AFC',
    feeds: 'Portfolio variance · Board reporting · RAG status',
  },
  {
    id: 'uncommitted',
    name: 'Uncommitted Balance',
    group: 'Cost',
    definition:
      'Control budget not yet placed under any contract — what can still be awarded without '
      + 'touching the contingency.',
    formula: 'Uncommitted = Control Budget − Committed Cost',
    feeds: 'Procurement planning · package release',
  },

  // --------------------------------------------------------- Performance
  {
    id: 'pv',
    name: 'Planned Value',
    abbr: 'PV',
    group: 'Performance',
    definition:
      'The budget value of the work the baseline programme said would be complete by the data date.',
    formula: 'PV = BAC × planned % complete',
    feeds: 'SPI · schedule variance',
  },
  {
    id: 'ev',
    name: 'Earned Value',
    abbr: 'EV',
    group: 'Performance',
    definition:
      'The budget value of work actually performed. On the owner’s instruction it is derived so '
      + 'that the realistic forecast lands on the adopted AFC — which is what made the performance '
      + 'indices coherent with the rest of each position. Approved budgets, AFCs, commitments and '
      + 'payments were not altered to achieve it.',
    formula: 'EV = AC × BAC ÷ AFC',
    feeds: 'SPI · CPI · progress · every forecast method',
  },
  {
    id: 'spi',
    name: 'Schedule Performance Index',
    abbr: 'SPI',
    group: 'Performance',
    definition:
      'Below 1.00 means less work has been performed than the baseline planned by now. Derived on '
      + 'read, never taken from a stored field.',
    formula: 'SPI = EV ÷ PV',
    feeds: 'RAG status · evaluation score (schedule criterion)',
  },
  {
    id: 'cpi',
    name: 'Cost Performance Index',
    abbr: 'CPI',
    group: 'Performance',
    definition:
      'Below 1.00 means each riyal spent has bought less budget value than planned. Derived on '
      + 'read, never taken from a stored field.',
    formula: 'CPI = EV ÷ AC',
    feeds: 'Forecast methods · evaluation score (cost criterion)',
  },
  {
    id: 'progress',
    name: 'Progress',
    group: 'Performance',
    definition:
      'Physical completion of a development or a package, expressed as the share of its budget '
      + 'value that has been earned.',
    formula: 'Progress = EV ÷ BAC',
    feeds: 'Package status · portfolio roll-up',
  },
  {
    id: 'etc',
    name: 'Estimate to Complete',
    abbr: 'ETC',
    group: 'Performance',
    definition:
      'The cost still expected to be incurred from the data date to completion.',
    formula: 'ETC = AFC − Actual Cost',
    feeds: 'Cash flow curve · funding profile',
  },
  {
    id: 'forecast',
    name: 'Forecast at Completion',
    group: 'Performance',
    definition:
      'What standard forecasting methods say the development will cost, computed independently of '
      + 'the adopted AFC so that the two can be compared. A wide divergence between the forecast '
      + 'and the AFC is a finding, not a rounding difference.',
    formula: 'Optimistic AC + (BAC − EV) · Realistic AC + (BAC − EV) ÷ CPI · Pessimistic AC + (BAC − EV) ÷ (CPI × SPI)',
    feeds: 'Forecast divergence against the adopted AFC',
  },
  {
    id: 'days-late',
    name: 'Days Late',
    group: 'Performance',
    definition:
      'Calendar days between the baseline finish and the current forecast finish of a package. '
      + 'Positive means later than baseline.',
    formula: 'Days Late = forecast finish − baseline finish',
    feeds: 'Package RAG · schedule reporting',
  },

  // ---------------------------------------------------------- Commercial
  {
    id: 'package',
    name: 'Work Package',
    group: 'Commercial',
    definition:
      'A defined slice of scope with its own budget, programme and — once awarded — its own '
      + 'contractor. A package belongs to exactly one contract, which is what allows package '
      + 'values to be summed against committed cost.',
    formula: 'Package BAC set at baseline; Σ awarded packages = Committed Cost',
    feeds: 'Earned value by package · contractor assignment · control 18',
  },
  {
    id: 'wbs',
    name: 'Work Breakdown Structure',
    abbr: 'WBS',
    group: 'Commercial',
    definition:
      'The numbered decomposition of the development into packages and phases. It is the register '
      + 'the earned value is computed on, so every figure on the cost screens can be traced to a '
      + 'WBS row.',
    feeds: 'Every package figure · reconciliation between register and position',
  },
  {
    id: 'award-value',
    name: 'Award Value',
    group: 'Commercial',
    definition:
      'The value of a contract at award. A package under tender has an estimated value and a place '
      + 'in the AFC, but contributes nothing to committed cost, because nobody has been promised '
      + 'anything yet.',
    formula: 'Committed contribution = award value, but only once awarded',
    feeds: 'Committed Cost · control 18',
  },
  {
    id: 'claim',
    name: 'Payment Claim',
    group: 'Commercial',
    definition:
      'An invoice raised by a contractor on delivery of a milestone. It is verified by the '
      + 'consultant, then approved by Tazayud, and retention is withheld from the approved amount. '
      + 'A claim moves certified and paid; earned value and actual cost come from the reporting '
      + 'period, not from the claim.',
    formula: 'Net payable = approved amount − (approved amount × retention rate)',
    feeds: 'Certified · retention held · paid',
  },
  {
    id: 'milestone',
    name: 'Milestone',
    group: 'Commercial',
    definition:
      'The deliverable a payment claim is raised against. Payment is milestone-based rather than '
      + 'monthly, so a claim names the milestone it covers.',
    feeds: 'Payment claims · package progress',
  },
  {
    id: 'verification',
    name: 'Consultant Verification',
    group: 'Commercial',
    definition:
      'The consultant’s check of a claim before Tazayud approves it: what was claimed, what is '
      + 'measured as delivered, and the reference of the verification. It is recorded as a fact '
      + 'with a date and a reference, so a claim sitting unverified for six weeks is visible '
      + 'rather than discovered.',
    formula: 'Claim accuracy = approved amount ÷ claimed amount',
    feeds: 'Claim pipeline · evaluation score (claim accuracy, turnaround)',
  },
  {
    id: 'variation',
    name: 'Variation Order',
    group: 'Commercial',
    definition:
      'An approved change to a contract’s scope and value. Approval moves committed cost and, '
      + 'through it, the AFC.',
    formula: 'Committed += approved variation value',
    feeds: 'Committed Cost · AFC · package budget',
  },
  {
    id: 'change-request',
    name: 'Change Request',
    group: 'Commercial',
    definition:
      'A proposed change upstream of a variation. It carries an assessed cost impact but changes '
      + 'nothing until it becomes an approved variation.',
    feeds: 'Variation orders · pending cost impact in the AFC',
  },

  // ------------------------------------------------------------ Delivery
  {
    id: 'period',
    name: 'Reporting Period',
    group: 'Delivery',
    definition:
      'One month of progress, cost and programme, filed by the project manager, validated by the '
      + 'portfolio manager and approved by the director. Approval is what publishes it: an '
      + 'unapproved period reaches no dashboard.',
    feeds: 'Actual cost · progress · every derived figure',
  },
  {
    id: 'rag',
    name: 'RAG Status',
    group: 'Delivery',
    definition:
      'Red, amber or green against thresholds on the performance indices and schedule slippage. '
      + 'A status, not a judgement — it is computed, so it cannot be talked out of.',
    feeds: 'Package and development status · escalation',
  },
  {
    id: 'exposure',
    name: 'Risk Exposure',
    group: 'Delivery',
    definition:
      'The cost-weighted size of a risk: what it would add if it happened, weighted by how likely '
      + 'it is. Exposure is what the register is sorted by, because the largest risk is rarely the '
      + 'most likely one.',
    formula: 'Exposure = impact value × likelihood',
    feeds: 'Risk register order · assessed risk inside the AFC',
  },
  {
    id: 'risk-band',
    name: 'Risk Level',
    group: 'Delivery',
    definition:
      'The band a risk score falls in, on the owner\u2019s confirmed scale. The level is DERIVED '
      + 'from the score and never read from the register: several rows were authored with a level '
      + 'that contradicts their own score, and a screen that showed the stored one would disagree '
      + 'with the number printed beside it.',
    formula: 'Score 1\u20133 low · 4\u20136 low-medium · 8\u201312 medium · 15\u201325 high',
    feeds: 'Risk register level column · matrix colour · high-risk counts',
  },
  {
    id: 'ncr',
    name: 'Non-Conformance',
    abbr: 'NCR',
    group: 'Delivery',
    definition:
      'Recorded work that does not meet specification, raised against a package and its '
      + 'contractor, and closed when corrected.',
    feeds: 'Quality reporting · evaluation score (quality criterion)',
  },
  {
    id: 'utilisation',
    name: 'Utilisation',
    group: 'Delivery',
    definition:
      'The share of available manpower or plant actually deployed. Manpower and equipment are '
      + 'tracked as availability and utilisation only — this system holds no rates for either.',
    formula: 'Utilisation = deployed ÷ available',
    feeds: 'Manpower and equipment reporting',
  },

  // ------------------------------------------------------------ Controls
  {
    id: 'reconciliation-control',
    name: 'Reconciliation Control',
    group: 'Controls',
    definition:
      'One of the checks run against a candidate position before any write is accepted. A failing '
      + 'control refuses the write; it does not warn. The controls run on the server, before the '
      + 'database is touched — the browser runs the same checks only to show the person what is '
      + 'wrong while they are still typing.',
    formula: 'Applied to the candidate state; any failure returns a refusal, not a warning',
    feeds: 'Every mutation in the system',
  },
  {
    id: 'separation-of-duties',
    name: 'Separation of Duties',
    group: 'Controls',
    definition:
      'The submitter of a period can never be its reviewer or its approver, and the reviewer can '
      + 'never be the approver. The rule lives in the database as a trigger, not in the '
      + 'application, so it holds even for a script or a hand-run migration. The administrator is '
      + 'exempt by instruction, and that exemption is never silent: the same name appears at two '
      + 'stages of the approval trail.',
    feeds: 'Period submissions · claim approval · project registration',
  },
  {
    id: 'audit-log',
    name: 'Change Log',
    group: 'Controls',
    definition:
      'Every change to data, recorded with who made it, when, and what it was. An account that has '
      + 'acted is withdrawn rather than deleted, so the trail never names somebody who does not '
      + 'exist.',
    feeds: 'Administration · audit trail',
  },
];

/** Terms by id, for the `Info` dot and for `#/glossary?term=<id>`. */
export const TERM_BY_ID: Record<string, Term> = Object.fromEntries(
  TERMS.map((t) => [t.id, t]),
);

/** Free-text search across name, abbreviation and definition. */
export function searchTerms(query: string): Term[] {
  const q = query.trim().toLowerCase();
  if (!q) return TERMS;
  return TERMS.filter((t) => (
    t.name.toLowerCase().includes(q)
    || (t.abbr ?? '').toLowerCase().includes(q)
    || t.definition.toLowerCase().includes(q)
    || (t.formula ?? '').toLowerCase().includes(q)
  ));
}
