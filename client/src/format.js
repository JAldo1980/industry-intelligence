const UK_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Shows an ISO date in UK style, such as 9 Nov 2026. Free-text dates from sources are left as published. */
export function ukDate(value) {
  return /^\d{4}-\d{2}-\d{2}/.test(String(value)) ? UK_DATE.format(new Date(value)) : value;
}
