const PATHS = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  dot: ['M12 9a3 3 0 100 6 3 3 0 000-6z'],
  layers: ['M12 4l8 4.5-8 4.5-8-4.5L12 4z', 'M4 12.5l8 4.5 8-4.5', 'M4 16.5l8 4.5 8-4.5'],
  pen: ['M4 20h4L19 9l-4-4L4 16v4z', 'M13 7l4 4'],
  stop: ['M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7L8.5 3z', 'M12 8v5', 'M12 16h.01'],
  file: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'],
  mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
  phone: ['M6 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A13 13 0 014 6a2 2 0 012-2z'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 010 12h-3'],
  clock: ['M12 4a8 8 0 100 16 8 8 0 000-16z', 'M12 8v4.5l3 1.5'],
  chevron: ['M6 9l6 6 6-6'],
  eyeOff: ['M3 3l18 18', 'M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4 9.5 6a14 14 0 01-3.2 3.9', 'M6.5 7.6A14.4 14.4 0 002.5 12c1 2 4.5 6 9.5 6 1.3 0 2.5-.3 3.6-.7', 'M9.9 10a3 3 0 004.1 4.1'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  user: ['M12 4a4 4 0 100 8 4 4 0 000-8z', 'M4.5 20a7.5 7.5 0 0115 0'],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const TIER_ICON = { 0: 'dot', 1: 'layers', 2: 'pen', 3: 'stop' } as const;
export const TIER_LABEL = { 0: 'Just do it', 1: 'Batch review', 2: 'Countersign', 3: 'Stop and verify' } as const;
