export const locale = 'th-TH';
export const timeZone = 'Asia/Bangkok';

// Display helpers only. Monetary calculations belong to their own domain tasks.
export function formatBaht(amount: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency: 'THB', minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(instant: Date): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, dateStyle: 'long', timeStyle: 'short',
  }).format(instant);
}

export function formatDate(instant: Date): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, dateStyle: 'long',
  }).format(instant);
}

export function formatTime(instant: Date): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, timeStyle: 'short',
  }).format(instant);
}
