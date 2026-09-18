import { useState } from 'react';
import { money, idx } from '@/domain/format';
import { spiOf } from '@/domain/calc';
import { isHighRisk } from '@/domain/counts';
import { useScope } from '@/state/ScopeProvider';
import { useRegistersFor, aiIsSimulated, useAi } from '@/state/DataProvider';
import { Ic, useEscape } from '@/components';

interface Message {
  role: 'ai' | 'user';
  text: string;
  /** True when the answer came from the fixed rules rather than the model. */
  computed?: boolean;
}

const SUGGESTED = [
  'Which projects are over AFC?',
  'Summarise portfolio risk exposure',
  'What variations are pending approval?',
  'Show me the worst SPI project',
];

/**
 * PMO assistant drawer.
 *
 * TWO ANSWERS, AND THE ORDER MATTERS.
 *
 * Where a model is connected, the question goes to the API, which builds a
 * brief from the position THIS PERSON MAY SEE and instructs the model that
 * every figure it states must appear in that brief. The model is doing the one
 * job it is genuinely better at — reading a question asked in a hurry — and
 * none of the job it is worst at, which is arithmetic about money.
 *
 * Where no model is connected, or the call fails, the fixed rules below answer
 * instead. They compute from the same projects and registers the screens show,
 * so the assistant cannot contradict the screen behind it. They were written
 * because the demo's four scripted answers quoted figures off the fixtures
 * ("RES-02 at 0.78") that stopped holding the moment the data moved.
 *
 * Neither can change anything. There is no route from this drawer to a write.
 */
export function AIAssistant({ onClose }: { onClose: () => void }) {
  const { scope, list, totals: a } = useScope();
  const registersFor = useRegistersFor();
  const { status, ask: askModel } = useAi();
  const [msgs, setMsgs] = useState<Message[]>([{
    role: 'ai',
    text: 'Ask about budget, risks, variations or schedule for the developments in scope. '
      + 'Every figure in an answer is read from the same position the screens show.',
  }]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  useEscape(onClose);

  const variance = a.budget - a.afc;
  const summary = (): string =>
    `In scope: ${a.count} development${a.count === 1 ? '' : 's'}, Approved Budget ${money(a.budget)}, AFC ${money(a.afc)}, `
    + `Budget Variance ${money(variance)} (${variance >= 0 ? 'favourable' : 'unfavourable'}), SPI ${idx(a.spi)}, `
    + `CPI ${idx(a.cpi)}. ${a.onTrack} on track, ${a.atRisk} at risk, ${a.delayed} delayed.`;

  const answer = (text: string): string => {
    if (list.length === 0) return 'There are no developments in scope.';

    if (/afc|over|budget/i.test(text)) {
      const over = list.filter((p) => p.afc > p.budget);
      const tightest = [...list].sort((x, y) => (x.budget - x.afc) - (y.budget - y.afc))[0];
      const lead = over.length
        ? `${over.length} development${over.length === 1 ? ' is' : 's are'} forecast above budget: ${over.map((p) => `${p.id} (AFC ${money(p.afc)} vs budget ${money(p.budget)})`).join(', ')}.`
        : 'No development in scope is forecast above its approved budget.';
      return `${lead} Across ${a.count} in scope, Approved Budget is ${money(a.budget)} and AFC ${money(a.afc)}, `
        + `a ${variance >= 0 ? 'favourable' : 'unfavourable'} variance of ${money(Math.abs(variance))}.`
        + (tightest ? ` The narrowest margin is ${tightest.id} ${tightest.name} at ${money(tightest.budget - tightest.afc)}.` : '');
    }
    if (/risk|exposure/i.test(text)) {
      const risks = list.flatMap((p) => registersFor(p.id).risks.map((r) => ({ ...r, project: p.id })));
      const largest = [...risks].sort((x, y) => y.exposure - x.exposure)[0];
      const high = risks.filter(isHighRisk).length;
      return `Total risk exposure (EMV) in scope is ${money(a.emv)} across ${risks.length} recorded risk${risks.length === 1 ? '' : 's'}, `
        + `${high} rated high.`
        + (largest ? ` The largest single exposure is "${largest.desc}" on ${largest.project} at ${money(largest.exposure)}.` : '');
    }
    if (/variation|pending|approval/i.test(text)) {
      const pending = list.flatMap((p) => registersFor(p.id).variations
        .filter((v) => v.status === 'Under Review' || v.status === 'Pending')
        .map((v) => ({ ...v, project: p.id })));
      const approved = list.flatMap((p) => registersFor(p.id).variations.filter((v) => v.status === 'Approved'));
      const approvedValue = approved.reduce((t, v) => t + v.amount, 0);
      return (pending.length
        ? `${pending.length} variation${pending.length === 1 ? ' is' : 's are'} awaiting approval: ${pending.map((v) => `${v.no} on ${v.project} (${v.title}, ${money(v.amount)})`).join('; ')}.`
        : 'No variations are awaiting approval in scope.')
        + ` Approved variations in scope total ${money(approvedValue)}.`;
    }
    if (/spi|worst|schedule|behind/i.test(text)) {
      const ranked = [...list].sort((x, y) => spiOf(x) - spiOf(y));
      const worst = ranked[0];
      const next = ranked[1];
      return worst
        ? `The lowest SPI in scope is ${worst.id} ${worst.name} at ${idx(spiOf(worst))} (${worst.status}).`
          + (next ? ` ${next.id} follows at ${idx(spiOf(next))}.` : '')
          + ` Scope SPI is ${idx(a.spi)}.`
        : summary();
    }
    return summary();
  };

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setQ('');

    // No model: the fixed rules, at once.
    if (!status?.configured) {
      setMsgs((m) => [...m, { role: 'ai', text: answer(question), computed: true }]);
      return;
    }

    setThinking(true);
    askModel(question, {
      level: scope.level, portfolio: scope.portfolio, project: scope.project,
    })
      .then((reply) => { setMsgs((m) => [...m, { role: 'ai', text: reply }]); })
      .catch((e: unknown) => {
        // A failed call is not a failed question. The fixed rules still know
        // the answer to most of what gets asked here, so they answer, and the
        // person is told which they are reading rather than left to wonder
        // why the tone changed.
        const why = e instanceof Error ? e.message : 'The assistant is unavailable.';
        setMsgs((m) => [...m,
          { role: 'ai', text: answer(question), computed: true },
          { role: 'ai', text: `(${why} That answer was computed from the position instead.)`, computed: true },
        ]);
      })
      .finally(() => { setThinking(false); });
  };

  return (
    <div>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" style={{ width: 440 }} role="dialog" aria-label="PMO Assistant">
        <div className="drawer-h">
          <div className="row" style={{ gap: 10 }}>
            <div className="kpi-ic" style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#2f6dd0,#1e56b0)' }}>
              {Ic('ai', 18, '#fff')}
            </div>
            <div>
              <div className="dh-id" style={{ fontSize: 15 }}>PMO Assistant</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {`${scope.level} scope · ${aiIsSimulated ? 'demonstration data'
                  : status?.configured ? 'reads the live position' : 'computed from the live position'}`}
              </div>
            </div>
          </div>
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} aria-label="Close" onClick={onClose}>{Ic('x', 17)}</button>
        </div>

        <div className="drawer-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{
                padding: '10px 13px', borderRadius: 12, fontSize: 12.5, lineHeight: 1.55,
                background: m.role === 'user' ? 'var(--navy)' : 'var(--bg)',
                color: m.role === 'user' ? '#fff' : 'var(--ink)',
                border: m.role === 'ai' ? '1px solid var(--line)' : 'none',
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ alignSelf: 'flex-start' }}>
              <div style={{
                padding: '10px 13px', borderRadius: 12, fontSize: 12.5,
                background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--muted)',
              }}>Reading the position…</div>
            </div>
          )}
          {msgs.length <= 1 && (
            <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 11, marginBottom: 8, fontWeight: 600 }}>SUGGESTED QUESTIONS</div>
              {SUGGESTED.map((s, i) => (
                <div key={i} className="doc-link" style={{ color: 'var(--ink)' }} role="button" tabIndex={0}
                  onClick={() => ask(s)} onKeyDown={(e) => { if (e.key === 'Enter') ask(s); }}>
                  <span className="row" style={{ gap: 8 }}>{Ic('ai', 14, '#2F6DD0')}{s}</span>
                  {Ic('chevR', 14)}
                </div>
              ))}
            </div>
          )}
          <p className="muted" style={{ fontSize: 11, lineHeight: 1.6, marginTop: 'auto' }}>
            {status?.configured
              ? 'Every figure in an answer comes from the position in scope — the assistant is '
                + 'given those figures and may not compute new ones. It cannot file anything: '
                + 'a change goes through Period Entry, Review & Approve or the register it belongs to.'
              : 'Answers are computed from the figures in scope by fixed rules. They cannot file a figure.'}
          </p>
        </div>

        <div className="drawer-f">
          <input
            aria-label="Ask the assistant"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ask(q); }}
            disabled={thinking}
            placeholder={thinking ? 'Reading the position…' : 'Ask about your portfolio...'}
            style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}
          />
          <button type="button" className="btn btn-ai" aria-label="Send" disabled={thinking}
            onClick={() => ask(q)}>{Ic('send', 15)}</button>
        </div>
      </div>
    </div>
  );
}
