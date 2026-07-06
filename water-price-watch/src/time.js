const adelaideFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Adelaide',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

export function formatAdelaideTime(date = new Date()) {
  return adelaideFormatter.format(date).replace(',', '');
}
