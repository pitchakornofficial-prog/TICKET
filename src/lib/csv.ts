/** Quote one RFC 4180 CSV cell and neutralize spreadsheet formula prefixes. */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(...values: Array<string | number>): string {
  return values.map(csvCell).join(',');
}
