/**
 * Parser für DATEV DTVF (Datev-Format) Buchungsstapel-CSVs.
 *
 * Aufbau einer DTVF-Datei:
 *   Zeile 1: Metadaten ("DTVF";700;21;"Buchungsstapel";...;WJ-Beginn;...;Bezeichnung)
 *   Zeile 2: Header (Spaltennamen in Deutsch; Windows-1252)
 *   Zeile 3+: Buchungssätze
 *
 * Zahlenformat: deutsch (Komma), Beträge immer positiv + S/H-Kennzeichen.
 * Datumsformat Belegdatum: MMDD (Jahr kommt aus Wirtschaftsjahr).
 */

import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import type { InsertDatevBooking } from "@shared/schema";

export interface DatevParseResult {
  year: number;
  herkunftKz: string;                 // "RE" oder "AN"
  bezeichnung: string;                // Freitext aus Metadaten
  bookings: Omit<InsertDatevBooking, "euerKonto" | "easCategory" | "manualOverride" | "sourceFile">[];
  skipped: Array<{ reason: string; raw?: string }>;
}

const COLUMN_NAMES = {
  umsatz: "Umsatz (ohne Soll/Haben-Kz)",
  sollHaben: "Soll/Haben-Kennzeichen",
  konto: "Konto",
  gegenkonto: "Gegenkonto (ohne BU-Schlüssel)",
  buSchluessel: "BU-Schlüssel",
  belegdatum: "Belegdatum",
  belegfeld1: "Belegfeld 1",
  buchungstext: "Buchungstext",
  kost1: "KOST1 - Kostenstelle",
  kost2: "KOST2 - Kostenstelle",
  herkunftKz: "Herkunft-Kz",
  buchungsGuid: "Buchungs GUID",
} as const;

/**
 * Liest das File in UTF-8 und fällt bei Replacement-Zeichen auf Windows-1252 zurück.
 */
function decodeBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString("utf-8");
  if (utf8.includes("\uFFFD") || /[\u0080-\u009F]/.test(utf8)) {
    return iconv.decode(buffer, "win1252");
  }
  return utf8;
}

function parseGermanNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseBelegdatum(ttmm: string, year: number): Date | null {
  if (!ttmm) return null;
  // DATEV-Format: TTMM (Tag zuerst, dann Monat)
  const padded = ttmm.padStart(4, "0");
  const dd = parseInt(padded.slice(0, 2), 10);
  const mm = parseInt(padded.slice(2, 4), 10);
  if (!mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  // UTC-Datum, damit Zeitzonen den Tag nicht verschieben
  return new Date(Date.UTC(year, mm - 1, dd));
}

export function parseDtvfCsv(buffer: Buffer, filename: string): DatevParseResult {
  const text = decodeBuffer(buffer);

  // DTVF hat Zeilen mit sehr vielen Spalten (>100). relax_column_count=true ist wichtig.
  const rows: string[][] = parse(text, {
    delimiter: ";",
    quote: '"',
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false,
  });

  if (rows.length < 2) {
    throw new Error(`DTVF-Datei hat zu wenige Zeilen (${rows.length}): ${filename}`);
  }

  const meta = rows[0];
  const header = rows[1];

  // Metadata: WJ-Beginn an Index 12 (YYYYMMDD), Herkunft an Index 7, Bezeichnung an Index 16
  const wjBeginn = meta[12] ?? "";
  const year = parseInt(wjBeginn.slice(0, 4), 10);
  if (!year || year < 2000 || year > 2100) {
    throw new Error(`Kann Wirtschaftsjahr nicht aus Metadaten ableiten: "${wjBeginn}"`);
  }
  const herkunftKz = (meta[7] ?? "").replace(/"/g, "").trim() || "RE";
  const bezeichnung = (meta[16] ?? "").replace(/"/g, "").trim();

  // Header → Spaltenindex-Map
  const colIndex = new Map<string, number>();
  header.forEach((name, i) => {
    if (name) colIndex.set(name.trim(), i);
  });

  const idx = (key: keyof typeof COLUMN_NAMES): number => {
    const i = colIndex.get(COLUMN_NAMES[key]);
    if (i === undefined) {
      throw new Error(`Spalte fehlt: "${COLUMN_NAMES[key]}"`);
    }
    return i;
  };

  const iUmsatz = idx("umsatz");
  const iSH = idx("sollHaben");
  const iKonto = idx("konto");
  const iGK = idx("gegenkonto");
  const iBU = idx("buSchluessel");
  const iBeleg = idx("belegdatum");
  const iBF1 = idx("belegfeld1");
  const iText = idx("buchungstext");
  const iKost1 = idx("kost1");
  const iKost2 = idx("kost2");
  const iGuid = idx("buchungsGuid");

  const bookings: DatevParseResult["bookings"] = [];
  const skipped: DatevParseResult["skipped"] = [];
  const seenGuids = new Set<string>();

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < iGuid + 1) continue;

    const umsatz = parseGermanNumber(row[iUmsatz] ?? "");
    if (umsatz === 0) {
      skipped.push({ reason: "Umsatz=0", raw: row[iText] });
      continue;
    }

    const guid = (row[iGuid] ?? "").trim();
    if (!guid) {
      skipped.push({ reason: "fehlende GUID" });
      continue;
    }
    if (seenGuids.has(guid)) {
      skipped.push({ reason: "duplicate GUID im File", raw: guid });
      continue;
    }
    seenGuids.add(guid);

    const belegdatum = parseBelegdatum(row[iBeleg] ?? "", year);
    if (!belegdatum) {
      skipped.push({ reason: "ungültiges Belegdatum", raw: row[iBeleg] });
      continue;
    }

    bookings.push({
      buchungsGuid: guid,
      year,
      belegdatum,
      belegfeld1: (row[iBF1] ?? "").trim() || null,
      umsatz,
      sollHaben: (row[iSH] ?? "S").trim().toUpperCase(),
      konto: (row[iKonto] ?? "").trim(),
      gegenkonto: (row[iGK] ?? "").trim(),
      buSchluessel: (row[iBU] ?? "").trim() || null,
      buchungstext: (row[iText] ?? "").trim() || null,
      herkunftKz,
      kost1: (row[iKost1] ?? "").trim() || null,
      kost2: (row[iKost2] ?? "").trim() || null,
    });
  }

  return { year, herkunftKz, bezeichnung, bookings, skipped };
}
