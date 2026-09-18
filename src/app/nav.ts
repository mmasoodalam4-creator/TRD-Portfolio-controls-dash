import type { SeatCapabilities } from '@/domain/seats';
import type { PageId } from './types';

/**
 * Sidebar modules, in order.
 *
 * Two routed screens are deliberately NOT here. `overview` is reached from
 * Projects. `messages` is reached from the speech-bubble button in the top
 * bar, which carries the unread count and is visible from every screen — the
 * sidebar is the list of things the portfolio is made of, and a conversation
 * is not one of them. The route still exists, so a link to it still works.
 *
 * `needs` says which CAPABILITY opens a module. Absent means everyone. It is
 * NOT the enforcement — the server refuses on its own, and each of these
 * screens refuses too — but a module a person cannot use has no business in
 * their sidebar: an executive viewer offered a data-entry form learns nothing
 * from the refusal except that the system does not know who they are.
 *
 * A PREDICATE OVER FLAGS, never a list of seat names. Seats are rows an
 * administrator edits (migration 015): a list would have hidden every module
 * from a seat defined this morning, and would have gone on showing them to one
 * whose flags were taken away this afternoon.
 */
export const NAV: {
  id: PageId; label: string; icon: string; needs?: (can: SeatCapabilities) => boolean;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'projects', label: 'Projects', icon: 'projects' },
  // ONE DEVELOPMENT, EVERY MODULE, EVERY MONTH. It replaced Period Entry in
  // this list because entering a period is one tab of it, and a sidebar that
  // offered both taught people the two were different things. The `period`
  // route still exists, so every link to it still works.
  //
  // No `roles`: the workspace itself refuses nobody. Each module inside it is
  // offered by the same rule the sidebar uses, and each screen refuses on its
  // own — an executive viewer sees the registers and not the entry form.
  { id: 'workspace', label: 'Project Workspace', icon: 'edit' },
  // A contributor sees this one too: they need to know whether what they
  // filed was validated or returned. What they cannot do is act on it.
  { id: 'submissions', label: 'Review & Approve', icon: 'check',
    needs: (c) => c.input || c.review || c.approve || c.administer },
  // WHAT IS WAITING ON SOMEBODY. The seat that proposes needs to see its own
  // proposals and the seat that authorises needs to decide them, so both are
  // here — a queue only one half of a two-person control can see is a queue
  // the other half has to be told about by email.
  { id: 'authorisations', label: 'Authorisations', icon: 'shield2',
    needs: (c) => c.approve || c.authorise || c.administer },
  { id: 'wbs', label: 'WBS', icon: 'wbs' },
  { id: 'cost', label: 'Cost & Financials', icon: 'cost' },
  { id: 'variations', label: 'Variations', icon: 'variations' },
  { id: 'change', label: 'Change Log', icon: 'change' },
  { id: 'procurement', label: 'Packages & Contracts', icon: 'procurement' },
  { id: 'claims', label: 'Payment Claims', icon: 'coins' },
  // Commercially sensitive: reviewer and above only, on the owner's
  // instruction. The screen refuses as well, so a typed URL gets nowhere.
  { id: 'evaluation', label: 'Evaluation', icon: 'target',
    needs: (c) => c.review || c.approve || c.authorise || c.administer },
  { id: 'manpower', label: 'Manpower', icon: 'manpower' },
  { id: 'equipment', label: 'Equipment', icon: 'equipment' },
  { id: 'quality', label: 'Quality', icon: 'quality' },
  { id: 'hse', label: 'HSE', icon: 'hse' },
  { id: 'risk', label: 'Risk', icon: 'risk' },
  { id: 'issues', label: 'Issues', icon: 'issues' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  { id: 'documents', label: 'Documents', icon: 'documents' },
  { id: 'glossary', label: 'Glossary', icon: 'help' },
  { id: 'admin', label: 'Administration', icon: 'admin' },
];

/** Page heading and subheading, keyed by module. */
export const TITLES: Record<PageId, [string, string]> = {
  dashboard: ['Executive Dashboard', 'Portfolio-wide performance at a glance'],
  projects: ['Projects', 'All developments across the four portfolios'],
  overview: ['Project Overview', 'Single-project control view'],
  period: ['Reporting Period Entry', 'File a period from the project data template'],
  workspace: ['Project Workspace', 'One development — every module, every month, in one place'],
  submissions: ['Review & Approve', 'Validate and sign off filed reporting periods'],
  authorisations: ['Authorisations', 'Changes to a development, proposed and waiting on the Director'],
  messages: ['Messages', 'Direct conversations with the people who report, review and approve'],
  wbs: ['Work Breakdown Structure', 'Earned-value by work package'],
  cost: ['Cost & Financials', 'Development cost control and forecast'],
  variations: ['Variation Orders', 'Contractor variations and budget impact'],
  change: ['Change Log', 'Change requests upstream of variations'],
  procurement: ['Packages & Contracts', 'Contract packages, the counterparty holding each, and what is committed'],
  claims: ['Payment Claims', 'Claims raised, verified, approved and paid, and the retention held as security'],
  evaluation: ['Counterparty Evaluation', 'Contractors and consultants scored on the data they have generated'],
  manpower: ['Manpower', 'Workforce availability and productivity'],
  equipment: ['Equipment', 'Plant deployment and utilisation'],
  quality: ['Quality', 'Inspections and non-conformance'],
  hse: ['HSE', 'Health, safety and environment'],
  risk: ['Risk', 'Risk register and exposure'],
  issues: ['Issues', 'Live issues and escalations'],
  reports: ['Reports', 'Generate and export owner-PMO reports'],
  analytics: ['Analytics', 'Earned value, indices and forecasting'],
  documents: ['Documents', 'Central document repository'],
  glossary: ['Glossary & How to Use', 'Definitions, calculation methods and how the figures connect'],
  admin: ['Administration', 'Users, roles and system settings'],
  profile: ['My Profile', 'Your name, picture and password'],
};
