import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../route';

afterEach(() => vi.unstubAllEnvs());

describe('/api/plan', () => {
  it('reports live planning as off without credentials, and refuses to plan', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '');
    vi.stubEnv('COUNTERSIGN_LIVE', '');
    expect(await GET().json()).toEqual({ live: false });
    const res = await POST();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'unavailable' });
  });

  it('reports live planning as on with a key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    expect(await GET().json()).toEqual({ live: true });
  });
});
