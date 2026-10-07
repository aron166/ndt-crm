import * as XLSX from "xlsx";

/**
 * Parse an uploaded xlsx/csv buffer. CSV is decoded by us: SheetJS reads a
 * BOM-less UTF-8 CSV buffer as cp1252, which turns "Cégnév" into "CÃ©gnÃ©v".
 */
export function readWorkbook(fileName: string, buf: Buffer): XLSX.WorkBook {
  if (/\.csv$/i.test(fileName)) {
    // Strict UTF-8 first; invalid bytes mean a legacy Hungarian Excel "CSV" save, which is cp1250.
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder("windows-1250").decode(buf);
    }
    return XLSX.read(text.replace(/^﻿/, ""), { type: "string", cellDates: true });
  }
  return XLSX.read(buf, { type: "buffer", cellDates: true });
}
