/**
 * SKR49 Kontenrahmen Mapping für DATEV DTVF Buchungsstapel
 * Ordnet 5-stellige DATEV-Kontonummern den EÜR-Bereichen A1..D2 zu.
 *
 * Kategorien:
 *   A1 = Einnahmen ideeller Bereich       A2 = Ausgaben ideeller Bereich
 *   B1 = Einnahmen Vermögensverwaltung     B2 = Ausgaben Vermögensverwaltung
 *   C1 = Einnahmen Zweckbetrieb            C2 = Ausgaben Zweckbetrieb
 *   D1 = Einnahmen wirtschaftl. GB         D2 = Ausgaben wirtschaftl. GB
 *   SKIP = Bilanzkonto (keine E/A)
 *
 * Basierend auf:
 *  - DATEV SKR49 Standard für Vereine (5-stellig)
 *  - Ground Truth aus DTVF-Buchungsstapel 2025 TSV Greding
 */

import type { EasCategory } from "@shared/schema";

export type MappingValue = EasCategory | "SKIP";

export interface MappingEntry {
  kontoname: string;
  easCategory: MappingValue;
}

// Statische Default-Zuordnung (Seed für datev_konto_mapping)
export const SKR49_DEFAULT_MAPPING: Record<string, MappingEntry> = {
  // ── Bilanzkonten (SKIP) ─────────────────────────────────────────────
  // Klasse 1: Umlaufvermögen (Forderungen, Kasse, Bank)
  "13000": { kontoname: "Sonstige Forderungen", easCategory: "SKIP" },
  "13700": { kontoname: "Durchlaufende Posten", easCategory: "SKIP" },
  "13720": { kontoname: "Umbuchungen Geldkonten", easCategory: "SKIP" },
  "14010": { kontoname: "Umsatzsteuer-Vorauszahlung", easCategory: "SKIP" },
  "14060": { kontoname: "Abziehbare Vorsteuer", easCategory: "SKIP" },
  "14310": { kontoname: "Abziehbare Vorsteuer 19 %", easCategory: "SKIP" },
  "14360": { kontoname: "Vorsteuer nicht abziehbar", easCategory: "SKIP" },
  "14630": { kontoname: "USt-Vorjahr", easCategory: "SKIP" },
  "16000": { kontoname: "Kasse", easCategory: "SKIP" },
  "16100": { kontoname: "Nebenkasse", easCategory: "SKIP" },
  "16300": { kontoname: "Kasse 3", easCategory: "SKIP" },
  "18000": { kontoname: "Bank Girokonto", easCategory: "SKIP" },
  "18100": { kontoname: "Bank 2", easCategory: "SKIP" },
  "18200": { kontoname: "Bank 3", easCategory: "SKIP" },
  "18300": { kontoname: "Bank 4", easCategory: "SKIP" },
  "18400": { kontoname: "Bank Termingeld", easCategory: "SKIP" },
  "18401": { kontoname: "Bank Termingeld 2", easCategory: "SKIP" },
  "18500": { kontoname: "Sparbuch", easCategory: "SKIP" },
  "18600": { kontoname: "Sparbuch 2", easCategory: "SKIP" },
  // Klasse 2: Anlagevermögen
  "2410": { kontoname: "Geschäftsbauten", easCategory: "SKIP" },
  // Klasse 3: Verbindlichkeiten
  "32100": { kontoname: "Darlehen 2200", easCategory: "SKIP" },
  "32110": { kontoname: "BLSV-Darlehen", easCategory: "SKIP" },
  "35600": { kontoname: "Rückstellungen", easCategory: "SKIP" },
  "38400": { kontoname: "Umsatzsteuer", easCategory: "SKIP" },
  // Klasse 4/5/6: einzelne DATEV-Standard-Anlagekonten
  "4700": { kontoname: "Umsatzsteuer-Verrechnung", easCategory: "SKIP" },
  "4710": { kontoname: "Sachanlagen-Verrechnung", easCategory: "SKIP" },
  "5700": { kontoname: "Fuhrpark", easCategory: "SKIP" },
  "6300": { kontoname: "Anlagen im Bau", easCategory: "SKIP" },
  "6320": { kontoname: "Betriebsausstattung", easCategory: "SKIP" },
  "6350": { kontoname: "Geschäftsausstattung", easCategory: "SKIP" },
  "6700": { kontoname: "GWG", easCategory: "SKIP" },
  "6900": { kontoname: "Sonstige Ausstattung", easCategory: "SKIP" },
  "90000": { kontoname: "Saldovortrag (EB-Wert)", easCategory: "SKIP" },

  // ── A1: Einnahmen ideeller Bereich ─────────────────────────────────
  "40000": { kontoname: "Mitgliedsbeiträge", easCategory: "A1" },
  "40010": { kontoname: "Mitgliedsbeiträge (Rückerstattung/Korr.)", easCategory: "A1" },
  "40020": { kontoname: "Rücklastschriften Beiträge", easCategory: "A1" },
  "40320": { kontoname: "Stiftungszuwendungen", easCategory: "A1" },
  "40400": { kontoname: "Geldspenden", easCategory: "A1" },
  "40450": { kontoname: "Zweckgebundene Spenden", easCategory: "A1" },
  "40500": { kontoname: "Zuwendung Förderverein", easCategory: "A1" },
  "48280": { kontoname: "Zuschüsse Kommunen/Verbände", easCategory: "A1" },
  "48290": { kontoname: "Zuschuss Schulsport", easCategory: "A1" },

  // ── A2: Ausgaben ideeller Bereich ──────────────────────────────────
  "68000": { kontoname: "Porto", easCategory: "A2" },
  "68100": { kontoname: "Internet/Webhosting", easCategory: "A2" },
  "68150": { kontoname: "Büromaterial", easCategory: "A2" },
  "68200": { kontoname: "Zeitschriften, Fachbücher", easCategory: "A2" },
  "68210": { kontoname: "Lehrgangs-/Teilnahmegebühren Verband", easCategory: "A2" },
  "68370": { kontoname: "Softwaremiete (Vereinsverwaltung)", easCategory: "A2" },
  "68590": { kontoname: "Abfall/Entsorgung", easCategory: "A2" },
  "64300": { kontoname: "Abgaben an Landesverband (BLSV)", easCategory: "A2" },
  "64310": { kontoname: "Abgaben an Fachverbände", easCategory: "A2" },
  "66100": { kontoname: "Geschenke, Jubiläen, Mitgliederpflege", easCategory: "A2" },
  "76040": { kontoname: "Körperschaftsteuer", easCategory: "A2" },
  "76070": { kontoname: "Solidaritätszuschlag KSt", easCategory: "A2" },
  "76300": { kontoname: "Abgezogene Kapitalertragssteuer", easCategory: "A2" },
  "76330": { kontoname: "Abgezogener Soli (KapESt)", easCategory: "A2" },
  "76850": { kontoname: "Kfz-Steuer", easCategory: "A2" },

  // ── B1: Einnahmen Vermögensverwaltung ──────────────────────────────
  "48620": { kontoname: "Nebenkostenvorauszahlungen (Pacht)", easCategory: "B1" },
  "48630": { kontoname: "Pachteinnahmen", easCategory: "B1" },
  "71100": { kontoname: "Zinserträge", easCategory: "B1" },
  "73200": { kontoname: "Zinserträge Darlehen", easCategory: "B1" },

  // ── B2: Ausgaben Vermögensverwaltung ───────────────────────────────
  "62210": { kontoname: "Abschreibung Gebäude", easCategory: "B2" },
  "63200": { kontoname: "Heizung/Heizwerk", easCategory: "B2" },
  "63250": { kontoname: "Strom", easCategory: "B2" },
  "63350": { kontoname: "Reparaturen/Instandhaltung Gebäude", easCategory: "B2" },
  "63400": { kontoname: "Sonstige Grundstücksaufwendungen", easCategory: "B2" },
  "63500": { kontoname: "Grundstücksaufwendungen", easCategory: "B2" },
  "63900": { kontoname: "Sonstige Raumkosten", easCategory: "B2" },
  "68550": { kontoname: "Nebenkosten des Geldverkehrs", easCategory: "B2" },

  // ── C1: Einnahmen Zweckbetrieb ─────────────────────────────────────
  "41030": { kontoname: "Startgelder / Turniere", easCategory: "C1" },
  "43010": { kontoname: "Sportplatzeinnahmen", easCategory: "C1" },
  "43030": { kontoname: "Einnahmen Teilnehmer Skifahrten", easCategory: "C1" },
  "43000": { kontoname: "Ablöse-Erträge Spieler", easCategory: "C1" },

  // ── C2: Ausgaben Zweckbetrieb ──────────────────────────────────────
  "52000": { kontoname: "Wareneinkauf Sport (Süßwaren etc.)", easCategory: "C2" },
  "53000": { kontoname: "Wareneinkauf Zweckbetrieb", easCategory: "C2" },
  "54000": { kontoname: "Getränkeeinkauf Zweckbetrieb", easCategory: "C2" },
  "59060": { kontoname: "Fremdleistungen (Sicherheitsdienst)", easCategory: "C2" },
  "59090": { kontoname: "Sonstige Veranstaltungskosten", easCategory: "C2" },
  "60020": { kontoname: "Trainer/Übungsleiter (angestellt)", easCategory: "C2" },
  "60040": { kontoname: "Aufwandsentschädigung § 3 Nr. 26 EStG", easCategory: "C2" },
  "60350": { kontoname: "Trainer/Übungsleiter pauschal", easCategory: "C2" },
  "61200": { kontoname: "Berufsgenossenschaft", easCategory: "C2" },
  "61710": { kontoname: "Knappschaft/Minijob", easCategory: "C2" },
  "62200": { kontoname: "Abschreibung Sachanlagen", easCategory: "C2" },
  "62220": { kontoname: "Abschreibung Kfz", easCategory: "C2" },
  "62600": { kontoname: "Sofortabschreibung GWG", easCategory: "C2" },
  "63000": { kontoname: "Reiskosten Sport (Skifahrten etc.)", easCategory: "C2" },
  "63010": { kontoname: "Ablösezahlungen Spieler", easCategory: "C2" },
  "63040": { kontoname: "Turnier-/Meldegelder", easCategory: "C2" },
  "63050": { kontoname: "Veranstaltungskosten Sport", easCategory: "C2" },
  "63070": { kontoname: "Schiedsrichterkosten", easCategory: "C2" },
  "64000": { kontoname: "Sportversicherungen", easCategory: "C2" },
  "64210": { kontoname: "Verbands-Strafen/Ordnungsgelder", easCategory: "C2" },
  "64211": { kontoname: "Turnhallengebühren", easCategory: "C2" },
  "64212": { kontoname: "BFV-Gebühren (Spielverlegung etc.)", easCategory: "C2" },
  "64213": { kontoname: "Gebühren Stadt (Straßensperrung)", easCategory: "C2" },
  "64600": { kontoname: "Reparaturen Sportanlagen", easCategory: "C2" },
  "64900": { kontoname: "Sonstige Kfz-/Materialkosten", easCategory: "C2" },
  "65200": { kontoname: "Kfz-Versicherung", easCategory: "C2" },
  "65300": { kontoname: "Treibstoff Kfz/Rasenmäher", easCategory: "C2" },
  "65400": { kontoname: "Kfz-Reparaturen", easCategory: "C2" },
  "66000": { kontoname: "Werbung Zweckbetrieb", easCategory: "C2" },
  "66001": { kontoname: "Pokale/Medaillen", easCategory: "C2" },
  "66050": { kontoname: "Kleinmaterial Veranstaltungen", easCategory: "C2" },
  "66500": { kontoname: "Fahrtkosten Trainingslager", easCategory: "C2" },
  "66600": { kontoname: "Übernachtung Trainingslager", easCategory: "C2" },
  "67800": { kontoname: "Fremdleistungen Spielbetrieb", easCategory: "C2" },
  "68350": { kontoname: "Leihgebühren Sportgeräte", easCategory: "C2" },
  "68500": { kontoname: "Sportbedarf allgemein", easCategory: "C2" },
  "68501": { kontoname: "Bewirtung Schiedsrichter", easCategory: "C2" },
  "68502": { kontoname: "Sportgeräte (Bälle etc.)", easCategory: "C2" },
  "68503": { kontoname: "Sportbekleidung", easCategory: "C2" },
  "68950": { kontoname: "Abgänge / Buchverlust", easCategory: "C2" },

  // ── D1: Einnahmen wirtschaftlicher Geschäftsbetrieb ────────────────
  "42110": { kontoname: "Bandenwerbung", easCategory: "D1" },
  "42111": { kontoname: "Bannerwerbung", easCategory: "D1" },
  "42112": { kontoname: "Werbung Spielankündigungsplakate", easCategory: "D1" },
  "42114": { kontoname: "Bewirtungseinnahmen", easCategory: "D1" },
  "42115": { kontoname: "Sonstige Werbung", easCategory: "D1" },
  "44000": { kontoname: "Einnahmen Ausschank/Bewirtung", easCategory: "D1" },
  "49820": { kontoname: "PV-Einspeisevergütung", easCategory: "D1" },

  // ── D2: Ausgaben wirtschaftlicher Geschäftsbetrieb ─────────────────
  // (im Sample keine eindeutig separaten wGB-Aufwandskonten;
  //  bleiben unklassifiziert oder per manual override zuweisbar)
};

/**
 * KOST1-Kostenstelle → Vereinsbereich (A/B/C/D).
 * Konvention im DATEV-SKR49 für Vereine:
 *   "1" = ideeller Bereich, "2" = Vermögensverwaltung,
 *   "3" = Zweckbetrieb,     "4" = wirtschaftlicher Geschäftsbetrieb.
 *   "9" = Bilanz/neutral (z.B. EB-Werte) → kein Pivot-Bereich.
 */
const KOST1_TO_AREA: Record<string, "A" | "B" | "C" | "D"> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D",
};

/**
 * Schätzt Einnahme/Ausgabe aus der Kontonummer-Klasse (SKR49).
 *   Klasse 4 (4xxxx)            → Erträge (Einnahme, Suffix "1")
 *   Klasse 5/6 (5xxxx, 6xxxx)   → Aufwendungen (Ausgabe, Suffix "2")
 * Andere Klassen sind ambivalent → kein Fallback.
 */
function incomeOrExpense(konto: string): "1" | "2" | null {
  const first = konto.charAt(0);
  if (first === "4") return "1";
  if (first === "5" || first === "6") return "2";
  return null;
}

/**
 * Ordnet eine Buchung (Konto + Gegenkonto) einer E/A-Kategorie zu.
 *
 * Logik:
 *   1. Finde das E/A-Konto (das non-SKIP Konto) und das zugeordnete Mapping.
 *   2. Vorzeichen (1=Einnahme / 2=Ausgabe) kommt aus Mapping oder Kontenklasse.
 *   3. Bereich (A/B/C/D) kommt primär aus KOST1 (1/2/3/4) — der Buchhalter
 *      weist damit Buchungen explizit einem Vereinsbereich zu. Nur wenn KOST1
 *      fehlt oder neutral ist ("9"), greift die statische Mapping-Area.
 *
 * Diese KOST1-Priorität ist wichtig, weil dieselben Konten (z.B. Getränke-
 * einkauf, Abschreibungen) je nach Vereinsbereich unterschiedlich zugeordnet
 * werden — das entscheidet die Kostenstelle, nicht das Konto.
 */
export function classifyBooking(
  konto: string,
  gegenkonto: string,
  mapping: Map<string, MappingValue>,
  kost1?: string | null,
): { euerKonto: string | null; easCategory: EasCategory | null } {
  const k1 = mapping.get(konto);
  const k2 = mapping.get(gegenkonto);

  const isCat = (v: MappingValue | undefined): v is EasCategory =>
    v !== undefined && v !== "SKIP";

  // Step 1: Finde E/A-Konto (Priorität: eindeutige Kategorie > SKIP > unbekannt)
  let eaKonto: string | null = null;
  let mappedCat: EasCategory | null = null;

  if (isCat(k1) && !isCat(k2)) {
    eaKonto = konto;
    mappedCat = k1;
  } else if (isCat(k2) && !isCat(k1)) {
    eaKonto = gegenkonto;
    mappedCat = k2;
  } else if (isCat(k1) && isCat(k2)) {
    eaKonto = konto;
    mappedCat = k1;
  } else if (k1 === "SKIP" && k2 === "SKIP") {
    // reine Bilanzbuchung (Bank ↔ Kasse)
    return { euerKonto: null, easCategory: null };
  } else {
    // Mindestens eines unbekannt, keins in Kategorie
    if (!isCat(k1) && k1 !== "SKIP") eaKonto = konto;
    else if (!isCat(k2) && k2 !== "SKIP") eaKonto = gegenkonto;
  }

  if (!eaKonto) return { euerKonto: null, easCategory: null };

  // Step 2: Vorzeichen (Einnahme/Ausgabe) — aus Mapping, sonst aus Kontenklasse
  const suffix: "1" | "2" | null = mappedCat
    ? (mappedCat.charAt(1) as "1" | "2")
    : incomeOrExpense(eaKonto);
  if (!suffix) return { euerKonto: null, easCategory: null };

  // Step 3: Bereich (A/B/C/D) — KOST1 hat Vorrang, sonst Mapping
  const kost1Area = kost1 ? KOST1_TO_AREA[kost1] : undefined;
  const mappingArea = mappedCat ? (mappedCat.charAt(0) as "A" | "B" | "C" | "D") : undefined;
  const area = kost1Area ?? mappingArea;
  if (!area) return { euerKonto: null, easCategory: null };

  return { euerKonto: eaKonto, easCategory: (area + suffix) as EasCategory };
}
