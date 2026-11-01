/**
 * A minimal chat host for e2e tests: a real MCP client talks to this site's /mcp, and the SDK's own
 * AppBridge renders the view in a sandboxed iframe, the way a chat client does.
 */
import { AppBridge, PostMessageTransport, type McpUiStyles } from '@modelcontextprotocol/ext-apps/app-bridge';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

/** Hosts send only the variables they have; the rest stay undefined. */
export const HOST_VARIABLES = {
  '--color-background-primary': 'rgb(255, 255, 255)',
  '--color-background-secondary': 'rgb(240, 238, 230)',
  '--color-text-primary': 'rgb(20, 20, 19)',
  '--font-sans': '"Host Sans", Arial, sans-serif',
  '--border-radius-lg': '12px',
} as Partial<McpUiStyles> as McpUiStyles;

interface HostState {
  ready: boolean;
  reports: string[];
  displayMode: 'inline' | 'fullscreen';
  error?: string;
}
const state: HostState = { ready: false, reports: [], displayMode: 'inline' };
(window as unknown as { host: HostState }).host = state;

async function main() {
  const params = new URLSearchParams(location.search);
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';

  const client = new Client({ name: 'test-host', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', location.href)));
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === 'run_month_end');
  const uri = (tool?._meta?.ui as { resourceUri?: string } | undefined)?.resourceUri;
  if (!tool || !uri) throw new Error('run_month_end has no view');
  const resource = await client.readResource({ uri });
  const html = (resource.contents[0] as { text?: string }).text ?? '';

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.title = 'Countersign';
  document.body.append(iframe);

  const bridge = new AppBridge(
    client,
    { name: 'test-host', version: '0.0.0' },
    { serverTools: {}, updateModelContext: { text: {} } },
    {
      hostContext: {
        theme,
        platform: 'web',
        styles: { variables: HOST_VARIABLES },
        containerDimensions: { maxHeight: 6000 },
        displayMode: 'inline',
        availableDisplayModes: ['inline', 'fullscreen'],
      },
    },
  );
  bridge.onupdatemodelcontext = async (p) => {
    const text = p.content?.map((c) => (c.type === 'text' ? c.text : '')).join('\n') ?? '';
    state.reports.push(text);
    return {};
  };
  bridge.onsizechange = async ({ height }) => {
    if (height !== undefined) iframe.style.height = `${height}px`;
  };
  bridge.onrequestdisplaymode = async ({ mode }) => {
    state.displayMode = mode === 'fullscreen' ? 'fullscreen' : 'inline';
    bridge.sendHostContextChange({ displayMode: state.displayMode });
    return { mode: state.displayMode };
  };
  const initialized = new Promise<void>((resolve) => {
    bridge.oninitialized = () => resolve();
  });

  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  iframe.srcdoc = html;
  await initialized;

  // As a chat does: the view is up while the tool runs, then gets its result.
  bridge.sendToolInput({ arguments: {} });
  bridge.sendToolResult(await client.callTool({ name: tool.name, arguments: {} }));
  state.ready = true;
}

main().catch((error: unknown) => {
  state.error = error instanceof Error ? error.message : String(error);
});
