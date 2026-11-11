// A CSV file as a spreadsheet reads it by `separator`, after any byte-order mark: a cell that
// starts with a quote runs to the next lone quote, with a doubled quote in it one, and a quote
// anywhere else is a character; a row ends at a line break outside quotes, CRLF, LF or CR. Gives
// its rows, each a list of its cells.
export function readCsv(text, separator) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let fresh = true;
  const endCell = () => {
    row.push(cell);
    cell = '';
    fresh = true;
  };
  for (let at = text.startsWith('\uFEFF') ? 1 : 0; at < text.length; at += 1) {
    const char = text[at];
    if (quoted) {
      if (char === '"' && text[at + 1] === '"') {
        cell += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (fresh && char === '"') {
      quoted = true;
      fresh = false;
    } else if (char === separator) endCell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[at + 1] === '\n') at += 1;
      endCell();
      rows.push(row);
      row = [];
    } else {
      cell += char;
      fresh = false;
    }
  }
  return rows;
}
