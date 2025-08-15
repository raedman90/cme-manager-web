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

export async function svgToPngDataUrl(svgEl: SVGSVGElement, scale = 2): Promise<string> {
  let width = 0, height = 0;
  const bbox = (svgEl as any).getBBox?.();
  if (bbox && bbox.width && bbox.height) {
    width = bbox.width;
    height = bbox.height;
  } else {
    const rect = svgEl.getBoundingClientRect();
    width = rect.width || parseFloat(svgEl.getAttribute("width") || "0") || 600;
    height = rect.height || parseFloat(svgEl.getAttribute("height") || "0") || 300;
  }

  const xml = new XMLSerializer().serializeToString(svgEl);
  const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
  const imgSrc = `data:image/svg+xml;base64,${svg64}`;

  const img = new Image();
  img.crossOrigin = "anonymous";

  const canvas = document.createElement("canvas");
  const dpr = (window.devicePixelRatio || 1);
  const effScale = Math.max(scale, 2 * dpr); // eleva DPI em displays retina
  canvas.width = Math.max(1, Math.floor(width * effScale));
  canvas.height = Math.max(1, Math.floor(height * effScale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado");

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = (e) => reject(e);
    img.src = imgSrc;
  });

  return canvas.toDataURL("image/png");
}