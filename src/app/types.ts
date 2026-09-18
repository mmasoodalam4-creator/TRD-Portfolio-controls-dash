/** Every routable module. `overview` is a project sub-page, not a nav item. */
export type PageId =
  | 'dashboard' | 'projects' | 'overview' | 'wbs' | 'cost' | 'variations'
  | 'change' | 'procurement' | 'manpower' | 'equipment' | 'quality' | 'hse'
  | 'risk' | 'issues' | 'reports' | 'analytics' | 'documents' | 'admin'
  | 'period' | 'submissions' | 'profile' | 'glossary' | 'claims' | 'evaluation'
  | 'messages' | 'workspace' | 'authorisations';

export type NavFn = (page: PageId) => void;
