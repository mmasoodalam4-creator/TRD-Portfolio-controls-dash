import { useState } from 'react';
import { Ic, Filters, applyFilters, toast } from '@/components';
import { useScope } from '@/state/ScopeProvider';
import { useRegistersFor } from '@/state/DataProvider';

interface DocRef {
  name: string;
  type: string;
  project: string;
  ref: string;
  date: string;
  by: string;
}

const COLUMNS = ['Document Name', 'Type', 'Project', 'Attached To', 'Date', 'By', 'Actions'];

const NOT_CONNECTED = 'No document store is connected in this release';

/**
 * Document references, and the second entry point to AI extraction.
 *
 * This system holds references to documents, not the files: every attachment
 * named on a variation or a non-conformance in scope is listed here, against
 * the record that names it. There is no file store behind the list yet, and
 * the screen says so when asked to open, download or upload — it used to
 * list six fixed RES-01 files whatever the scope, and "download" them with a
 * toast.
 */
export function Documents({ openAI, canEdit }: { openAI: () => void; canEdit: boolean }) {
  const { list } = useScope();
  const registersFor = useRegistersFor();
  const [filters, setFilters] = useState<Record<string, string>>({});

  const docs: DocRef[] = list.flatMap((p) => {
    const r = registersFor(p.id);
    return [
      ...r.variations.flatMap((v) => v.docs.map((name) => ({
        name, type: 'Variation', project: p.id, ref: v.no, date: v.date, by: v.by,
      }))),
      ...r.ncrs.flatMap((n) => n.docs.map((name) => ({
        name, type: 'Quality', project: p.id, ref: n.no, date: n.raised, by: n.resp,
      }))),
    ];
  });

  const rows = applyFilters(docs, filters, { Type: 'type', Project: 'project' });
  const unavailable = (what: string, name: string) => { toast(`${what} unavailable`, `${NOT_CONNECTED} — ${name} is a reference only`, 'info'); };

  return (
    <div className="fade-up">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-b">
          <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 15 }}>Document Centre</h3>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {`${docs.length} document reference${docs.length === 1 ? '' : 's'} across ${list.length} development${list.length === 1 ? '' : 's'} in scope`}
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {/* The seats the server refuses are not offered the button — the
                  same rule the sidebar follows. A reader pressing it learnt
                  only that the system does not know who they are. */}
              {canEdit && <button type="button" className="btn btn-ai" onClick={openAI}>{Ic('ai', 15)}AI Extract from Document</button>}
              <button type="button" className="btn btn-primary"
                onClick={() => { toast('Upload unavailable', NOT_CONNECTED, 'info'); }}>{Ic('upload', 15)}Upload</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <Filters fields={[
            { label: 'Type', opts: ['All', 'Variation', 'Quality'] },
            { label: 'Project', opts: ['All', ...list.map((p) => p.id)] },
          ]} values={filters} onChange={(label, v) => setFilters((f) => ({ ...f, [label]: v }))} />

          <div className="tbl-wrap">
            <table>
              <thead><tr>{COLUMNS.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={`${d.project}-${d.ref}-${d.name}`}>
                    <td>
                      <div className="row" style={{ gap: 9 }}>{Ic('file', 16, '#2F6DD0')}<b>{d.name}</b></div>
                    </td>
                    <td><span className="pill b-blue">{d.type}</span></td>
                    <td><span className="tid">{d.project}</span></td>
                    <td>{d.ref}</td>
                    <td>{d.date}</td>
                    <td>{d.by}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Open ${d.name}`}
                          onClick={() => { unavailable('Open', d.name); }}>{Ic('eye', 14)}</button>
                        <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Download ${d.name}`}
                          onClick={() => { unavailable('Download', d.name); }}>{Ic('download', 14)}</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} className="muted" style={{ textAlign: 'center', padding: 18 }}>
                    {docs.length === 0
                      ? 'No documents are referenced by the records in scope.'
                      : 'No documents match the current filters.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
