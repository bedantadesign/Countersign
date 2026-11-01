import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/newsreader';
import './globals.css';

export const metadata: Metadata = {
  title: 'Countersign',
  description:
    'Unofficial concept prototype: how an agent should ask before it does something you can’t undo. Not affiliated with Anthropic.',
};

export const viewport: Viewport = {
  themeColor: '#f6f2e9',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
