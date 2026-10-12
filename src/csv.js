export const plainDashes = value => String(value ?? "").replace(/[–—]/g, "-");

export function downloadCSV(headers, rows, filename) {
  const escapeCell = value => `"${plainDashes(value).replace(/"/g, '""')}"`;
  // Excel needs the UTF-8 marker to preserve pound signs and accented names.
  const csv = "\uFEFF" + [headers, ...rows]
    .map(row => row.map(escapeCell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
