import { StrictMode, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  App,
  applyHostFonts,
  applyHostStyleVariables,
  PostMessageTransport,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';
import { Countersign } from '@/components/Countersign';
import { Icon } from '@/components/Icon';
import type { PlanResult } from '../protocol';
import { mcpPlanner, toPlanResult } from './planner';
import '@/app/globals.css';
import './embed.css';

/** The inline height the host gives the view. The review scrolls inside it. */
export const INLINE_HEIGHT = 500;

const app = new App(
  { name: 'Countersign', version: '0.1.0' },
  { availableDisplayModes: ['inline', 'fullscreen'] },
  { autoResize: true },
);

// Every handler goes in before connect(), or the first tool result can arrive with nobody listening.
let settle: (result: PlanResult) => void = () => {};
const first = new Promise<PlanResult>((resolve) => {
  settle = resolve;
});
app.ontoolresult = (result) => settle(result.isError ? toPlanResult(null) : toPlanResult(result.structuredContent));
app.ontoolcancelled = () =>
  settle({ source: 'failed', error: 'The request was cancelled before Claude planned anything.', reason: 'cancelled' });

let context: McpUiHostContext = {};
const listeners = new Set<() => void>();
function applyContext(next: McpUiHostContext) {
  context = { ...context, ...next };
  const root = document.documentElement;
  if (context.theme) root.dataset.theme = context.theme;
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  root.dataset.display = context.displayMode ?? 'inline';

  const dims = context.containerDimensions;
  let height = INLINE_HEIGHT;
  if (dims && 'height' in dims) height = dims.height;
  else if (dims && 'maxHeight' in dims && dims.maxHeight) height = Math.min(INLINE_HEIGHT, dims.maxHeight);
  root.style.setProperty('--embed-h', `${height}px`);

  const inset = context.safeAreaInsets;
  if (inset) document.body.style.padding = `${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px`;
  listeners.forEach((l) => l());
}
app.onhostcontextchanged = applyContext;
app.onteardown = async () => ({});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getContext = () => context;

const planner = mcpPlanner(app, first);
const connected = app.connect(new PostMessageTransport(window.parent, window.parent)).then(() =>
  applyContext(app.getHostContext() ?? {}),
);

function FullscreenToggle() {
  const ctx = useSyncExternalStore(subscribe, getContext);
  if (!ctx.availableDisplayModes?.includes('fullscreen')) return null;
  const full = ctx.displayMode === 'fullscreen';
  return (
    <button
      type="button"
      className="btn btn--quiet btn--icon"
      aria-label={full ? 'Exit full screen' : 'Full screen'}
      title={full ? 'Exit full screen' : 'Full screen'}
      onClick={() => {
        app.requestDisplayMode({ mode: full ? 'inline' : 'fullscreen' }).then(
          (res) => applyContext({ displayMode: res.mode }),
          () => {},
        );
      }}
    >
      <Icon name={full ? 'collapse' : 'expand'} size={14} />
    </button>
  );
}

function View() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    connected.catch(() => setError('Countersign could not connect to this chat.'));
  }, []);

  // Tell the chat model what the person can see and did, so a follow-up question gets a true answer.
  const onReport = useCallback((report: string) => {
    app.updateModelContext({ content: [{ type: 'text', text: report }] }).catch(() => {});
  }, []);

  if (error) {
    return (
      <main className="shell">
        <p role="alert">{error}</p>
      </main>
    );
  }
  return <Countersign planner={planner} embedded onReport={onReport} toolbar={<FullscreenToggle />} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <View />
  </StrictMode>,
);
