import * as XLSX from "xlsx";

/**
 * Parse an uploaded xlsx/csv buffer. CSV is decoded as UTF-8 ourselves: SheetJS
 * reads a BOM-less CSV buffer as cp1252, which turns "Cégnév" into "CÃ©gnÃ©v".
 */
export function readWorkbook(fileName: string, buf: Buffer): XLSX.WorkBook {
  if (/\.(csv|txt)$/i.test(fileName)) {
    // ponytail: assumes UTF-8 CSV (Excel "CSV UTF-8", Sheets, our own exports); a cp1250 legacy CSV would need a codepage pick.
    const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
    return XLSX.read(text, { type: "string", cellDates: true });
  }
  return XLSX.read(buf, { type: "buffer", cellDates: true });
}
