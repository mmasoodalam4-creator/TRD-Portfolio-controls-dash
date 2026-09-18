
/**
 * Status pill. The vocabulary spans every register — project status, variation
 * approval, NCR severity, equipment state — so the map is one lookup shared by
 * all of them.
 *
 * 'Active' is a healthy state for a person or a risk being managed, not an
 * alarm; it was red. 'Complete' and 'Not Started', which an entered period
 * produces, had no tone at all and fell to grey.
 */
const TONE: Record<string, string> = {
  'On Track': 'b-green', 'Approved': 'b-green', 'Completed': 'b-blue', 'Complete': 'b-blue',
  'Operating': 'b-green', 'Active': 'b-green', 'Not Started': 'b-grey',
  'At Risk': 'b-amber', 'Under Review': 'b-blue', 'Monitoring': 'b-blue', 'In Progress': 'b-amber',
  'Under Maintenance': 'b-amber', 'Awaiting review': 'b-blue', 'Validated': 'b-blue',
  'Delayed': 'b-red', 'Rejected': 'b-red', 'Overdue': 'b-red', 'Open': 'b-red',
  'Out of Service': 'b-red', 'Escalated': 'b-red', 'Returned': 'b-amber',
  'High': 'b-red', 'Medium': 'b-amber', 'Low': 'b-green', 'Major': 'b-red', 'Minor': 'b-amber',
  // The fourth risk band, between low and medium. See domain/risk.ts.
  'Low-Medium': 'b-amber',
  'Critical': 'b-red', 'Very High': 'b-green',
  'Favourable': 'b-green', 'Unfavourable': 'b-red', 'Behind': 'b-red', 'Closed': 'b-green',
};

/**
 * `status` picks the tone; `label` overrides the text when the words a screen
 * needs are not one of the status names — a submission is "Awaiting review",
 * which carries the Under Review tone but should not read as it. Defaulting to
 * `status` leaves every existing call unchanged.
 */
export function Badge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${TONE[status] ?? 'b-grey'}`}>{label ?? status}</span>;
}
