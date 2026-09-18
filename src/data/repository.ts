// ==========================================================================
// THE DATA BOUNDARY
//
// Screens never import fixtures. They go through this interface, so replacing
// the mock with a real API is a change to one file and no screen changes at
// all.
//
// Every method is async even though the mock resolves immediately. That is the
// point: the call sites are already shaped for a network, so whichever backend
// is chosen — the fixtures, a REST API over Postgres, or a hosted provider —
// drops in behind this interface without touching a component.
//
// WHICH ONE IS ACTIVE is decided at build time by VITE_API_URL:
//
//   unset  -> MockRepository. This is what the portable dist/index.html ships
//             with, and it is why the deliverable still opens with a
//             double-click and makes no network requests.
//   set    -> HttpRepository against that origin. The platform build.
//
// No vendor SDK appears anywhere in src/. The API speaks plain HTTP+JSON
// (docs/api-contract.md), so the database provider is a deployment decision
// rather than an application one. eslint.config.js enforces that.
// ==========================================================================
import type { Project } from '@/domain/types';
import {
  SHIPPED_PORTFOLIOS, SHIPPED_ROUTES, type PortfolioRef, type RouteRef,
} from '@/domain/portfolios';

/** Said once, because six methods say it. */
const REFERENCE_NEEDS_PLATFORM =
  'Portfolios and delivery routes are defined on the hosted platform, where there is a '
  + 'database to hold them. This build ships with the four and the two it was built from.';
import { DB } from './index.js';
import type { Mutation, SubmitPeriodMutation } from './mutations.js';
import { loadMutations, saveMutations, clearMutations } from './persistence.js';
import { awardProblem, lifecycleProblem, replayProjects, registersFor } from './project-state.js';
import type {
  AccountSummary, AiStatus, CommitResult, CorporateData, DataSnapshot, ExtractedDocument, Inbox,
  Message, PmoRepository, ProjectRegisters, ProposedChange, Seat, Submission, ProjectImport,
  TemplateFile,
} from './contracts.js';
import { HttpRepository } from './http-repository.js';
import { apiOriginFrom } from './api-origin.js';

export type {
  AiStatus, CommitResult, CorporateData, Correspondent, DataSnapshot, ExtractedDocument, Inbox,
  Message, PmoRepository, ProjectRegisters, ProposedChange, Seat, SeatCapabilities, Submission,
} from './contracts.js';

/*
 * require-await is off for this class on purpose. The mock resolves without
 * awaiting anything, but the async signatures ARE the contract — they are what
 * lets a networked implementation replace this one without a single call site
 * changing. Making them synchronous to satisfy a lint rule would undo the
 * boundary.
 */
/* eslint-disable @typescript-eslint/require-await */
class MockRepository implements PmoRepository {
  private projectsNow(): Project[] {
    return replayProjects(DB.projects, loadMutations());
  }

  /** Archived developments are out of the portfolio, so out of every view. */
  async getProjects(): Promise<Project[]> {
    return this.projectsNow().filter((p) => !p.archived);
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projectsNow().find((p) => p.id === id);
  }

  async getArchivedProjects(): Promise<Project[]> {
    return this.projectsNow().filter((p) => p.archived === true);
  }

  async getRegisters(projectId: string): Promise<ProjectRegisters> {
    const log = loadMutations();
    return registersFor(projectId, DB, replayProjects(DB.projects, log), log);
  }

  /**
   * Record a change. Nothing is ever QUEUED here, and that is not a weaker
   * rule — it is a different deployment.
   *
   * The proposal workflow exists because two named people sign off on what a
   * development is: the PMO Controls Manager proposes and the Director
   * authorises. The self-contained build has no accounts, so there is nobody
   * to be either of them. A queue with one person on both ends is theatre,
   * and the Authorisations screen says so on its own face rather than
   * inventing a Director who does not exist.
   *
   * The SOUNDNESS rules are the same ones the platform applies, from the same
   * functions, so no gesture learned here fails there.
   */
  async commit(mutation: Mutation): Promise<CommitResult> {
    const log = loadMutations();
    const projects = replayProjects(DB.projects, log);
    const refusal = mutation.kind === 'contract:award'
      ? awardProblem(mutation, DB, projects, log)
      : lifecycleProblem(mutation, projects, log, Date.now());
    if (refusal) throw new Error(refusal);
    const next = [...log, mutation];
    saveMutations(next);
    return { queued: false, log: next };
  }

  async getMutations(): Promise<Mutation[]> {
    return loadMutations();
  }

  async reset(): Promise<void> {
    clearMutations();
  }

  /**
   * The demo has no reviewers, so a period entered here takes effect at once.
   * That is not a weaker rule, it is a different deployment: the offline
   * artifact is one person showing figures, not six people sharing a system.
   */
  async submitPeriod(m: SubmitPeriodMutation): Promise<void> {
    saveMutations([...loadMutations(), m]);
  }

  async getSubmissions(): Promise<Submission[]> {
    return [];
  }

  // ---- proposals and seats --------------------------------------------
  //
  // Both need accounts, and there are none here. The queue is EMPTY rather
  // than refusing, because an empty queue is the truth — nothing has been
  // proposed, since everything applies directly. Deciding and defining seats
  // say plainly what they need.

  async getChanges(): Promise<ProposedChange[]> {
    return [];
  }

  async decideChange(): Promise<ProposedChange> {
    throw new Error('Authorising a change needs the hosted platform, where there are '
      + 'accounts to propose and to authorise.');
  }

  async listSeats(): Promise<Seat[]> {
    return [];
  }

  // ---- the vocabulary --------------------------------------------------
  //
  // The four portfolios and the two delivery routes the product ships with,
  // read-only. There is no database here to hold a fifth and nobody to
  // define one, so the panel that edits them says so rather than offering
  // buttons that would refuse.

  async listReference(): Promise<{ portfolios: PortfolioRef[]; routes: RouteRef[] }> {
    return { portfolios: [...SHIPPED_PORTFOLIOS], routes: [...SHIPPED_ROUTES] };
  }

  async addPortfolio(): Promise<PortfolioRef> {
    throw new Error(REFERENCE_NEEDS_PLATFORM);
  }

  async addRoute(): Promise<RouteRef> {
    throw new Error(REFERENCE_NEEDS_PLATFORM);
  }

  async updatePortfolio(): Promise<PortfolioRef> {
    throw new Error(REFERENCE_NEEDS_PLATFORM);
  }

  async updateRoute(): Promise<RouteRef> {
    throw new Error(REFERENCE_NEEDS_PLATFORM);
  }

  async removePortfolio(): Promise<void> {
    throw new Error(REFERENCE_NEEDS_PLATFORM);
  }

  async removeRoute(): Promise<void> {
    throw new Error(REFERENCE_NEEDS_PLATFORM);
  }

  async createSeat(): Promise<Seat> {
    throw new Error('There are no accounts in the self-contained build, so there are no seats.');
  }

  async updateSeat(): Promise<Seat> {
    throw new Error('There are no accounts in the self-contained build, so there are no seats.');
  }

  async deleteSeat(): Promise<void> {
    throw new Error('There are no accounts in the self-contained build, so there are no seats.');
  }

  // ---- accounts and profiles ------------------------------------------
  //
  // There is no sign-in in the self-contained build and there must never be,
  // so there are no accounts to manage and no profile to own. Each of these
  // says so rather than pretending: a screen that offered a password change
  // with nowhere to put it would be a lie told in a demonstration.

  async getTemplate(): Promise<TemplateFile> {
    throw new Error('The reporting workbook is served by the hosted platform.');
  }

  async getProjectTemplate(): Promise<TemplateFile> {
    throw new Error('The new-development workbook is served by the hosted platform.');
  }

  // ---- the model ------------------------------------------------------
  //
  // The offline deliverable makes NO network requests, so it cannot reach a
  // model — which is why the AI flows in this build are scripted and say so
  // on their own face. `aiIsSimulated` is what keeps a scripted certificate
  // out of any build that has a real register behind it.

  async getAiStatus(): Promise<AiStatus> {
    return { configured: false, model: null };
  }

  async askAssistant(): Promise<string> {
    throw new Error('The assistant answers from fixed rules in this build.');
  }

  async extractDocument(): Promise<ExtractedDocument> {
    throw new Error('Reading a document needs the hosted platform.');
  }

  // ---- messages -------------------------------------------------------
  //
  // There are no accounts in this build, so there is nobody to write to. The
  // inbox is empty rather than invented: a scripted conversation between
  // people who do not exist would be the one thing on this screen a person
  // could not tell from the real product.

  async getInbox(): Promise<Inbox> {
    return { people: [], unread: 0 };
  }

  async getConversation(): Promise<Message[]> {
    return [];
  }

  async sendMessage(): Promise<Message> {
    throw new Error('Messaging needs the hosted platform, where there are accounts to write to.');
  }

  async parseProjectTemplate(): Promise<ProjectImport> {
    throw new Error('Importing a workbook needs the hosted platform.');
  }

  async listAccounts(): Promise<AccountSummary[]> {
    return [];
  }

  async createAccount(): Promise<AccountSummary> {
    throw new Error('There are no accounts in the self-contained build.');
  }

  async setAccountRole(): Promise<AccountSummary> {
    throw new Error('There are no accounts in the self-contained build.');
  }

  async setAccountActive(): Promise<AccountSummary> {
    throw new Error('There are no accounts in the self-contained build.');
  }

  async setAccountPassword(): Promise<void> {
    throw new Error('There are no accounts in the self-contained build.');
  }

  async setAccountAssignments(): Promise<AccountSummary> {
    throw new Error('There are no accounts in the self-contained build.');
  }

  async deleteAccount(): Promise<void> {
    throw new Error('There are no accounts in the self-contained build.');
  }

  async updateProfile(): Promise<void> {
    throw new Error('There is no account to hold a profile in this build.');
  }

  async changePassword(): Promise<void> {
    throw new Error('There is no account to hold a password in this build.');
  }

  async actOnSubmission(): Promise<void> {
    throw new Error('There is no review workflow in the self-contained build.');
  }

  async parseTemplate(): Promise<SubmitPeriodMutation> {
    throw new Error('Importing a workbook needs the hosted platform.');
  }

  async getCorporate(): Promise<CorporateData> {
    return {
      // The four the product ships with, and the two delivery routes. There
      // is no database here to hold them and nobody to edit them, so the
      // fixtures answer with the shipped list — spread into a mutable array
      // because the type the boundary serves is one a screen may sort.
      portfolios: [...SHIPPED_PORTFOLIOS],
      routes: [...SHIPPED_ROUTES],
      months: DB.months,
      scurve: DB.scurve,
      activities: DB.activities,
      reconciliation: DB.reconciliation,
      reports: DB.reports,
      notifications: DB.notifications,
      roles: DB.roles,
    };
  }
}

/* eslint-enable @typescript-eslint/require-await */

/**
 * The API origin, or an empty string for the self-contained build.
 *
 * Read once here rather than scattered through the app, so the offline
 * guarantee is decided in a single place.
 */
export const apiUrl: string = (import.meta.env.VITE_API_URL ?? '').trim();

/**
 * The prefix `fetch` actually uses, which is NOT the same string.
 *
 * Two shapes have to be expressible, and only one of them used to be:
 *
 *   "/"                        same origin as the page. The app and the API
 *                              are one deployment — Vercel serves the SPA and
 *                              api/[...path].ts from the same host — so the
 *                              request needs no origin at all.
 *   "https://api.example.com"  a separate API host.
 *
 * Same-origin is the shape to prefer, and it could not be configured before:
 * the empty string is what selects the offline build, so there was no value
 * meaning "here". That left an absolute URL as the only option, and an
 * absolute URL naming even a slightly different host — the branch deployment
 * rather than production, the team alias rather than the short one — makes
 * every call cross-origin. The browser then sends a preflight, and anything
 * that answers it without CORS headers (Vercel's Deployment Protection
 * challenge, most of all) surfaces in the app as a bare "Failed to fetch",
 * with no status to go on because no response was ever delivered.
 *
 * So "/" means same origin and resolves to no prefix, and a trailing slash on
 * an absolute origin is trimmed rather than producing "//api/...".
 *
 * The rule itself lives in ./api-origin so it can be tested on its own;
 * `npm run check:api-origin` drives it.
 */
export const apiOrigin: string = apiOriginFrom(apiUrl);

/**
 * Whether the AI screens are running their built-in demo behaviour.
 *
 * True for the self-contained build, and that is correct there: AIExtract and
 * AIAssistant are scripted — a fixed IPC-08 certificate and deterministic
 * pattern matching over the fixtures. On a laptop, off a file, with fixture
 * data, that is a demonstration of an interaction and nothing is at stake.
 *
 * FALSE for the platform build, and there it must gate the flow entirely,
 * because the same code against a database is a different thing:
 *
 *   - AIExtract's canned extraction ends in `commit({ kind: 'ipc', ... })`.
 *     Pointed at Postgres that writes a certificate nobody issued into the
 *     payment register of a real development.
 *   - AIAssistant's answers name projects and variation values read off the
 *     fixtures. Against real data those sentences are simply false.
 *
 * A controls system whose value is that every figure is traceable cannot have
 * a button that invents one. So until a model is actually wired through
 * /api/ai/*, the platform build says the feature is not configured rather than
 * simulating it. When it IS wired, the same rule as the Excel import applies:
 * extraction fills the form, a person files the period, and the server's ten
 * reconciliation controls still stand between it and the database.
 *
 * The offline build is untouched by this — same screens, same pixels.
 */
export const aiIsSimulated: boolean = !apiUrl;

/** The active repository. */
export const repository: PmoRepository = apiUrl
  ? new HttpRepository(apiOrigin)
  : new MockRepository();

/** Load the whole dataset through the repository interface. */
export async function loadSnapshot(repo: PmoRepository = repository): Promise<DataSnapshot> {
  // One request where the implementation offers one. The fan-out below cost a
  // request per development, on first load and again after every change; on a
  // serverless host each was its own invocation and its own database
  // connection, and registering a development looked as though the application
  // had hung while eleven of them ran.
  if (repo.getSnapshot) return repo.getSnapshot();

  const [projects, corporate] = await Promise.all([repo.getProjects(), repo.getCorporate()]);
  const entries = await Promise.all(
    projects.map(async (p) => [p.id, await repo.getRegisters(p.id)] as const),
  );
  return { projects, registers: Object.fromEntries(entries), corporate };
}
