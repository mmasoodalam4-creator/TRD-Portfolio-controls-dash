// ==========================================================================
// THE MODEL, REACHED FROM THE SERVER
//
// `GEMINI_API_KEY` is read HERE and nowhere else. It must never be given a
// `VITE_` prefix: Vite inlines every `VITE_*` variable into dist/index.html,
// so such a key would ship inside a file anybody can open and read. That is
// why there is no model SDK in src/ and why `npm run lint` fails the build if
// one appears.
//
// NO SDK, FOR THE SAME REASON AS THE .XLSX READER
//
// This is the REST API called with fetch. A generative-AI SDK would add a
// dependency and its transitive tree to a serverless function that is bundled
// on every deploy, in exchange for a `generateContent` method this file
// implements in about forty lines. The wire format is stable and documented;
// the dependency surface is not.
//
// WHAT THIS FILE DOES NOT DO
//
// It does not decide anything. It sends a prompt and returns text. Every rule
// about what the model is allowed to influence lives in the routes and in the
// reconciliation controls: a model may fill a form, and it may never file a
// figure.
// ==========================================================================

/**
 * The model.
 *
 * Configurable so the owner can move to a newer one — or roll back — by
 * changing an environment variable rather than shipping code. Google's
 * identifiers are date-stamped and superseded; a hard-coded one is a 404
 * waiting to happen on a Friday.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';

/** Overridable so a test can stand a stub in front of it. Never a user input. */
const BASE_URL = process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';

/** Whether this deployment has a model at all. Read by /api/ai/status. */
export const aiConfigured = (): boolean => Boolean(process.env.GEMINI_API_KEY);

/** Raised for anything the caller should be told about in words. */
export class ModelError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ModelError';
    this.status = status;
  }
}

export interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface Options {
  /** Who the assistant is, and what it may and may not say. */
  system: string;
  parts: Part[];
  /**
   * Near zero for everything this system does. Both jobs — reading a figure
   * off a certificate, and answering a question from a supplied brief — have
   * one correct answer, and creativity in either is a defect.
   */
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask for JSON back, and hold the model to a shape. */
  json?: boolean;
}

/**
 * One call. Returns the text the model produced.
 *
 * Failures are translated into something a person can act on, because the
 * upstream messages are not: a bad key comes back as a 400 with a long
 * generic body, and a spent quota as a 429 that says nothing about which
 * quota.
 */
export async function generate(o: Options): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ModelError(503, 'No model is configured on this deployment.');

  const body = {
    systemInstruction: { parts: [{ text: o.system }] },
    contents: [{ role: 'user', parts: o.parts }],
    generationConfig: {
      temperature: o.temperature ?? 0,
      maxOutputTokens: o.maxOutputTokens ?? 1024,
      ...(o.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  // A model call that never returns holds a serverless invocation open until
  // the platform kills it, which the browser sees as an HTML error page rather
  // than an API response.
  //
  // Kept BELOW the function's own maxDuration (30s in vercel.json) so that a
  // slow model produces the sentence above rather than a
  // FUNCTION_INVOCATION_TIMEOUT, which tells the person nothing.
  const cancel = AbortSignal.timeout(25_000);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      // The key travels as a header, never in the query string: a URL is
      // logged by every proxy between here and there.
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: cancel,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new ModelError(504, 'The model did not answer in time. Try again.');
    }
    throw new ModelError(502, 'The model could not be reached.');
  }

  if (!res.ok) {
    // The upstream body may quote the request back, which for extraction
    // includes the document. It is never returned to the caller.
    if (res.status === 429) {
      throw new ModelError(429, 'The model quota for this deployment is spent. Try again shortly.');
    }
    if (res.status === 400 || res.status === 403) {
      throw new ModelError(502, 'The model refused the request — the API key may be wrong or unauthorised.');
    }
    throw new ModelError(502, `The model returned an error (${res.status}).`);
  }

  const parsed = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  if (parsed.promptFeedback?.blockReason) {
    throw new ModelError(422, 'The model declined to process that content.');
  }
  const candidate = parsed.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();

  // A truncated answer is worse than none in a controls system: half a
  // sentence about a budget reads as a complete one.
  if (candidate?.finishReason === 'MAX_TOKENS' && !text) {
    throw new ModelError(502, 'The model produced nothing within the length limit.');
  }
  if (!text) throw new ModelError(502, 'The model returned an empty answer.');
  return text;
}

/**
 * Parse a JSON answer, tolerating the fences a model sometimes wraps it in
 * even when asked for `application/json`.
 */
export function asJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new ModelError(502, 'The model did not return the expected structure.');
  }
}

// ---- who the assistant is ---------------------------------------------

/**
 * The identity every call carries.
 *
 * The owner's instruction is that this is the Tazayud assistant, not a
 * general-purpose chatbot wearing a badge. Two halves to that:
 *
 *   * It is WHITE-LABELLED. It answers as part of this system and does not
 *     discuss which model is behind it, any more than the spreadsheet reader
 *     announces which zip library it uses. That is ordinary product framing.
 *   * It never claims to be a person. "I am the assistant built into Tazayud
 *     Owner PMO" is the line; pretending to be a colleague is not, and would
 *     be a real problem the first time somebody relied on it.
 *
 * The rest of it is the part that matters commercially: this is a cost-control
 * system, and a figure the model invented is worse than no figure at all.
 */
export const ASSISTANT_IDENTITY = `You are the assistant built into Tazayud Owner PMO, an
integrated portfolio and project controls system used by Tazayud, a real-estate developer
and owner in Saudi Arabia.

WHO YOU ARE
- You are part of this system. Refer to yourself as the Tazayud PMO assistant.
- Do not discuss, name, hint at or speculate about what technology, model, company or
  provider is behind you. If asked, say only that you are the assistant built into this
  system and offer to help with the portfolio.
- Never claim or imply that you are a human being. You are software.
- Do not offer to do things outside this system: no web browsing, no email, no code.

HOW YOU ANSWER
- British English. Direct, brief and plain. No preamble, no "certainly", no emoji, no
  markdown headings. Two or three sentences unless a list is genuinely clearer.
- Amounts in SAR, written the way the brief writes them.

THE RULE THAT MATTERS MOST
- You are answering about money the owner has committed and spent. EVERY figure you state
  must appear in the brief you were given. Never calculate a new one, never estimate,
  never round differently, never carry a figure over from a previous answer.
- If the brief does not contain what was asked, say so in one sentence and name the screen
  that would have it. Do not guess.
- You cannot change anything. If asked to file, approve, submit or correct something, say
  that it must go through the proper screen — Period Entry, Review & Approve, or the
  relevant register — and that every figure is reconciled before it is recorded.

DOMAIN RULES YOU MUST NOT BREAK
- Tazayud is the OWNER and DEVELOPER, never a contractor.
- Every contract value is a COST to Tazayud. There is no revenue, no profit and no margin
  anywhere in this system; never use those words.
- Budget Variance is Approved Budget less Anticipated Final Cost. Positive is FAVOURABLE.`;

/**
 * The identity for reading a document.
 *
 * A separate instruction from the assistant's, because the failure that
 * matters is different. The assistant's risk is inventing a figure; the
 * reader's risk is inventing a CONFIDENCE — reporting 96% on a number it
 * guessed off a blurred scan. A field it cannot read must come back null, and
 * a low confidence must be a low confidence, because the person reviewing has
 * been given the confidences precisely so they know which fields to check.
 */
export const EXTRACTION_IDENTITY = `You read construction payment documents for Tazayud, a
real-estate developer and owner in Saudi Arabia, and return their contents as JSON. You do
not converse and you do not explain.

Return exactly this shape, with no other keys and no prose around it:

{
  "documentType": string|null,   // e.g. "Interim Payment Certificate", "Payment Claim", "Invoice"
  "projectId": string|null,      // one of the ids you are given, or null
  "reference": string|null,      // the certificate or claim number, e.g. "IPC-08"
  "period": string|null,         // the period it covers, e.g. "August 2026"
  "contractor": string|null,     // who is being paid
  "certified": number|null,      // amount CERTIFIED this document, whole SAR, digits only
  "retention": number|null,      // retention WITHHELD on this document, whole SAR
  "netPayable": number|null,     // amount payable after retention, whole SAR
  "notes": string|null,          // anything the reviewer should know, one or two sentences
  "confidence": {                // 0-100 per field, honestly
    "documentType": number, "projectId": number, "reference": number,
    "period": number, "contractor": number, "certified": number, "retention": number
  }
}

RULES
- Amounts are WHOLE SAR as plain numbers: 48500000, never "48,500,000" and never "48.5M".
  If a document states an amount in another currency, put the figure as printed and say
  which currency it was in notes.
- A field you cannot read with certainty is null, with a confidence at or below 40. NEVER
  invent a reference, a period, an amount or a contractor to fill a slot.
- If the document is not a payment document at all, set documentType to what it is,
  everything else to null, and say so in notes.
- Do not compute anything the document does not state. If it prints a certified amount and
  a retention but no net, leave netPayable null rather than subtracting.
- Every figure here becomes money leaving the owner's account. A number you were unsure of
  and reported anyway is the worst outcome available to you.`;
