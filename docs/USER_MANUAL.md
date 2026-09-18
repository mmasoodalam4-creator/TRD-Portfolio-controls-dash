# Tazayud Owner PMO — User Manual

**Integrated Portfolio & Project Controls System**

This manual is for the people who use the platform: what you will see when you
sign in, what your role lets you do, and how to do it. It is written for someone
who has never used the system, so it explains each step in order. Where a screen
refuses something, it says why, and this manual says what that refusal means.

---

## 1. What this system is

Tazayud is a real-estate developer and owner. Every figure in this system is a
**cost to Tazayud** — money committed to, incurred with, or paid to the
consultants and contractors delivering its developments. There is no revenue,
margin or profit here; that is deliberate. This is an owner's cost-control
system.

### How a development is delivered

Whether a development is run internally or through a Project Management
Consultant is a Tazayud policy decision, taken on its value:

| Project value | Delivery route |
| --- | --- |
| 20M or less | Internal, self execution |
| 20M to 50M | PMC if complex, otherwise internal |
| 50M to 70M | PMC considered |
| 70M and above | PMC |

The system records which route was chosen. It does not apply the policy for
you: the route is set when the development is registered, and the judgement in
the middle two bands is a person's to make.

It holds eight developments across four portfolios:

| Portfolio | Developments |
| --- | --- |
| Residential | RES-01, RES-02 |
| Commercial | COM-01, COM-02 |
| Mixed Use | MXU-01, MXU-02 |
| Land Development | LND-01, LND-02 |

For each development it reports a **position**: the approved budget, the control
budget, what has been committed, incurred, earned, certified and paid, and the
anticipated final cost. The position is not typed in. It is **built up from
reporting periods**: each period a project manager files the work-package
figures from the PT_TEMPLATE workbook, a second person validates them, a third
approves them, and only then does the position move.

Everything is reconciled before it is recorded. Seventeen controls check that
the figures agree with each other — that the work packages add up to the
control budget, that the cost categories forecast to the adopted final cost,
that nothing has been paid that was not certified. A period that fails a
control is refused, and the screen tells you which control and by how much.

### The two builds

You may meet the system in two forms:

- **The platform** — a website, with a sign-in screen. This is the system of
  record. Data lives in a database; the workflow, roles and controls all apply.
  This manual is about the platform.
- **The self-contained demonstration** — a single file that opens with a
  double-click, no sign-in, showing the same screens on sample data. Changes
  made there stay in that browser and go nowhere. It is a presentation, not a
  record.

---

## 2. Signing in

Open the platform address in a browser (Chrome, Edge or Firefox; the current
version of any of them). You will see the sign-in screen.

1. Enter the email address your account was issued with.
2. Enter your password, exactly as issued. Passwords are case-sensitive.
3. Press **Sign in**.

If either is wrong you will see *email or password is incorrect*. The message is
the same whichever was wrong, on purpose. Try again; if you cannot get in,
contact the administrator, who can issue a new password. Nobody can look up
your existing one — it is not stored, only a one-way hash of it.

Once signed in you will see your **name and role at the bottom left**, under
the navigation. Click it to open **My Profile**. Your session lasts eight hours,
or until you close the browser tab, or until you press the **Sign out** button
beside your name, or on your profile.

> **Passwords** are issued by the administrator and shown to them once. Change
> yours to something only you know as soon as you have signed in, under
> **My Profile**. If you think it has been seen, change it again.

### My Profile

Everything about your own account lives on one screen, reached by clicking
your name at the bottom left.

- **Your name.** What every screen shows beside anything you file, validate or
  approve. Change it and the whole system follows immediately.
- **Your picture.** Choose an image and it is cropped square and shrunk in your
  own browser before it is sent, so only a small thumbnail is kept. It appears
  beside your name. **Remove** goes back to your initial.
- **Your password.** The current one, then the new one twice. At least twelve
  characters: a phrase you can remember beats a short puzzle you cannot. Your
  current password is required even though you are already signed in, so a
  session left open on somebody else's screen is not enough to take your
  account over.
- **Your role and your developments** are shown and cannot be changed here.
  They are issued to you by the administrator. A screen that let a person set
  their own role would undo the whole access model with one dropdown.
- **Sign out.**

---

## 3. Finding your way around

**The navigation** runs down the left. Every module is one click. The list is
the same for every role; what you can *do* in each module depends on your
role (section 5).

**The scope selector** sits at the top of every screen. It decides what the
figures on the screen cover:

| Level | Shows |
| --- | --- |
| Corporate | All eight developments rolled up |
| Portfolio | One portfolio's developments rolled up |
| Project | One development |

The Dashboard, Projects, Reports and Analytics screens follow the level you
choose. Every other module is about one development — the WBS, the cost
position, the registers — so those always show the development named in the
**Project** box, whatever the level says. If you are looking at a register and
the figures seem wrong, check which development the selector names.

The scope is part of the page address. A link to *the cost position of COM-01*
is a link: copy the address bar and send it, and the recipient opens exactly
that view.

**The shield button** at the top right shows the reconciliation state — *20/20*
means every control passes for everything in scope. Click it for the full list
with both sides of every comparison.

**The bell** shows how many alerts you have not read. **Escape** closes any
open panel.

---

## 3b. The assistant, and reading a document

Two things in this system use a language model, and both are deliberately
limited. Whether they are switched on depends on the deployment; where they are
not, each says so rather than offering a button that fails.

### The PMO assistant

The sparkle button at the top right. Ask about budget, risks, variations or
schedule for whatever is in scope.

**It cannot do arithmetic, and that is on purpose.** Every figure it quotes is
computed by this system from the live position and handed to it; it is told
that any figure it states must be one of those. Ask something the figures do
not cover and it will say so and name the screen that has it, rather than
producing a number that looks right.

It also only ever sees the developments **you** may see. A project manager's
assistant cannot answer about a development they are not assigned to.

It changes nothing. Ask it to file, approve or correct something and it will
tell you which screen to use.

### Reading a document

**AI Extract** at the top right, for a project manager, PMO manager or
administrator. Drop in a payment certificate as a PDF or a photograph.

What comes back is a **form**, not an entry. Each field carries how sure the
reader was of it:

| Badge | What it means |
| --- | --- |
| Green | Read clearly |
| Amber | Read, but check it |
| Red | Read poorly — check it against the document |
| **not read** | The reader could not make it out. It has not been guessed |

Correct anything that is wrong, choose the development if it was not
identified, then press **Create the entry**. Only then is anything recorded,
and it goes through exactly the same reconciliation controls as a certificate
you typed — including the one that refuses to certify more than has actually
been spent.

Nothing is filed while you are reading. If you close the window, nothing
happened.

---

## 3a. Messages

Open to every seat, including the executive viewer: the person who may only
read the figures is exactly the one most likely to need to ask somebody about
them, and a message changes nothing.

The **speech-bubble button at the top right**, which carries a red count when
somebody is waiting for you. It is not in the sidebar: the sidebar lists the
things the portfolio is made of, and the badge is what makes a waiting message
findable from whichever screen you are on.

Pick a person on the left, type on the right, press **Enter** to send
(**Shift+Enter** for a new line). The list is ordered by whoever spoke most
recently, and shows a count of what you have not read from each person.

**Say which development it is about.** The dropdown beside the message box
attaches a development to what you are saying, and the recipient sees it as a
chip they can click to jump straight there. A question about a variation is far
easier to answer when the person answering can open the development in one
click.

Four things worth knowing:

- **A message never moves a figure.** Everything that changes the reported
  position still goes through Period Entry, Review & Approve, payment claims
  and the reconciliation controls. Agreeing something here does not file it.
- **Messages are permanent.** They are never edited and never deleted, in the
  same way an account that has acted is withdrawn rather than erased. This is a
  record, not a chat app — "I told you about that in March" is exactly the sort
  of claim it exists to settle.
- **Nobody is told when you read something.** The unread count is your own; the
  sender never sees a read receipt.
- **A withdrawn account can still be read, not written to.** The conversation
  stays as part of the record.

New messages appear on their own within about twenty seconds while you have the
conversation open, and the count at the top refreshes each minute from anywhere
in the application. There is nothing to refresh by hand. If a refresh does not
come back, the conversation says so quietly at its foot and keeps trying —
nothing you have typed is lost.

---

## 4. Reading the numbers

Every amount is in **Saudi riyals**. On tiles, large amounts are shortened:
`1.25B` is 1,250,000,000; `720M` is 720,000,000; `4.9K` is 4,900. In tables
they are written in full. A minus sign marks a negative.

| Term | Meaning |
| --- | --- |
| Approved Budget (BAC) | What the board has approved for the development |
| Control Budget | The part of the approved budget allocated to work packages; the rest is reserve |
| Planned Value (PV) | The value of work that was scheduled to be done by the data date |
| Earned Value (EV) | The value of work actually done, measured as package budget × percentage complete |
| Actual Cost (AC) | Cost incurred to date |
| Committed | Contracted and awarded to date |
| Certified | Value contractors have certified for payment |
| Paid | What Tazayud has paid |
| Anticipated Final Cost (AFC) | The adopted forecast of the total at completion |
| Budget Variance | Approved budget − AFC. **Positive is favourable** (under budget); it is shown green. Negative is an overrun, shown red. |
| SPI | Earned ÷ planned. 1.00 is on schedule; below is behind |
| CPI | Earned ÷ actual cost. 1.00 is on cost; below is over |

SPI and CPI are always calculated from the figures on the screen. They are
never typed in.

**If a term is unfamiliar, the system will tell you.** A small gold marker sits
beside a term where a screen first uses it — on a tile label or a column
heading. Click it for the definition and the formula the system actually uses,
and follow **Full definition and what it feeds** through to the **Glossary**
module, which holds every term in one place along with instructions for using
the system.

The four figures people most often confuse are worth stating plainly:

| Figure | The question it answers |
| --- | --- |
| Approved Budget | *What were we given permission to spend?* A permission. Set at sanction. |
| Control Budget | *What may we spend without asking for the contingency?* A discipline. |
| Committed Cost | *What have we already promised to pay?* An obligation — signed, not spent. |
| Anticipated Final Cost | *What will this actually cost when it is finished?* A prediction, and the only one of the four that moves every period. |

**Portfolio and corporate figures** are sums of the developments in scope; the
portfolio SPI is the sum of earned values divided by the sum of planned values,
not an average of the individual indices.

### Reading a chart on this system

Four rules hold on every chart, and they are worth knowing because they are
what let you take a figure off a chart and use it.

**Every colour is named.** A chart drawing more than one line or bar carries a
key underneath it. Where a line is dashed in the chart it is dashed in the key
too, so the planned-value curve is identifiable without relying on its colour.
A chart with one line has no key: the card heading names it.

**Every gridline is the number beside it.** The scale is chosen so the lines
land on round numbers, and a count axis — incidents, people, non-conformances
— never offers half of one. If a line sits between two gridlines you can read
its value by eye and be right.

**A bar is never cut short.** Where a chart has a natural reference — 100% of
a commitment, an index of 1.00 — a bar that goes past it is drawn past it. A
package paid 112% of what was committed to it looks longer than one paid 100%,
because it is.

**An empty month is not a zero.** See below.

### What the trend charts measure, and what they model

**Counted from the rows: incidents, non-conformances and inspections.** Each
of those carries its own date, so the chart counts them off the register and
the months shown are the months the register covers. The parts always sum to
the total on the tile above.

This is why a trend may cover fewer months than the year. If your incident
register begins in July, the chart begins in July. It does **not** draw
January to June as zero, because a month with no record is not a month in
which nothing happened — it is a month nobody recorded, and those are
different facts. A zero **inside** the covered period is a real zero and is
drawn.

**First time right** is inspections passed outright over inspections carried
out, accumulated from the start of the record. Every point can be reproduced
from the inspection log beside it, and the last point is the register's own
figure. A scope with no inspections reports nothing rather than 100%.

**Modelled from the progress curve: workforce, productivity, risk exposure and
equipment utilisation.** Nothing in the system dates those month by month, so
the shape of how the development got to today is modelled and each card says
so. The last point is always the reported position exactly, so a trend and the
tile above it can never disagree about where the development stands today. As
periods are filed the modelled months are replaced by what was reported.

---

## 5. Roles — what you can do

Six seats. Yours is shown under your name. It is set by the administrator when
your account is issued and cannot be changed from inside the system. The
screens show each seat by its job title; the system name is in brackets.

| Seat shown | System name | Can see | Can do |
| --- | --- | --- | --- |
| **Project Manager** | contributor | **Only the developments assigned to you** | File reporting periods and record payment certificates, for those developments. |
| **PMC** | contributor | Only the developments assigned to you, which may be several | Exactly as a project manager. A consultant holding four developments is one account with four assignments. |
| **PMO Team Leader** | reviewer | Everything | Validate a filed period, or return it with a note. Cannot file one, cannot approve one. |
| **PMO Controls Manager** | approver | Everything | Approve a validated period into the reported position; approve variations and payment claims; confirm a payment. **Proposes** changes to a development — registering, amending, deleting, restoring, closing out, reopening, awarding a package — which the Director then authorises. Cannot file a period, cannot validate one. |
| **PMO Director / Executive** | director | Everything | **Authorises** a proposed change to a development, or declines it. Files nothing, validates nothing, approves no period. |
| **Executive Viewer** | reader | Everything, once it is approved | Nothing changes. Approved figures, every report, read-only. |
| **Owner Admin** | admin | Everything | Everything above, plus issuing accounts and defining seats. Acts without a second person. |

**These six are what the system ships with, not a fixed list.** A seat is a row
in a table the administrator edits, so what each may do can be changed, and a
seventh can be added, from the Administration screen — see
[Seats and capabilities](#seats-and-capabilities). Nothing in this manual
requires a developer or a database.

### What a project manager sees

Your developments, and no others. The Projects register lists them, the
dashboard and reports roll up those alone, the scope selector offers only the
portfolios they sit in, and a link to a development that is not yours opens
one that is. This is enforced by the server, not by hiding rows: a development
that is not assigned to you is not sent to your browser at all.

The PMO lead, the PMO manager, a Director and the administrator see the whole
portfolio.

This manual uses the system names — contributor, reviewer, approver, reader,
administrator — because they say what the role does.

### Separation of duties — the rule that holds whatever your role

> **The person who enters a period can never validate it or approve it. The
> person who validates a period can never approve it. The person who proposes
> a change to a development can never authorise it.**

This is enforced in the database itself, not in the screens. If you try, you
will see a refusal naming the rule. That refusal is the system working.

**One exemption, by the owner's decision: the Owner Admin.** That account may
enter, validate and approve the same period, so a period can still be reported
when the PMO seats are away. It is not silent. The same name then appears at
two or three stages of the approval trail on the Review and Approve card, and
anybody looking at that period can see that one person carried it through.
Every other role is bound exactly as the rule says.

So a period always passes through three different people:

```
Contributor files it  →  Reviewer validates it  →  Approver approves it  →  it is reported
```

Until the third step the reported position does not move. A filed or validated
period is visible, auditable, and not yet fact.

And a change to what a development IS passes through two:

```
PMO Controls Manager proposes it  →  Director authorises it  →  it takes effect
```

Until the second step nothing has moved: the development is not registered,
the budget is not amended, the deletion has not happened. See
[Authorisations](#authorisations).

---

## 6. Contributor — filing a reporting period

You will do this once each reporting period, for each development assigned to
you. Assignments are shown when you sign in; if you try to file for a
development that is not yours, the system refuses with *not assigned to*.

### 6.1 Open the Project Workspace

Click **Project Workspace** in the navigation. It is one development at a time,
so if the scope is set to Corporate or Portfolio it asks which one first: press
**Open** and the top bar then names the development you are in. Every other
development is a change of scope in that same top bar.

Across the top is the **module tab row** — Overview, Monthly Reporting, WBS,
Cost, Variations, Procurement, Payment Claims, Manpower, Equipment, Quality,
HSE, Risk, Issues, Documents. These are the same screens the sidebar carries;
the difference is that here they are one development, and the sidebar rolls
them up across a portfolio or the whole company.

Under the tabs is the **reporting calendar**: a year picker and twelve months,
each marked with what the system holds for it.

| The month reads | What it means |
| --- | --- |
| **Approved** | A period covering it was filed, validated and approved. Its figures are final. |
| **Awaiting approval** | Filed, and sitting with the reviewer or the approver. |
| **Returned** | Sent back for correction. It is yours again. |
| **Nothing filed** | The month is open and nothing has been filed yet. |
| **Not reported** | Outside the development's programme, or past and never reported. |
| **Future** | The month has not started. |

The strip shows only what has actually been filed. A month that says *Not
reported* is not a fault in the screen — it is the system saying it holds
nothing for that month.

Choose the month you are filing, then open the **Monthly Reporting** tab. The
period number and data date are already filled in from the month you picked,
and both stay editable — the period number is yours to state, and the workbook
is where it comes from.

The form is PT_TEMPLATE — the workbook you already fill — laid out as a screen,
in the same order with the same section numbers:

- **1 & 2 — Development, budget and control budget.** Period number, data
  date, approved budget, control budget, anticipated final cost.
- **4 — Work-package register.** One row per package: WBS code, name, budget,
  planned %, actual %, cost incurred, committed.
- **5 — Cost categories.** One row per category: budget, committed, actual,
  forecast final cost.

Section 3 of the workbook — the earned-value position — is **not entered**. It
is calculated from section 4 as you type, exactly as the workbook calculates it:
planned value is budget × planned %, earned value is budget × actual %. The
KPI tiles under section 5 show the result.

### 6.2 Start from last period, or from the workbook

The form opens **pre-filled from the development's current register** — the
packages, budgets and percentages as they stand — so you adjust rather than
retype.

There are two buttons at the top right of section 1.

**Download PT_TEMPLATE** gives you the reporting workbook itself, the same
sheet this system reads. Take it to site, fill it in, and bring it back. Use
this rather than a copy from an old email: the importer refuses a workbook
whose rows have moved, and you would only find that out after filling it in.

**Import PT_TEMPLATE** takes the filled workbook back (`.xlsx` or `.xlsm`).
The system reads the development's own sheet and fills every field on this
screen from it: the period, the data date, the budgets, every work package in
section 4 and every cost category in section 5. It does **not** file anything.
Importing is loading, not submitting: look at what was loaded, watch the
reconciliation panel, and file it yourself.

If the workbook's structure has been altered — a section moved — the import
refuses and names the row rather than reading figures from the wrong place.
Download a fresh copy and start again.

### 6.3 Enter or adjust the figures

- Percentages are entered as whole percentages (0–100).
- Money is entered in whole riyals; commas are ignored.
- **Add package** / **Add category** add a row. The × at the end of a row
  removes it.
- The period number must be a whole number.

### 6.4 Watch the reconciliation panel

Under section 5, three checks update as you type:

| Check | Means |
| --- | --- |
| Work packages break down the control budget | Σ package budgets = control budget |
| Cost categories forecast to the adopted AFC | Σ category forecast = AFC |
| Cost incurred agrees between packages and categories | Σ package cost = Σ category actual |

Each shows both figures and, if they differ, *Out by* how much. **The File
button stays disabled until all three reconcile.** This is the same check the
server makes; the panel exists so the refusal never comes as a surprise.

### 6.5 File

Press **File period N for validation**. You will see *Awaiting validation by a
reviewer*. Open **Review & Approve** to see it in the queue with your name on
it. You will find no Validate or Approve buttons on your own period — that is
the separation-of-duties rule.

If the server refuses the period, the message names the reason: which control
failed, or that you are not assigned, or that a validated or approved version
of that period already exists. Correct it and file again.

One control is worth knowing in advance: **certified within actual cost**
(control 15). Cost incurred in the period you file cannot be less than what
has already been certified for the development — a certificate is evidence
of cost incurred, so the position cannot show less. If the refusal names it,
the package costs are understated against the certificates already recorded.

### 6.6 If it is returned

A reviewer or approver may **return** a period with a note saying what to
correct. It appears in Review & Approve marked *Returned*, with their name and
the note. Open the Project Workspace, select the month, correct the figures on
the Monthly Reporting tab, and file again — the new
filing replaces the returned one.

### 6.7 Recording a payment certificate

When a contractor's interim payment certificate (IPC) is certified, record it
so the certified and paid figures move:

1. Open **Cost & Financials** for the development and choose the **Cash
   Flow** tab. The line above the tiles shows what is certified against what
   is incurred.
2. Press **Record certificate**.
3. Enter the certificate reference (for example `IPC-09`), the gross
   certified value, and the retention withheld, in whole riyals.
4. Press **Record certificate** in the form.

Certified to date rises by the gross value; payments made rise by the net of
retention. Earned value and actual cost do **not** move — those are reported
through the period, not the certificate. A certificate that would take
certified value above the cost incurred is refused (control 15): file the
period that reports the work first, then the certificate for it. The form
tells you how much of the actual cost is not yet certified before you submit.

Every certificate is recorded in the audit log with your name and the time,
and appears under **History** on the development's screens.

### 6.8 Asking for an approved month to be reopened

An approved period is the record of what the owner has spent, so nothing on it
can be edited. If a figure in it is wrong:

1. In the **Project Workspace**, select the approved month on the calendar.
2. Press **Request to reopen** beside the period status.
3. Say what needs correcting and why. A reason is required — the date and your
   name are recorded automatically, but why an approved figure had to move is
   the only part nobody can reconstruct later.

The request goes to the PMO manager as a message. It does **not** open the
form: the figures unlock only if they return the period, and both your request
and their decision are recorded. A returned period comes back to you and then
passes through validation and approval again — it does not go straight back to
approved because it was approved once.

> The **AI Extract** button reads a document only in the self-contained
> demonstration, where it files a fixed sample certificate. On the platform it
> says *Document extraction is not configured* and does nothing, so that an
> invented certificate can never reach the register. The Cash Flow form is the
> platform's way to record one.

---

## 7. Reviewer — validating a period

Click **Review & Approve**. Each filed period is a card showing the
development, period, the earned-value position it implies, and who entered it
and when.

On a period marked **Awaiting validation** you have two buttons:

- **Validate** — you have checked the figures and they are right. The period
  moves to *Awaiting approval*. It is not yet reported.
- **Return…** — something is wrong. Type what needs correcting (the note is
  required) and press **Return with this note**. The contributor sees your name
  and the note.

You will not see an Approve button; approval is a different person's act. You
cannot validate a period you entered yourself.

What to check: that the figures match the workbook the project manager sent;
that the percentages are plausible against the site position; that cost
incurred agrees with the certificates you know of. The reconciliation is
already proven — the system would not have accepted the filing otherwise — so
your validation is about whether the figures are *true*, not whether they add
up.

---

## 8. Approver — approving a period

Click **Review & Approve**. On a period marked **Awaiting approval** you have:

- **Approve and report** — the period becomes part of the reported position.
  Every screen updates: the development's earned value, actual cost, indices
  and forecast now reflect it. This is the accountable act, and the audit
  trail records your name and the moment.
- **Return…** — back to the contributor with a note, exactly as a reviewer
  would.

Before it approves, the system re-runs the reconciliation against the position
**as it stands now** — not as it stood when the period was filed. If something
else has moved in between and the period no longer reconciles, it is refused
with the controls named. That is rare, and it is right.

You cannot approve a period you entered, or one you validated. You will not see
a Validate button.

### Variations

On the **Variations** screen, opening a variation marked *Under Review* offers
**Approve**. Approving changes its status and records your name in the audit
log; committed cost follows in the next reporting period, because a variation
moves no figure until the period that carries it is filed.

### Confirming that a payment was made

Approving a payment claim says what a contractor is **owed**. It does not say
the money has left the account, and on the owner's instruction nothing in this
system assumes that it has: **paid is confirmed, never inferred**, and
confirming it is the PMO manager's act alone.

1. Open **Payment Claims** for the development and click the claim.
2. In the panel, press **Confirm payment**.
3. Check the amount — it defaults to what is still outstanding on that claim —
   and enter the value date and the bank or treasury reference.
4. Press **Confirm payment**.

Payments made to date rises by the amount transferred. **Certified does not
move**: the work was certified when the claim was approved, and certifying it
again here would count the same milestone twice. Earned value and actual cost
do not move either — those come from the reporting period.

A transfer that would take payments above what has been certified is refused
(control 14), with the amount that is actually available.

Every other seat sees the claim sitting at *Approved* with a line saying the
PMO manager confirms a payment, so a claim that has not yet been transferred
never looks like an oversight.

### Releasing retention

A claim paid its full net still holds what was withheld from it as security.
At handover and closeout that security is returned, and the door is the same
panel: open a **Paid** claim that still holds retention and the button reads
**Release retention**. The amount defaults to what that claim still holds and
is editable; the register applies the release to the oldest claims first,
which is what a real release run does. It moves **paid** and nothing else,
and control 14 still bounds it.

### Recording and awarding contract packages

A development buys its work in packages over its whole life, not only on the
day it is registered. On **Procurement**, at development level, **Record
package** does both halves:

1. **A new package** — give it a number, a scope, a counterparty and a value.
   Recorded *out to tender* it carries an estimate and commits nobody;
   recorded *awarded* its value moves committed cost at once.
2. **Awarding a tendered package** — pick it at the top of the form. The
   tender's estimate pre-fills and the award corrects it: the real value, the
   real counterparty, the award date.

A package that is already awarded cannot be awarded again, and an award that
would take committed cost past the approved budget is refused with the figures
— before anything is written.

### Registering, amending and retiring a development

Adding a development to the portfolio, correcting its details, and taking one
out of it are yours and the administrator's. Nobody else has them, however many
developments they hold — a project manager reports on a development; they do
not decide what it is called or what its authorised budget is.

See section 10 for how all three work; they are the same screens for you.

---

### The operational sub-tabs

Four modules carry a second view behind a tab at the top of the screen.

| Module | Tab | What it shows |
| --- | --- | --- |
| Quality | **Corrective Actions** | What was directed after each non-conformance, who owns it, and whether anybody verified it worked. An action closes only when a verification is recorded — an NCR marked closed with nothing verified means it was filed, not fixed. |
| Risk | **Mitigation Plans** | What is being done about every risk scoring 8 or above, with the score today and the residual its owner is targeting. A low risk gets no plan: writing one for every entry makes the register paperwork. |
| Manpower | **Attendance & Hours** | The weeks inside the reporting month. They sum to the manhours the period reports, because they are that figure split rather than a second count of it. |
| Manpower | **By Counterparty** | The workforce each contractor is actually supplying, with headcount and hours tied to the register. |

| Quality | **Inspections** | Every inspection carried out, with the non-conformance each failure raised. First time right is the share that passed outright — and because every failure names its non-conformance, the percentage traces back to defects you can open rather than to a figure nobody can follow. |
| Quality | **Material Approvals** | What was submitted before installation and what was decided. A rejected submittal is a delay that has already happened. |
| HSE | **Incidents** | Every safety event, near misses included. TRIR and LTIFR are computed from these rows and the exposure hours — they are not typed. |
| HSE | **Observations** | What somebody saw, hazards and good practice alike. |
| HSE | **Inspections** | Planned HSE inspections and what they found. |
| HSE | **Training & Permits** | Who must hold each certificate and who does; permits issued this month. |
| Manpower | **Resource Plan** | The plan against the actual, and the three months ahead. |
| Equipment | **Maintenance** | What is down, for how long and who has it. No cost — the system holds no equipment rates. |
| Procurement | **Tender Pipeline** | Packages not yet awarded. They carry an estimate and commit nothing. |

Each of these is **derived from the register above it** and cannot disagree
with it. A corrective action names a non-conformance that exists; a mitigation
names a risk that exists; a failed inspection names the NCR it raised. None of
them holds a cost — money reaches the position through packages, certificates,
claims and the period, and nowhere else.

---

## 9. Reader — reading the position

Everything approved is open to you; nothing can be changed by you.

**Approval is publication.** A period that has been filed but not yet approved
is not part of the reported position, and its figures are not shown to you.
On **Review and Approve** you will see the card, which development and period
it is, who filed it, who has validated it, and what it is waiting for. Where
the figures would be, the card says they are withheld until the period is
approved. Once it is approved they appear, and every screen moves with them.

That is deliberate. A figure that has not been through validation and approval
is somebody's working draft, and reporting from a draft is exactly what this
system exists to prevent.

The screens most readers use:

- **Dashboard** — the portfolio at a glance: budget, AFC, variance, indices,
  status counts, the S-curve for the chosen scope, top risks by exposure.
- **Projects** — every development in a table. Click a row, or the eye icon,
  to open its **Overview**.
- **Cost & Financials** — six tabs: summary, by category, monthly cost,
  forecast (three methods and a weighted composite against the adopted AFC),
  cash flow, commitments.
- **Reports** — the report catalogue. Preview any report at the scope you are
  in, then take it away:
  - **Excel** saves a `.csv` of the same figures — the headline four, then a
    row per development. Excel, Numbers and LibreOffice all open it directly.
  - **PDF** opens your browser's print dialogue, where every desktop platform
    offers *Save as PDF*. What prints is the report sheet alone; the
    application around it is hidden.

  Both are produced in your browser from what is on screen, so the file cannot
  disagree with the report it came from, and nothing leaves the machine.
- **Messages** — the speech-bubble button; direct conversations with anybody
  else on the system. See section 3a.
- **Sign out** — the last button on the right.
- **AI Extract** and the assistant — see section 3b.
- **The shield button** — the twenty controls with both sides of every
  comparison. **Export Report (CSV)** saves the list as a spreadsheet file
  from your browser; nothing leaves the machine.
- **The assistant** (the sparkle button) — answers questions about budget,
  risk, variations and schedule for the scope you have chosen. Its answers are
  computed from the figures on the screens by fixed rules; it is not a
  language model and cannot file a figure.
- **Review & Approve** — you can see every filed period and its state, and who
  did what to it. You have no buttons on it.

---

## 10. Administrator

You have every capability above, and you are **not exempt** from separation of
duties.

### Accounts

**Administration → Users.** You are the only role that sees this; everyone else
sees their own account and nothing more.

**To issue an account**, press **Add user**. Enter the email address, which
becomes their identity and their login, their name, and their role. A password
is suggested for you — four words and a number, long enough to be safe and
short enough to read down a telephone — or type your own. Press **Create
account**.

> The password is shown **once**, on the screen, immediately after you create
> the account. It is never shown again, because only a one-way hash of it is
> kept and nobody, including you, can look it up. Send it to the person over
> something private and ask them to change it under their own profile.

**To change an account**, press **Manage** on its row:

- **Role.** Changing it takes effect on that person's very next click. Moving
  somebody out of Project Manager clears their development assignments, since
  no other role has any.
- **Developments** appear for a Project Manager only. Click a development to
  give or take it away, then **Save developments**. They see only what is
  ticked here. No assignment means no access and nothing to file.
- **Reset password** issues a new one and shows it once, exactly as when the
  account was created. Their old password stops working immediately.
- **Withdraw access** stops them signing in and ends any session they have
  open, on their next click. Everything they filed stays exactly as it was,
  with their name on it. **Restore access** puts them back.
- **Remove permanently** appears only for an account that has never filed,
  validated or approved anything. Anything else can only be withdrawn: erasing
  it would leave the audit trail naming somebody who no longer exists.

Three things the system will not let you do, and states plainly when you try:

| You cannot | Because |
| --- | --- |
| Change your own role | Nobody should be able to grant themselves what they were not issued. Ask another administrator |
| Withdraw or remove your own account | It would lock you out of the system you administer |
| Reset your own password here | Yours goes through My Profile, where the current one is required |

### Project assignment

A Project Manager can file only for developments assigned to them, and can see
only those. Absence of an assignment is absence of permission. Set them under
**Manage** on the Users tab.

Every development should have at least one Project Manager assigned, or nobody
can report on it. The current split — seven developments to Muhammad, LND-02
to Momin — is a testing assumption for the dummy-data phase, not an allocation
of responsibility.

### Adding a development

Available to you and to the PMO manager.

**Add Project** at the top right. Id in the form `RES-03` — three capital
letters, a dash, two digits — a name, the portfolio, the delivery route, and
the approved budget in whole riyals. The delivery route follows the policy in
section 1. The form says what is missing or wrong before it lets you create. A
new development registered from these four fields starts with nothing spent, a
control budget of 95% of the approved budget, and a single **Unallocated** work
package and cost line carrying the whole of it; its registers stay empty until
its first period is filed.

#### From the workbook, which is the better way

A development is more than a name and a budget: it has work packages, and those
packages are awarded to contractors. Typing them in one at a time is how a
development gets registered with half its scope missing.

1. **Download template** in the Add Project dialog. Three sheets: *1 Project*,
   *2 Packages*, *3 Contracts*.
2. Fill it in. Keep the header row and the field labels where they are — the
   importer reads them by position and refuses a workbook whose columns have
   moved, rather than reading a contractor's name into the award-value column.
3. **Import filled workbook.** The dialog fills in from what the sheet said and
   shows you what it implies: how many packages, the control budget they come
   to, how many contracts are awarded, and what those commit.
4. **Create Project.**

Three things worth knowing before you fill one in:

- **A package row with no budget is ignored**, and so is a contract row with no
  contractor or no award value. The template ships six example package rows and
  one example contract row so you can see the shape; the ones you do not use
  are simply not registered. The dialog tells you how many rows it ignored, so
  the figures you are looking at are always the figures of the rows it kept.
- **Package budgets become the control budget.** That is the definition: the
  control budget is the part of the approved budget that has been broken into
  packages, and what is left is contingency held centrally.
- **Only awarded contracts reach committed cost.** Leave the award date blank
  while a package is out to tender: it carries an estimate and a place in the
  forecast, and promises nobody anything.

**Importing fills the form; it registers nothing.** Nothing is written until
you press Create Project, which is deliberate — an import that filed straight
into the portfolio would be a way to register a development without looking at
it.

### Amending a development

Yours and the PMO manager's, on the **Projects** screen: the pencil beside a
development opens **Amend**.

This is how placeholder names become the real register. Seven fields:

| Field | What it is |
| --- | --- |
| Project Name | The name the development is known by |
| Portfolio | Residential, Commercial, Mixed Use or Land Development |
| Delivery Route | PMC-Delivered or Self-Execution |
| PMC / Delivering team | Who is managing delivery |
| Approved Budget | The Approved Development Budget, in whole riyals |
| Start | When the programme begins — the reporting calendar is cut against it |
| Planned finish | When it is authorised to finish; the duration follows the pair, and a period reported past this date with work remaining reads **Delayed** |

Every one of them **describes** the development. Not one of them **measures**
it: cost incurred, earned value, certified and paid come from reporting periods
and payment claims that were entered, validated and approved, and no amendment
can reach them. That is not a limitation to work around — it is the reason the
figures on the dashboard mean anything.

A reason for the amendment is required, and it is kept with your name in the
change log.

Two refusals you may meet:

- **"Cannot go below the control budget."** The control budget is the part of
  the approved budget already broken into work packages. Cutting the approved
  figure below it would not shrink the packages; it would only make the two
  disagree. Re-plan the packages first.
- **"Nothing has been changed yet."** An amendment that changes nothing is not
  filed, because a change log full of entries that changed nothing is a change
  log nobody reads.

Only the amendment is recorded — the fields you left alone are left alone, so
correcting a spelling does not restate the budget.

### Closing a development out

Yours and the PMO manager's, on the **Projects** screen, and it is the act for
a development that has been **delivered** — handed over, final account agreed,
finished. It is not the same as archiving, and choosing the right one matters.

Press the tick on the row, give the closeout record — the final account
reference, the board's decision, whatever was actually agreed — and confirm.
Three things then happen.

- **The figures become final.** The development stops accepting periods,
  certificates, payment claims, variations and amendments. Anyone who tries is
  refused with the reason, whatever their role, including an administrator.
  This is what makes the closing figures the record of what was spent rather
  than simply the last numbers anybody happened to enter.
- **It leaves the portfolio arithmetic.** The KPI tiles, the roll-ups and the
  forecast are about the work still in delivery, so a finished development is
  no longer counted in them, and is no longer "on track" or "at risk" — it is
  closed.
- **It stays completely readable.** Every screen still shows it. Scope to it
  and you get its cost tabs, its WBS, its packages, its claims, its documents
  and its whole audit trail exactly as they were on the day it closed, with a
  line at the top of every screen saying so. The **Completed** tab on the
  Projects screen lists what has been delivered, and totals the approved budget
  and the final cost of all of it.

**Reopen** is on the row in the Completed tab, for the cases that happen: a
retention release nobody had recorded, a final account reopened, a defect that
comes back. It puts the development back into the portfolio and back into the
roll-ups, and it starts reporting again. Both the closure and the reopening
stay in the change log, so the record shows what happened rather than only
where it ended up.

### Deleting a development, and getting it back

Yours and the PMO manager's, on the **Projects** screen.

**Delete** takes a development out of the portfolio. It disappears from every
dashboard, every report, every roll-up and every control the moment it is
authorised. Nothing is lost: its position, its registers and its whole audit
trail are kept exactly as they were.

The dialog asks two things, and both are required:

1. **Why.** Written into the change log and shown against the development in
   the Archive.
2. **How many days it is kept.** The system will not accept fewer than
   **thirty** — that is the floor, and the dialog says so rather than leaving
   you with a button that refuses in silence. Thirty is the default; 90 days
   and 1 year are one click; anything up to two years can be typed.

The **Archive** tab on the Projects screen lists what has been deleted, with
the date it went, the reason, and **how many days are left**. Inside that
window, **Restore** puts it back in one click, with everything it had. The
restored development counts in the KPIs and the reconciliation controls again
from that moment, and both the deletion and the restoration stay in the change
log — the record shows what happened, not only where it ended up.

**After the window closes** the development can no longer be restored. The row
says so, and the Restore button explains itself rather than sitting dead. From
then on an administrator may **Remove** it permanently — the one act in this
system with no way back, which is why nobody else has it.

**Remove** is also offered on a development that was registered and never
used, with nothing certified, nothing incurred and no period ever filed: there
is nothing to lose and no audit trail to break.

> **Nothing expires by itself.** The retention period is a date, not a timer.
> Past it the system refuses a restore and offers a permanent removal — which
> somebody has to press, and which is recorded like every other act. Your data
> is never deleted while nobody is looking.

> **Deleted, closed or archived?** Closed means it counted and is finished —
> the record stays in front of everybody, under **Completed**. Deleted means
> it should never have counted, and it is kept in the **Archive** for as long
> as you said. If the work was built, close it out.

### Authorisations

Registering a development, amending it, deleting it, restoring it, closing it
out, reopening it and recording a contract package against it are the acts
that decide what a development IS. On the owner's instruction they take two
people.

**If you are the PMO Controls Manager**, every one of those forms asks you for
a reason and its button says **Send for authorisation** rather than Save. When
you press it, nothing moves: the change waits in the queue with your name and
your reason on it, and the toast tells you so. You can withdraw your own
proposal at any time before it is decided.

**If you are the Director**, the **Authorisations** module in the sidebar is
your queue. Each card carries one line saying what the change would do, the
development it concerns, who proposed it, when, and why. You can:

- **Authorise** it — the change is applied immediately, through the same
  twenty reconciliation controls as any other write. If the position has moved
  since it was proposed and the change would now break one of them, it is
  refused here and the control that failed is named.
- **Decline** it — nothing moves, and your note goes back to the proposer.

A note is required either way. It is the record of the decision, and it is
what the person who proposed the change will read.

**You never authorise your own proposal.** That is refused by the database
itself, not just by the screen. The one exemption is the Owner Admin, whose
changes take effect directly — the same standing exemption they hold for
reporting periods, so one account can run the portfolio when the seats are
away.

One development holds one pending proposal at a time. The second would be
authorised against a development the first had already moved.

### The Administration screen

Five tabs. **Users** is where accounts are issued, given a seat, assigned
developments, reset and withdrawn. **Roles & Permissions** is the live seat
table and **Portfolios & Routes** the live portfolio table — both below.
**Audit Log** is every recorded change — periods approved,
certificates recorded, variations approved, developments registered — with who
and when. **System Settings** shows the count of recorded changes.

### Portfolios and delivery routes

Under **Portfolios & Routes**, an administrator sees every portfolio the
system holds, the colour each is drawn in, and **how many developments are in
it**.

**Add a portfolio** takes a name and a colour. It appears immediately — in the
scope selector, in the Projects register's tabs, in the Dashboard's charts, on
the Add Project form and in the new-development workbook — with no deploy and
no reload. **Add a delivery route** is the same, with a line saying what the
route means instead of a colour.

The colour is one choice, not two: a portfolio is drawn in its own colour
wherever it appears, so the pill on a table and the segment in a chart are the
same key.

Three things the panel will not do:

- **A portfolio a development is in is never removed.** The count beside it is
  what the Remove button refuses on, and the row says so. Move those
  developments to another portfolio first — amend each one under Projects —
  and the button comes alive.
- **A portfolio the product defines is never removed.** The four the system
  was built with are named in its own data.
- **A portfolio cannot be RENAMED, and that is the important one.** Every
  development carries its portfolio's name as its own value, so a rename would
  quietly detach all of them and nothing would look wrong until a roll-up came
  back empty. Add the right one, move the developments across, and remove the
  one that is now empty. Three steps, each of them visible.

> A development can only be registered into a portfolio and onto a delivery
> route the system holds. If a workbook names one that does not exist, the
> import says so by name rather than filing it under the nearest match.

### Seats and capabilities

Under **Roles & Permissions**, an administrator sees every seat the system
holds and the five things a seat can carry:

| Capability | What it means |
| --- | --- |
| **Input** | Files reporting periods and records certificates, for assigned developments only |
| **Validate** | Validates a filed period, or returns it. Never its own input |
| **Approve** | Approves a validated period and a payment claim, and PROPOSES changes to a development |
| **Authorise** | Authorises a proposed change to a development before it takes effect |
| **Administer** | Issues accounts, defines seats, and acts without a second person |

Each is a toggle. Changing one takes effect on that person's **next click** —
they do not need to sign out and back in. **Add a seat** defines a new one:
give it a name (lower case, the way it will appear in a web address), a title
people will recognise, one line saying what it is for, and its capabilities.
It is then offered wherever an account's seat is chosen.

Four things the screen will not let you do, each for a reason:

- **The Owner Admin seat is fixed.** Taking Administer off it is the one click
  that could lock every administrator out of the system.
- **A seat somebody holds cannot be removed.** Move those accounts to another
  seat first — otherwise their next request would find their seat missing.
- **A seat the system defines cannot be removed** — those six are named in the
  code. Their capabilities can still be changed.
- **Exemption from separation of duties is not a toggle.** Only the Owner
  Admin carries it, and granting it to another seat would dissolve the rule
  this system exists to enforce. Changing that is a deliberate act by a
  developer, which is the friction it should have.

### Reset

The **Reset to shipped data** button on System Settings is refused on the
platform unless the deployment has been started with reset explicitly allowed
(`ALLOW_RESET=1`), which is only done while the database holds dummy data. On
the live data set it is disabled: the change log is the audit trail, not
something a button truncates.

---

## 11. Modules, one by one

| Module | What it shows | Who can change it |
| --- | --- | --- |
| My Profile | Your name, picture, password and sign-out | You |
| Dashboard | Roll-up for the chosen scope | — |
| Project Overview | One development: position, curve, top risks, and a **monthly breakdown** — planned value, earned value, actual cost, cost in month, SPI and CPI, one column per month, with the data date marked and later months shown as forecast | Follows filed periods |
| Projects | All developments; drill-down to Overview | PMO manager and Admin register one, by hand or by importing the new-development workbook |
| Project Workspace | One development, every module, every month. The module tab row, the reporting calendar, and the PT_TEMPLATE form on its Monthly Reporting tab. Everyone opens it; each module inside it is offered by the same rule the sidebar uses, so Monthly Reporting appears for the project manager and the administrator only | Everyone reads · contributor files |
| Review & Approve | Filed periods and their state. Not shown to a seat with no part in reporting | Reviewer validates, Approver signs off |
| Authorisations | Changes to a development, proposed and waiting. Shown to the seats that propose and the seats that authorise | PMO manager proposes, Director authorises |
| WBS | The work breakdown with budget, PV, EV, AC per package; expand and collapse; search | Follows filed periods |
| Cost & Financials | Summary, categories, commitments, cash flow, forecast, monthly curve | Follows filed periods and certificates |
| Variations | Variation orders; approval | Approver |
| Change Log | Change requests upstream of variations | — |
| Packages & Contracts | Every contract package with the counterparty holding it, its WBS node, award value, commitment, payments and retention rate; and the same rolled up by counterparty | — |
| Payment Claims | Every claim against a milestone: raised, verified by the consultant, approved by Tazayud, paid; the retention withheld, released and still held as security; and the same by counterparty | Approver, Admin record a claim |
| Evaluation | Each contractor, supplier and consultant scored out of 80 on data the system holds — variations, schedule, claim accuracy, turnaround and quality — with 20 marks reserved for PMO judgement. **Reviewer, approver and administrator only** | — |
| Manpower | Workforce by trade: headcount, manhours, productivity index. No rates and no labour cost, by design | — |
| Equipment | Plant and utilisation percentages. No hire rates, by design | — |
| Quality | Non-conformances, corrective actions, the inspection log and material approvals, with every count taken from the register. First time right is passed-outright over carried-out, traceable to the named inspections behind it | — |
| HSE | Incidents, observations, HSE inspections, training and permits. Exposure hours come from the workforce register; TRIR and LTIFR are computed from the incident register against those hours, per 200,000 hours, so two developments of different sizes report different rates | — |
| Risk | Register with exposure (EMV); the matrix and category breakdown are counted from it | — |
| Issues | Live issues | — |
| Messages | Reached from the top bar, not the sidebar. Direct conversations with anyone on the system; a message may name the development it is about | — |
| Reports | The catalogue; preview, then Excel (CSV) or PDF via the print dialogue | — |
| Analytics | Indices and forecast comparison | — |
| Documents | Every document referenced on a variation or non-conformance in scope. References only: no file store is connected, and Open, Download and Upload say so | — |
| Glossary | Every term with the formula the code computes, the six steps of the reporting cycle, and a link to this manual | — |
| Administration | Your account, the roles, the audit log | — |

Every register has a **filter bar**: choose a status or category, or type in
the search box; **Clear** resets. Click a row to open its detail panel; the
**History** tab shows the recorded changes for that development, taken from
the audit log.

---

## 12. Messages you may see, and what they mean

| Message | Meaning | What to do |
| --- | --- | --- |
| *email or password is incorrect* | Sign-in refused | Retype; ask the administrator for a new password |
| *this account is no longer active* | Your account was removed or changed while you were signed in | Sign in again; contact the administrator |
| *role X may not …* | Your role does not include that act | Nothing — it is not yours to do |
| *… is not assigned to …* | The development is not assigned to you | Ask the administrator to assign it |
| *the person who entered a period cannot validate it* (or approve, or return) | Separation of duties | A different person must do it |
| *the person who validated a period cannot also approve it* | Separation of duties | A different person must approve |
| *would break N of 17 reconciliation controls: …* | The figures do not agree with each other | Correct them; the controls are named |
| *Out by 1,234,567* on the entry screen | Two sides of a check differ | Adjust until they match |
| *period N … has already been validated or approved; it cannot be replaced* | You are re-filing a period that has moved on | Ask a reviewer to return it first |
| *a return needs a note saying why* | You pressed Return with no note | Type the reason |
| *the request body is too large* | An upload over the limit | Use the unmodified template |
| *the current password is incorrect* | Changing your password needs the one you have now | Retype it; ask the administrator to reset it if you have forgotten |
| *a password must be at least 12 characters* | Too short | Use a phrase rather than a word |
| *… already has an account* | That email address is already issued | Manage the existing account instead of issuing a second |
| *… has filed or approved work and cannot be erased* | Their name is in the audit trail | Withdraw the account instead; it keeps the history |
| *you cannot change your own role* | Nobody grants themselves a role | Ask another administrator |
| *only a project manager holds development assignments* | You tried to assign a development to another role | Change the role first, or assign it to a Project Manager |
| *Document extraction is not configured* | No model is connected on this deployment | Enter the period on the workspace's Monthly Reporting tab; record certificates on the Cash Flow tab |
| *no such development* on a link you were sent | It is not assigned to you | Ask the administrator to assign it, or ask a colleague who holds it |
| *… has reported figures and can only be archived, not removed* | You tried to erase a development that has reported something | Archive it instead; its history has to survive |
| *… was closed out on … and no longer accepts figures* | The development has been closed out; its figures are final | If it genuinely still has something to record, reopen it from the Completed tab first |
| *role … may not see archived developments* | Only the PMO manager and the administrator can | Ask one of them |
| *The figures in this period are not shown because it has not been approved* | You are a Director and the period is still in the workflow | Wait for approval; approval is what publishes figures |
| *Exceeds cost incurred: only N SAR of actual cost is not yet certified* | The certificate is larger than the uncertified cost | File the period that reports the work first |
| *No document store is connected in this release* | Documents are listed by reference only | Keep the file where it is held today |

---

## 13. Getting help

The **?** button at the top right opens this manual. For an account, a
password or an assignment, contact the administrator. For a figure that looks
wrong, open the shield button: if a control is failing it will say which, and
the History tab on the register shows what changed and who changed it.
