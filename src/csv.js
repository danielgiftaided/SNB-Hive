export const plainDashes = value => String(value ?? "").replace(/[–—]/g, "-");

export function downloadCSV(headers, rows, filename, { textColumns = [] } = {}) {
  const escapeCell = (value, asText = false) => {
    let text = plainDashes(value);
    // CSV quotes alone do not stop Excel converting phone numbers to numbers.
    // A string literal preserves prefixes/zeroes; double embedded quotes so
    // cell contents remain literal text within the Excel expression.
    if (asText && text !== "") text = `="${text.replace(/"/g, '""')}"`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  // Excel needs the UTF-8 marker to preserve pound signs and accented names.
  const csv = "\uFEFF" + [
    headers.map(value => escapeCell(value)),
    ...rows.map(row => row.map((value, index) => escapeCell(value, textColumns.includes(index)))),
  ]
    .map(row => row.join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
