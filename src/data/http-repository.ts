// ==========================================================================
// THE NETWORKED REPOSITORY
//
// Speaks the plain HTTP+JSON contract in docs/api-contract.md. It knows
// nothing about which database or which provider is behind that contract, and
// that is deliberate: the vendor is a deployment decision, so no vendor client
// library appears here or anywhere else in src/.
//
// It is never constructed by the self-contained build — repository.ts selects
// the mock when VITE_API_URL is unset, so the portable dist/index.html carries
// this class but never calls it, and still makes no network requests.
// ==========================================================================
import type { Project } from '@/domain/types';
import { isPortfolioTone, type PortfolioRef, type PortfolioTone, type RouteRef } from '@/domain/portfolios';
import type { Mutation, SubmitPeriodMutation } from './mutations.js';
import type {
  AccountSummary, AiStatus, CommitResult, CorporateData, DataSnapshot, ExtractedDocument, Inbox,
  Message, PmoRepository, ProjectImport, ProjectRegisters, ProposedChange, Seat, SeatCapabilities,
  Submission, TemplateFile,
} from './contracts.js';

/**
 * A proposal as the wire carries it — snake_case, because it is a database
 * row and the API does not rename columns on the way out.
 */
interface ChangeRow {
  id: number;
  kind: ProposedChange['kind'];
  project_id: string | null;
  payload: ProposedChange['payload'];
  summary: string;
  reason: string;
  state: ProposedChange['state'];
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

const changeFrom = (r: ChangeRow): ProposedChange => ({
  id: r.id,
  kind: r.kind,
  projectId: r.project_id,
  payload: r.payload,
  summary: r.summary,
  reason: r.reason,
  state: r.state,
  requestedBy: r.requested_by,
  requestedAt: r.requested_at,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
});

/** A portfolio and a route as the wire carries them: database rows. */
interface PortfolioWire {
  name: string;
  tone: string;
  sort: number;
  built_in: boolean;
  developments?: number;
}

interface RouteWire {
  name: string;
  describes: string;
  sort: number;
  built_in: boolean;
  developments?: number;
}

const portfolioFrom = (r: PortfolioWire): PortfolioRef => ({
  name: r.name,
  // A tone this build does not know is drawn grey rather than left unstyled:
  // an older browser bundle against a newer database is a real state.
  tone: isPortfolioTone(r.tone) ? r.tone : 'grey',
  sort: r.sort,
  builtIn: r.built_in,
  developments: r.developments ?? 0,
});

const routeFrom = (r: RouteWire): RouteRef => ({
  name: r.name,
  describes: r.describes,
  sort: r.sort,
  builtIn: r.built_in,
  developments: r.developments ?? 0,
});

/** A seat as the wire carries it, for the same reason. */
interface SeatRow {
  role: string;
  title: string;
  describes: string;
  may_input: boolean;
  may_review: boolean;
  may_approve: boolean;
  may_authorise: boolean;
  may_administer: boolean;
  sod_exempt: boolean;
  built_in: boolean;
  holders?: number;
}

const seatFrom = (r: SeatRow): Seat => ({
  role: r.role,
  title: r.title,
  describes: r.describes,
  can: {
    input: r.may_input,
    review: r.may_review,
    approve: r.may_approve,
    authorise: r.may_authorise,
    administer: r.may_administer,
  },
  sodExempt: r.sod_exempt,
  builtIn: r.built_in,
  holders: r.holders ?? 0,
});

/**
 * Bytes as base64, in chunks.
 *
 * `String.fromCharCode(...bytes)` on a whole workbook overflows the argument
 * limit and throws, so the array is walked in 32k pieces.
 */
function base64Of(file: ArrayBuffer): string {
  const bytes = new Uint8Array(file);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Where the bearer token comes from.
 *
 * A function rather than a value because the token is refreshed during a
 * session, and because whoever mints it — our own API, a managed auth service,
 * or a corporate identity provider — is behind this one line.
 */
export type TokenSource = () => string | null;

/** Set by the sign-in flow. Null until someone has authenticated. */
let currentToken: string | null = null;

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

/** Thrown for any non-2xx response, carrying the status so callers can branch. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class HttpRepository implements PmoRepository {
  constructor(
    private readonly origin: string,
    private readonly token: TokenSource = () => currentToken,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    return (await this.send<T>(path, init)).body;
  }

  /**
   * The same call, with the STATUS kept.
   *
   * One route answers two different successes — `/api/mutations` returns 200
   * for a change that was applied and 202 for one that was only proposed —
   * and the difference is what the person is told. `request` throws the status
   * away, which is right for every other route and wrong for that one.
   */
  private async send<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const token = this.token();
    const res = await fetch(`${this.origin}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    if (!res.ok) {
      // The server states why a write was refused — a mutation that would
      // break reconciliation comes back 422 with the failing control named.
      // Surfacing that verbatim is the point; a generic "save failed" would
      // hide exactly the information the controls exist to produce.
      const detail = await res.text().catch(() => '');
      // The API answers refusals as {"error": "<the sentence>"}. The sentence
      // is what the person should read — the 422 naming which control a write
      // would break is the product's whole pitch — and the toast was showing
      // the raw envelope, braces and key included.
      let message = detail;
      try {
        const parsed: unknown = JSON.parse(detail);
        if (parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string') {
          message = (parsed as { error: string }).error;
        }
      } catch { /* not JSON: the text is the message */ }
      throw new ApiError(res.status, message || `${res.status} ${res.statusText}`);
    }

    return { status: res.status, body: (await res.json()) as T };
  }

  getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/projects');
  }

  getSnapshot(): Promise<DataSnapshot> {
    return this.request<DataSnapshot>('/api/snapshot');
  }

  getArchivedProjects(): Promise<Project[]> {
    return this.request<Project[]>('/api/projects?archived=1');
  }

  getTemplate(): Promise<TemplateFile> {
    return this.request<TemplateFile>('/api/periods/template');
  }

  getProjectTemplate(): Promise<TemplateFile> {
    return this.request<TemplateFile>('/api/projects/template');
  }

  parseProjectTemplate(file: ArrayBuffer): Promise<ProjectImport> {
    return this.request<ProjectImport>('/api/projects/parse', {
      method: 'POST', body: JSON.stringify({ file: base64Of(file) }),
    });
  }

  // ---- the model ------------------------------------------------------

  getAiStatus(): Promise<AiStatus> {
    return this.request<AiStatus>('/api/ai/status');
  }

  async askAssistant(question: string, scope: {
    level: string; portfolio?: string; project?: string;
  }): Promise<string> {
    const got = await this.request<{ answer: string }>('/api/ai/assistant', {
      method: 'POST', body: JSON.stringify({ question, ...scope }),
    });
    return got.answer;
  }

  extractDocument(file: ArrayBuffer, mimeType: string): Promise<ExtractedDocument> {
    // Base64 in the body, as with every other binary this API takes: it
    // survives every proxy and serverless runtime without depending on how
    // each handles a raw stream.
    return this.request<ExtractedDocument>('/api/ai/extract', {
      method: 'POST', body: JSON.stringify({ file: base64Of(file), mimeType }),
    });
  }

  // ---- messages -------------------------------------------------------

  getInbox(): Promise<Inbox> {
    return this.request<Inbox>('/api/messages');
  }

  async getConversation(withId: string, mark = true): Promise<Message[]> {
    const got = await this.request<{ messages: Message[] }>(
      `/api/messages/thread?with=${encodeURIComponent(withId)}${mark ? '&mark=1' : ''}`,
    );
    return got.messages;
  }

  sendMessage(to: string, body: string, projectId: string | null): Promise<Message> {
    return this.request<Message>('/api/messages', {
      method: 'POST', body: JSON.stringify({ to, body, projectId }),
    });
  }

  // ---- accounts -------------------------------------------------------

  listAccounts(): Promise<AccountSummary[]> {
    return this.request<AccountSummary[]>('/api/users');
  }

  createAccount(input: {
    email: string; name: string; role: AccountSummary['role']; password: string;
  }): Promise<AccountSummary> {
    return this.request<AccountSummary>('/api/users', {
      method: 'POST', body: JSON.stringify(input),
    });
  }

  setAccountRole(id: string, role: AccountSummary['role']): Promise<AccountSummary> {
    return this.account(id, { role });
  }

  setAccountActive(id: string, active: boolean): Promise<AccountSummary> {
    return this.account(id, { active });
  }

  async setAccountPassword(id: string, password: string): Promise<void> {
    await this.account(id, { password });
  }

  setAccountAssignments(id: string, projects: string[]): Promise<AccountSummary> {
    return this.request<AccountSummary>(`/api/users/${encodeURIComponent(id)}/assignments`, {
      method: 'POST', body: JSON.stringify({ projects }),
    });
  }

  async deleteAccount(id: string): Promise<void> {
    await this.request<{ ok: true }>(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  private account(id: string, body: Record<string, unknown>): Promise<AccountSummary> {
    return this.request<AccountSummary>(`/api/users/${encodeURIComponent(id)}`, {
      method: 'POST', body: JSON.stringify(body),
    });
  }

  // ---- a person's own profile ----------------------------------------

  async updateProfile(patch: { name?: string; avatar?: string | null }): Promise<void> {
    await this.request<unknown>('/api/me/profile', {
      method: 'POST', body: JSON.stringify(patch),
    });
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.request<{ ok: true }>('/api/me/password', {
      method: 'POST', body: JSON.stringify({ current, next }),
    });
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      return await this.request<Project>(`/api/projects/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  getRegisters(projectId: string): Promise<ProjectRegisters> {
    return this.request<ProjectRegisters>(`/api/registers/${encodeURIComponent(projectId)}`);
  }

  getCorporate(): Promise<CorporateData> {
    return this.request<CorporateData>('/api/corporate');
  }

  /**
   * Record a change, or leave a proposal in the Director's queue.
   *
   * The server decides which, on the caller's seat, and says so with the
   * status: 200 carries the change log, 202 carries the proposal. Reading the
   * STATUS rather than sniffing the body is deliberate — a body test would
   * have to guess, and a proposal and a log are both perfectly good JSON.
   *
   * `reason` rides alongside the mutation rather than inside it: the server's
   * field list for each kind does not include it, so it is stripped before
   * the mutation is stored and can never travel into the change log as though
   * it were part of the act.
   */
  async commit(mutation: Mutation, reason?: string): Promise<CommitResult> {
    const { status, body } = await this.send<Mutation[] | { queued: true; request: ChangeRow }>(
      '/api/mutations',
      { method: 'POST', body: JSON.stringify(reason ? { ...mutation, reason } : mutation) },
    );
    if (status === 202 && !Array.isArray(body)) {
      return { queued: true, request: changeFrom(body.request) };
    }
    return { queued: false, log: Array.isArray(body) ? body : [] };
  }

  // ---- proposals ------------------------------------------------------

  async getChanges(): Promise<ProposedChange[]> {
    return (await this.request<ChangeRow[]>('/api/changes')).map(changeFrom);
  }

  async decideChange(
    id: number, action: 'approve' | 'reject' | 'withdraw', note: string,
  ): Promise<ProposedChange> {
    // Approving answers with the applied mutation log beside the decided row;
    // rejecting and withdrawing answer with the row alone. One shape covers
    // both rather than two call sites that have to remember which is which.
    const got = await this.request<ChangeRow | { request: ChangeRow }>(
      `/api/changes/${id}/${action}`,
      { method: 'POST', body: JSON.stringify({ note }) },
    );
    return changeFrom('request' in got ? got.request : got);
  }

  // ---- the vocabulary -------------------------------------------------

  async listReference(): Promise<{ portfolios: PortfolioRef[]; routes: RouteRef[] }> {
    const got = await this.request<{ portfolios: PortfolioWire[]; routes: RouteWire[] }>(
      '/api/reference',
    );
    return { portfolios: got.portfolios.map(portfolioFrom), routes: got.routes.map(routeFrom) };
  }

  async addPortfolio(name: string, tone: PortfolioTone): Promise<PortfolioRef> {
    return portfolioFrom(await this.request<PortfolioWire>('/api/reference', {
      method: 'POST', body: JSON.stringify({ kind: 'portfolios', name, tone }),
    }));
  }

  async addRoute(name: string, describes: string): Promise<RouteRef> {
    return routeFrom(await this.request<RouteWire>('/api/reference', {
      method: 'POST', body: JSON.stringify({ kind: 'routes', name, describes }),
    }));
  }

  async updatePortfolio(
    name: string, patch: { tone?: PortfolioTone; sort?: number },
  ): Promise<PortfolioRef> {
    return portfolioFrom(await this.request<PortfolioWire>(
      `/api/reference/portfolios/${encodeURIComponent(name)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ));
  }

  async updateRoute(
    name: string, patch: { describes?: string; sort?: number },
  ): Promise<RouteRef> {
    return routeFrom(await this.request<RouteWire>(
      `/api/reference/routes/${encodeURIComponent(name)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ));
  }

  async removePortfolio(name: string): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/reference/portfolios/${encodeURIComponent(name)}`, { method: 'DELETE' },
    );
  }

  async removeRoute(name: string): Promise<void> {
    await this.request<{ ok: true }>(
      `/api/reference/routes/${encodeURIComponent(name)}`, { method: 'DELETE' },
    );
  }

  // ---- seats ----------------------------------------------------------

  async listSeats(): Promise<Seat[]> {
    return (await this.request<SeatRow[]>('/api/roles')).map(seatFrom);
  }

  async createSeat(input: {
    role: string; title: string; describes: string; can: SeatCapabilities;
  }): Promise<Seat> {
    return seatFrom(await this.request<SeatRow>('/api/roles', {
      method: 'POST', body: JSON.stringify(input),
    }));
  }

  async updateSeat(role: string, patch: {
    title?: string; describes?: string; can?: SeatCapabilities;
  }): Promise<Seat> {
    return seatFrom(await this.request<SeatRow>(`/api/roles/${encodeURIComponent(role)}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }));
  }

  async deleteSeat(role: string): Promise<void> {
    await this.request<{ ok: true }>(`/api/roles/${encodeURIComponent(role)}`, {
      method: 'DELETE',
    });
  }

  getMutations(): Promise<Mutation[]> {
    return this.request<Mutation[]>('/api/mutations');
  }

  async reset(): Promise<void> {
    await this.request<{ ok: true }>('/api/reset', { method: 'POST' });
  }

  async submitPeriod(m: SubmitPeriodMutation): Promise<void> {
    await this.request<Submission>('/api/periods', {
      method: 'POST',
      body: JSON.stringify(m),
    });
  }

  getSubmissions(): Promise<Submission[]> {
    return this.request<Submission[]>('/api/periods');
  }

  async actOnSubmission(
    id: number, action: 'review' | 'approve' | 'return', note = '',
  ): Promise<void> {
    // Always a JSON object. Every request here carries Content-Type:
    // application/json, and a host that parses JSON bodies before the handler
    // runs — Vercel does — rejects a bare string under that header with a
    // platform 400 the handler never sees. The self-hosted server did not
    // care, so every gate passed while the deployment would have failed.
    await this.request<Submission>(`/api/periods/${id}/${action}`, {
      method: 'POST',
      body: JSON.stringify(action === 'return' ? { note } : {}),
    });
  }

  async parseTemplate(projectId: string, file: ArrayBuffer): Promise<SubmitPeriodMutation> {
    // Base64 in the body: it survives every proxy and serverless runtime
    // without depending on how each handles binary.
    // Wrapped in an object for the same reason as actOnSubmission: the body
    // must be valid JSON under the JSON content type or a pre-parsing host
    // refuses it before the handler runs.
    const parsed = await this.request<{ period: SubmitPeriodMutation }>(
      `/api/periods/parse?project=${encodeURIComponent(projectId)}`,
      { method: 'POST', body: JSON.stringify({ file: base64Of(file) }) },
    );
    return parsed.period;
  }
}
