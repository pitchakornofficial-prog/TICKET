export const locale = 'th-TH';
export const timeZone = 'Asia/Bangkok';

const bahtFormatter = new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'THB', minimumFractionDigits: 2,
});
const bahtCompactIntFormatter = new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const bahtCompactFracFormatter = new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
  timeZone, dateStyle: 'long', timeStyle: 'short',
});
const dateFormatter = new Intl.DateTimeFormat(locale, {
  timeZone, dateStyle: 'long',
});
const timeFormatter = new Intl.DateTimeFormat(locale, {
  timeZone, timeStyle: 'short',
});

// Display helpers only. Monetary calculations belong to their own domain tasks.
export function formatBaht(amount: number): string {
  return bahtFormatter.format(amount);
}

export function formatBahtCompact(amount: number): string {
  return amount % 1 !== 0
    ? bahtCompactFracFormatter.format(amount)
    : bahtCompactIntFormatter.format(amount);
}

export function formatDateTime(instant: Date): string {
  return dateTimeFormatter.format(instant);
}

export function formatDate(instant: Date): string {
  return dateFormatter.format(instant);
}

export function formatTime(instant: Date): string {
  return timeFormatter.format(instant);
}
