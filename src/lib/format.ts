const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const inrExact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Money is held as integer paise everywhere; this is the only place it becomes a string. */
export function formatINR(paise: number): string {
  return (paise % 100 === 0 ? inrWhole : inrExact).format(paise / 100);
}

export function maskAccount(accountNumber: string): string {
  return `•••• ${accountNumber.replace(/\D/g, '').slice(-4)}`;
}

/** Groups a raw account number for reading: 4471 0028 1936. */
export function groupAccount(accountNumber: string): string {
  return accountNumber.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Fixture dates are calendar dates, so format them in UTC to keep them from shifting by timezone. */
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

// Clock times are shown in the viewer's own timezone; they are only rendered client-side.
const clockFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
export function formatClock(ms: number): string {
  return clockFmt.format(new Date(ms)).replace(/\s?([ap])m/i, (_, p: string) => ` ${p.toLowerCase()}m`);
}

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
export function formatDay(ms: number): string {
  return dayFmt.format(new Date(ms));
}

/** 4_982_000 -> "1h 23m 02s". Drops leading zero units. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${m}m ${pad(s)}s`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
