/**
 * Tiny event bus between the plugin entry (index.js: buttons, life cycle)
 * and the React UI.
 */
type Handler = (payload?: any) => void;
const handlers: {[event: string]: Set<Handler>} = {};
const pending: {[event: string]: any} = {};

export type BusEvent = 'open-settings' | 'ui-shown' | 'ui-hidden';

export function emit(event: BusEvent, payload?: any) {
  const set = handlers[event];
  if (set && set.size) set.forEach(h => h(payload));
  else if (event === 'open-settings') pending[event] = payload === undefined ? true : payload;
}

/** Subscribes. An "open-settings" sent before anyone listened is delivered once. */
export function on(event: BusEvent, h: Handler): () => void {
  (handlers[event] = handlers[event] || new Set()).add(h);
  if (event in pending) {
    const p = pending[event];
    delete pending[event];
    h(p === true ? undefined : p);
  }
  return () => {
    handlers[event] && handlers[event].delete(h);
  };
}
