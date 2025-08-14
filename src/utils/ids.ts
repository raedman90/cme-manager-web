import { v4 as uuidv4 } from "uuid";

export function generateMaterialCode() {
  const d = new Date();
  const ymd = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join("");
  const short = uuidv4().split("-")[0].toUpperCase();
  return `MAT-${ymd}-${short}`; // ex.: MAT-20250810-AB12CD
}