import { createContext, useContext } from 'react';

/**
 * THE PROJECT BAND, WHEN A MODULE IS BEING SHOWN INSIDE THE WORKSPACE.
 *
 * The workspace is one screen per development: a band, a module tab row, the
 * month strip, then the module itself. The modules it shows are the SAME
 * screens the sidebar routes to — Cost, Quality, Claims and the rest — so each
 * one already draws its own `ProjBand`, and each one draws it with metrics
 * that belong to that module (AFC and variance on Cost, open NCRs on Quality).
 *
 * Rendering both would show the band twice; defining the metrics again in the
 * workspace would put the same figures in two files, which is how two screens
 * come to disagree. So the band is PORTALLED: the workspace publishes a slot
 * above its tab row, and `ProjBand` renders into it instead of in place. One
 * definition, in the module that owns it, drawn where the design wants it.
 *
 * `register` exists for the modules that draw no band at all — Monthly
 * Reporting, Documents. The workspace shows its own default band while none is
 * portalled in, and steps out of the way as soon as one is.
 *
 * The context default is `undefined`, which means "not inside a workspace" —
 * distinct from a slot that is not mounted yet. A module routed from the
 * sidebar therefore behaves exactly as it always has.
 */
export interface BandHost {
  /** Where the band should render. Null until the workspace has mounted it. */
  slot: HTMLElement | null;
  /** Called by a band on mount; the returned function is its unmount. */
  register: () => () => void;
}

export const BandHostContext = createContext<BandHost | undefined>(undefined);

export const useBandHost = (): BandHost | undefined => useContext(BandHostContext);
