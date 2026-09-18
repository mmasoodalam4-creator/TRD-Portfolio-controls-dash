// The filter bar's logic, apart from the component so React Fast Refresh
// sees a file of components and a file of functions.

/**
 * Apply the bar's state to a list of rows.
 *
 * `by` maps a field label to the row property it filters; the search matches
 * case-insensitively against every string the row holds. One helper so eight
 * screens filter the same way.
 */
export function applyFilters<T extends object>(
  rows: T[], values: Record<string, string> | undefined, by: Record<string, keyof T>,
): T[] {
  if (!values) return rows;
  const q = (values.__search ?? '').trim().toLowerCase();
  return rows.filter((r) => {
    for (const [label, key] of Object.entries(by)) {
      const want = values[label];
      if (want && want !== 'All' && String(r[key] ?? '') !== want) return false;
    }
    if (!q) return true;
    return Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
  });
}
