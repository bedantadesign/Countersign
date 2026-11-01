import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The MCP route reads the view built by `npm run build:view`; ship it with that function.
  outputFileTracingIncludes: {
    '/mcp': ['./mcp-dist/**'],
  },
};

export default config;
