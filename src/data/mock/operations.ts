import type { Incident, Observation, HseInspection, MaterialApproval } from '@/domain/types';

// ==========================================================================
// THE AUTHORED OPERATIONAL FIXTURES
//
// Four registers that cannot be derived from anything the system already
// holds, because they record events rather than restate a position: what went
// wrong on site, what somebody saw, what an inspection found, and what a
// supplier submitted. They are written for RES-01 and scaled to the other
// seven by `deriveIncidents` and friends.
//
// EVERYTHING ELSE IN THE OPERATIONAL SET IS DERIVED, not authored — corrective
// actions from the non-conformances, mitigations from the risks, training from
// the trades on site, maintenance from the equipment register, the tender
// pipeline from the packages that are not awarded, and quality inspections
// from the non-conformances they raised. Authoring those beside their source
// is how two registers come to disagree about the same fact.
//
// DUMMY-PHASE DATA, on the owner's instruction and of the same kind as the
// rest of the fixtures. It is replaced by what people actually record.
// ==========================================================================

export const incidents: Incident[] = [
  {
    id: 'INC-042',
    date: '24 Aug 2026',
    classification: 'Near Miss',
    severity: 'Low',
    location: 'Zone A — Level 12',
    what: 'Falling object from a scaffold platform; no injury',
    daysLost: 0,
    status: 'Closed',
    investigatedBy: 'Ali Raza',
  },
  {
    id: 'INC-041',
    date: '17 Aug 2026',
    classification: 'First Aid Case',
    severity: 'Low',
    location: 'Basement 2',
    what: 'Minor laceration to the hand during formwork strike',
    daysLost: 0,
    status: 'Closed',
    investigatedBy: 'Sajid Ahmed',
  },
  {
    id: 'INC-040',
    date: '10 Aug 2026',
    classification: 'Med. Treatment Case',
    severity: 'Medium',
    location: 'Zone B — access route',
    what: 'Ankle sprain on an uneven temporary access route',
    daysLost: 3,
    status: 'Under Review',
    investigatedBy: 'Naveed Ali',
  },
  {
    id: 'INC-039',
    date: '02 Aug 2026',
    classification: 'Restricted Work Case',
    severity: 'Medium',
    location: 'Store Yard',
    what: 'Back strain lifting material manually',
    daysLost: 5,
    status: 'Closed',
    investigatedBy: 'Rashid Khan',
  },
  {
    id: 'INC-038',
    date: '29 Jul 2026',
    classification: 'Near Miss',
    severity: 'Low',
    location: 'Tower Crane TC-01',
    what: 'Load swing close to an occupied area; the lift was halted',
    daysLost: 0,
    status: 'Closed',
    investigatedBy: 'Ahmed Khan',
  },
];

export const observations: Observation[] = [
  {
    id: 'OBS-156',
    date: '29 Aug 2026',
    category: 'PPE',
    type: 'Unsafe Act',
    location: 'Electrical Room — Zone C',
    what: 'Operative working without arc-flash gloves',
    raisedBy: 'HSE Officer',
    status: 'Open',
  },
  {
    id: 'OBS-155',
    date: '28 Aug 2026',
    category: 'Housekeeping',
    type: 'Unsafe Condition',
    location: 'Level 7 — corridor',
    what: 'Material stored in an escape route',
    raisedBy: 'PMC HSE',
    status: 'Closed',
  },
  {
    id: 'OBS-154',
    date: '27 Aug 2026',
    category: 'Work at Height',
    type: 'Unsafe Condition',
    location: 'Main Tower — Zone A',
    what: 'Guardrail missing at a leading edge',
    raisedBy: 'HSE Officer',
    status: 'Open',
  },
  {
    id: 'OBS-153',
    date: '25 Aug 2026',
    category: 'Good Practice',
    type: 'Safe Act',
    location: 'Batching Plant',
    what: 'Exclusion zone correctly set before the pour',
    raisedBy: 'PMC HSE',
    status: 'Closed',
  },
  {
    id: 'OBS-152',
    date: '23 Aug 2026',
    category: 'Electrical',
    type: 'Unsafe Condition',
    location: 'Basement 2',
    what: 'Damaged extension lead in use',
    raisedBy: 'HSE Officer',
    status: 'Closed',
  },
];

export const hseInspections: HseInspection[] = [
  {
    id: 'HSI-048',
    date: '28 Aug 2026',
    area: 'Work at Height',
    location: 'Main Tower — Zone A',
    result: 'Major NC',
    findings: 3,
    inspector: 'Ahmed Khan',
  },
  {
    id: 'HSI-047',
    date: '27 Aug 2026',
    area: 'Scaffolding',
    location: 'Zone B',
    result: 'Compliant',
    findings: 0,
    inspector: 'Ahmed Khan',
  },
  {
    id: 'HSI-046',
    date: '25 Aug 2026',
    area: 'Electrical Safety',
    location: 'Basement 2',
    result: 'Minor NC',
    findings: 2,
    inspector: 'Naveed Ali',
  },
  {
    id: 'HSI-045',
    date: '23 Aug 2026',
    area: 'Lifting Operations',
    location: 'Zone A',
    result: 'Compliant',
    findings: 0,
    inspector: 'Ahmed Khan',
  },
  {
    id: 'HSI-044',
    date: '20 Aug 2026',
    area: 'Fire & Emergency',
    location: 'Site-wide',
    result: 'Minor NC',
    findings: 1,
    inspector: 'Naveed Ali',
  },
];

export const materialApprovals: MaterialApproval[] = [
  {
    id: 'MA-118',
    material: 'Ready-mix concrete C50/60',
    supplier: 'Al Rajhi Ready Mix',
    submitted: '28 Aug 2026',
    decision: 'Approved',
    decided: '31 Aug 2026',
  },
  {
    id: 'MA-117',
    material: 'Aluminium curtain wall system',
    supplier: 'AluTech Facades',
    submitted: '24 Aug 2026',
    decision: 'Approved with comments',
    decided: '27 Aug 2026',
  },
  {
    id: 'MA-116',
    material: 'Floor tile — lobby',
    supplier: 'Ideal Standard',
    submitted: '20 Aug 2026',
    decision: 'Rejected',
    decided: '23 Aug 2026',
  },
  {
    id: 'MA-115',
    material: 'MEP cable tray and support',
    supplier: 'Electro Mechanical Co.',
    submitted: '16 Aug 2026',
    decision: 'Approved',
    decided: '19 Aug 2026',
  },
  {
    id: 'MA-114',
    material: 'Waterproofing membrane',
    supplier: 'BuildTech Co.',
    submitted: '11 Aug 2026',
    decision: 'Under Review',
    decided: null,
  },
];
