# UAT results — Tazayud Owner PMO platform

Run: 2026-09-08T12:29:10.256Z · 99 of 99 cases passed

Six accounts (the real seat list) drove the platform build in Chromium against PostgreSQL through the API. 
Each case names what was expected; a failure shows what actually happened.

| Case | Title | Expected | Result | Actual |
|---|---|---|---|---|
| UAT-01 | The platform shows a sign-in screen and no data before authentication | sign-in form visible, sidebar absent | PASS |  |
| UAT-02 | A wrong password is refused with a message and no data is shown | error shown, still gated | PASS | email or password is incorrect |
| UAT-03 | Masood (admin) signs in and the shell shows their own name and role | name "Masood", a role label | PASS | name "Masood", role "Owner Admin" |
| UAT-04 | Fawwad Hussain (director) signs in and the shell shows their own name and role | name "Fawwad Hussain", a role label | PASS | name "Fawwad Hussain", role "PMO Director" |
| UAT-05 | Executive Viewer (reader) signs in and the shell shows their own name and role | name "Executive Viewer", a role label | PASS | name "Executive Viewer", role "Executive Viewer" |
| UAT-06 | Raza Adil (approver) signs in and the shell shows their own name and role | name "Raza Adil", a role label | PASS | name "Raza Adil", role "PMO Controls Manager" |
| UAT-07 | Muqtida Sajjad (reviewer) signs in and the shell shows their own name and role | name "Muqtida Sajjad", a role label | PASS | name "Muqtida Sajjad", role "PMO Team Leader" |
| UAT-08 | Muhammad (contributor) signs in and the shell shows their own name and role | name "Muhammad", a role label | PASS | name "Muhammad", role "Project Manager" |
| UAT-09 | Muhammad Momin (contributor) signs in and the shell shows their own name and role | name "Muhammad Momin", a role label | PASS | name "Muhammad Momin", role "Project Manager" |
| UAT-10 | A reader can open every module | 20 modules render | PASS | 20 |
| UAT-11 | A reader is not offered the certificate form | no Record certificate button | PASS |  |
| UAT-12 | A reader is not offered Add Project or AI Extract | neither button in the topbar | PASS |  |
| UAT-13 | A reader opens the Project Workspace | Project Workspace in the sidebar | PASS | Dashboard, Projects, Project Workspace, WBS, Cost & Financials, Variations, Change Log, Packages & Contracts, Payment Cl |
| UAT-14 | A reader is not offered Monthly Reporting inside the workspace | no Monthly Reporting tab | PASS | Overview, WBS, Cost & Financials, Variations, Change Log, Procurement, Payment Claims, Manpower, Equipment, Quality, HSE |
| UAT-15 | A reader is not offered the review workflow | no Review & Approve in the sidebar | PASS | Dashboard, Projects, Project Workspace, WBS, Cost & Financials, Variations, Change Log, Packages & Contracts, Payment Cl |
| UAT-16 | A reader still reads the position | Dashboard and Cost & Financials present | PASS | Dashboard, Projects, Project Workspace, WBS, Cost & Financials, Variations, Change Log, Packages & Contracts, Payment Cl |
| UAT-17 | Typing the entry URL as a reader gives the reason, not the form | refusal naming the role | PASS |  |
| UAT-18 | Administration shows a reader the seats without a role switcher | the seat table, no role <select>, and a note that seats are the administrator’s | PASS |  |
| UAT-19 | The server refuses a write from a reader whatever the UI shows | 403 | PASS | status 403 |
| UAT-20 | Period Entry opens reconciling for RES-01 as seeded from the register | no failing reconciliation rows | PASS | 0 failing row(s) |
| UAT-21 | The file button is enabled for an assigned contributor on a reconciling period | enabled | PASS | File period 9 for validation |
| UAT-22 | Filing a period reports that it awaits validation | success toast mentioning validation | PASS | Period 9 filed for RES-01Awaiting validation by a reviewer |
| UAT-23 | The filed period appears in Review & Approve awaiting validation | a card with "Awaiting validation" | PASS |  |
| UAT-24 | The contributor is told they cannot validate or approve their own period | note present; no Validate button | PASS |  |
| UAT-25 | The submission is recorded with the contributor as submitter | submittedBy = contributor | PASS |  |
| UAT-26 | A project manager sees only the developments assigned to them | seven developments, LND-02 absent | PASS | RES-01 RES-02 COM-01 COM-02 MXU-01 MXU-02 LND-01 |
| UAT-27 | A link to an unassigned development does not open it | the scope is repaired to one they hold | PASS | LND-01 — Green Valley Infrastructure |
| UAT-28 | Filing for an unassigned development is refused by the server | 403 naming the assignment | PASS | status 403: m.masoodalam78@gmail.com is not assigned to LND-02 |
| UAT-29 | The contributor cannot validate their own period even via the API | 403 or 409 | PASS | status 403: role contributor may not validate periods |
| UAT-30 | A project manager downloads the reporting workbook | PT_TEMPLATE.xlsx | PASS | PT_TEMPLATE.xlsx |
| UAT-31 | What was downloaded is a workbook | a zip, as every xlsx is | PASS | 27207 bytes |
| UAT-32 | The downloaded workbook imports without being edited | the sheet is read, not refused | PASS | status 200:  |
| UAT-33 | And its work packages come back for the entry form | rows read from section 4 | PASS | 9 packages |
| UAT-34 | Every user has a profile with their own details | name, password fields and a sign-out | PASS |  |
| UAT-35 | A user changes their own display name | success toast | PASS | Name updatedMuhammad (PM) |
| UAT-36 | The new name shows in the shell at once | the sidebar follows | PASS | Muhammad (PM) |
| UAT-37 | Changing a password needs the current one | 403 | PASS | status 403 |
| UAT-38 | A password under twelve characters is refused | 400 | PASS | status 400 |
| UAT-39 | A user cannot give themselves a role through their profile | the field is not read and the role is unchanged | PASS | status 400, role contributor |
| UAT-40 | A contributor records a payment certificate from the Cash Flow tab | success toast | PASS | Certificate recordedIPC-UAT · 10,000,000 SAR certified, 9,000,000 SAR paid |
| UAT-41 | The certificate moves certified to date | IPC Submitted tile changes | PASS | 672M -> 682M |
| UAT-42 | A certificate above the cost incurred is refused by the server | 422 naming control 15 | PASS | status 422: would break 2 of 20 reconciliation controls: Certified within Actual Cost, Package Payments within Commitmen |
| UAT-43 | Momin can file for LND-02 | file button enabled | PASS |  |
| UAT-44 | Momin files LND-02 period successfully | success toast | PASS | Period 9 filed for LND-02Awaiting validation by a reviewer |
| UAT-45 | A reviewer sees Validate and not Approve | Validate present, Approve absent | PASS |  |
| UAT-46 | The reviewer validates the RES-01 period | success toast | PASS | Period validated |
| UAT-47 | The validated period now awaits approval | "Awaiting approval" shown | PASS |  |
| UAT-48 | The reviewer returns LND-02 with a note | success toast | PASS | Period returned to the contributor |
| UAT-49 | The returned period shows who returned it and why | trail line "Returned by <reviewer> … note" | PASS |  |
| UAT-50 | A reviewer cannot approve via the API | 403 | PASS | status 403 |
| UAT-51 | An approver sees Approve and not Validate | Approve present, Validate absent | PASS |  |
| UAT-52 | The approver approves the RES-01 period | success toast | PASS | Period approved and reported |
| UAT-53 | Approval is what puts the period into the reported position | one more mutation in the log | PASS | 1 -> 2 |
| UAT-54 | The reported position for RES-01 now reflects the entered packages | EV/PV/AC computed from packages (position changed or equal to entered) | PASS | ev 833333333 -> 833333333 |
| UAT-55 | The Projects register renders after approval | RES-01 row present | PASS |  |
| UAT-56 | An approver cannot validate via the API | 403 or 409 (already approved) | PASS | status 403 |
| UAT-57 | Administration shows the seats the database holds, not a list in the code | the six seats, read live, with no demo-only role and no role switcher | PASS | 6 rows |
| UAT-58 | An administrator can change what a seat may do from the screen | a capability toggle on a seat that is not admin | PASS |  |
| UAT-59 | The administrator seat is fixed, so nobody can lock every admin out | no toggle on the admin seat | PASS |  |
| UAT-60 | An admin may submit a period for any development | 200 | PASS | status 200:  |
| UAT-61 | An admin may validate their own period, by the owner's exemption | 200 | PASS | status 200:  |
| UAT-62 | An admin may approve what they entered and validated | 200, one name at all three stages | PASS | status 200:  |
| UAT-63 | The PMO manager is offered Add Project and an Archive tab | both present | PASS |  |
| UAT-64 | The delete dialog refuses until a reason is given | the button is disabled and says why | PASS |  |
| UAT-65 | The delete dialog asks how many days it is kept, opening on the minimum | 30 | PASS | 30 |
| UAT-66 | A retention period below thirty days is refused, with the reason | disabled, and the floor stated | PASS | a deleted development is kept for at least 30 days |
| UAT-67 | The button says the deletion goes to the Director, not that it is done | Send delete for authorisation | PASS |  |
| UAT-68 | The PMO manager PROPOSES the deletion | sent-for-authorisation toast | PASS | Delete sent for authorisationProposal #1 — Delete LND-01, kept 60 days in the archive. Nothing has moved until the Direc |
| UAT-69 | Nothing has moved while it waits | the same number of rows | PASS | 8 -> 8 |
| UAT-70 | The Director authorises it from the queue | authorised, 200 | PASS | status 200  |
| UAT-71 | And THEN the development leaves the portfolio | one fewer row | PASS | 8 -> 7 |
| UAT-72 | It is listed in the Archive, with a way back and the days remaining | the row, a Restore button, and the countdown | PASS | Project ID	Project Name	Portfolio	Deleted	Reason	Retention	Actions
LND-01	Green Valley Infrastructure	Land Development	2 |
| UAT-73 | A development inside its retention window offers no permanent removal | no Remove button | PASS |  |
| UAT-74 | The PMO manager proposes putting it back | sent-for-authorisation toast | PASS | Restore sent for authorisationProposal #2 — Restore LND-01 to the portfolio. Nothing has moved until the Director author |
| UAT-75 | The Director authorises the restoration | authorised, 200 | PASS | status 200  |
| UAT-76 | The PMO manager proposes closing a delivered development out | sent-for-authorisation toast | PASS | Close out sent for authorisationProposal #3 — Close out LND-01. Nothing has moved until the Director authorises it. |
| UAT-77 | The Director authorises the closeout | authorised, 200 | PASS | status 200  |
| UAT-78 | A closed development leaves the developments in delivery | one fewer row | PASS |  |
| UAT-79 | It is listed under Completed, readable rather than hidden | the row, with its closeout date | PASS |  |
| UAT-80 | A closed development accepts no further figures | 403 with the reason | PASS | status 403 |
| UAT-81 | And reopening it can be proposed | sent-for-authorisation toast | PASS | Reopen sent for authorisationProposal #4 — Reopen LND-01. Nothing has moved until the Director authorises it. |
| UAT-82 | The Director authorises the reopening | authorised, 200 | PASS | status 200  |
| UAT-83 | An executive viewer is offered neither Add Project nor the Archive tab | neither present | PASS |  |
| UAT-84 | The server refuses an executive viewer the list of deleted developments | 403 | PASS | status 403 |
| UAT-85 | Reset is disabled on the platform even for an admin | 403 | PASS | status 403 |
| UAT-86 | An admin sees every account, not just their own | 7 seats listed | PASS | 7 rows |
| UAT-87 | An admin issues a new account | the password is shown once | PASS | falcon-harbour-thistle-cobalt-20 |
| UAT-88 | The new account appears in the list | one more row | PASS | 7 -> 8 |
| UAT-89 | The issued password signs the new person in | the shell appears | PASS |  |
| UAT-90 | With nothing assigned they see no developments | an empty portfolio, not everyone else's | PASS | 1 rows |
| UAT-91 | An admin assigns a development to a project manager | success toast | PASS | Assignments savedRES-02 |
| UAT-92 | An admin withdraws an account | success toast | PASS | Account withdrawnUAT New Person can no longer sign in |
| UAT-93 | A withdrawn account can no longer sign in | still at the gate | PASS |  |
| UAT-94 | An admin cannot change their own role | 409 | PASS | status 409: you cannot change your own role; ask another administrator |
| UAT-95 | Sign out returns to the gate | sign-in form visible | PASS |  |
| UAT-96 | An unknown scope in the URL is repaired rather than rendering zeros and NaN | KPI tiles carry values, none "NaN" | PASS | 1.25B \| 1.08B \| 170M \| 0.98 |
| UAT-97 | Escape closes an open drawer | no .drawer | PASS |  |
| UAT-98 | Keyboard focus reaches the navigation | a nav-item or a button focused | PASS | nav-item |
| UAT-99 | No JavaScript errors occurred in any browser session | none | PASS |  |

Screenshots: tests/output/uat/
