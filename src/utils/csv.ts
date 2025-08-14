export type CsvHeader<T> = { key: keyof T | string; label: string };

export function toCSV<T>(rows: T[], headers: CsvHeader<T>[], delimiter = ",") {
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (s.includes("\"")) s = s.replace(/\"/g, '""');
    if (s.includes(delimiter) || s.includes("\n") || s.includes('"')) s = `"${s}"`;
    return s;
  };
  const head = headers.map((h) => h.label).join(delimiter);
  const body = rows.map((r: any) => headers.map((h) => escape(r[h.key as any])).join(delimiter));
  return [head, ...body].join("\n");
}

export function downloadCSV(filename: string, csv: string, includeBOM = true) {
  const blob = new Blob([includeBOM ? "\uFEFF" : "", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}