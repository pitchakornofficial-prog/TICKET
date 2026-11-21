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

/**
 * Formats a Date or ISO timestamp into a local 'YYYY-MM-DDTHH:mm' string
 * suitable for HTML5 <input type="datetime-local"> without UTC timezone shift.
 */
export function toLocalDatetimeInputString(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

