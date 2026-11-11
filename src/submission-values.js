// A submission's values as its readers read them (ADR 0045), on the Submissions page and in a
// form's CSV alike: a field's value as text, and a moment in a time zone. It imports nothing, so
// that the editor's code in the browser runs it as the service does.

// A field's value as text: a text as it came, a box ticked or not as the reader's words for
// either, `yes` and `no`, or the boxes ticked, a comma and a space between.
export function valueText(value, { yes, no }) {
  if (value === true) return yes;
  if (value === false) return no;
  if (Array.isArray(value)) return value.join(', ');
  return String(value ?? '');
}

// A moment, as anything `Date` takes, written as `YYYY-MM-DD HH:MM:SS` in a time zone by its IANA
// name, whose first ten characters are its day there.
export function momentIn(timeZone) {
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  return (at) => {
    const part = Object.fromEntries(format.formatToParts(new Date(at)).map(({ type, value }) => [type, value]));
    return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}:${part.second}`;
  };
}
