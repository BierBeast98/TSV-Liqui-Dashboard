import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

export type FiscalAreaKey = 'ideell' | 'vermoegensverwaltung' | 'zweckbetrieb' | 'wirtschaftlich';

export interface ExtractedLineItem {
  fiscalArea: FiscalAreaKey;
  type: 'income' | 'expense';
  accountNumber?: string;
  description: string;
  amount: number; // immer positiv
}

export interface ExtractedTotals {
  ideellIncome: number;
  ideellExpenses: number;
  vermoegenIncome: number;
  vermoegenExpenses: number;
  zweckbetriebIncome: number;
  zweckbetriebExpenses: number;
  wirtschaftlichIncome: number;
  wirtschaftlichExpenses: number;
}

export interface ParseResult {
  success: boolean;
  method: 'claude' | 'regex' | 'none';
  confidence: 'high' | 'medium' | 'low';
  totals: Partial<ExtractedTotals>;
  lineItems: ExtractedLineItem[];
  rawTextSnippet: string;
  isImageOnlyPdf: boolean;
  warnings: string[];
}

// Deutsches Zahlenformat: 1.234,56 → 1234.56
function parseGermanNumber(s: string): number {
  const cleaned = s.trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Erkennt nachgestelltes Minus: "1.638,00-" → negativ
function parseGermanAmount(s: string): number {
  const trimmed = s.trim();
  const trailingMinus = trimmed.endsWith('-');
  const cleanStr = trailingMinus ? trimmed.slice(0, -1) : trimmed;
  const value = parseGermanNumber(cleanStr);
  return trailingMinus ? -Math.abs(value) : value;
}

export async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  // Dynamischer Import wegen ESM-Kompatibilität (pdf-parse hat kein sauberes ESM-Default)
  const pdfParseModule = await import('pdf-parse') as any;
  const pdfParse = pdfParseModule.default ?? pdfParseModule;
  const data = await pdfParse(buffer, { max: 0 });
  return data.text as string;
}

const SYSTEM_PROMPT = `Du bist ein Experte für EÜR-Berichte (Einnahmenüberschussrechnung) gemeinnütziger Vereine.
Gib NUR valides JSON zurück — kein Markdown, kein Fließtext, keine Erklärungen.

Es gibt zwei bekannte Formate:

FORMAT A (Lexware EÜR brutto):
- Section-Header: "A. Ideeller Tätigkeitsbereich", "B. Vermögensverwaltung", "C. Zweckbetriebe", "D. Steuerpflichtige wirtschaftliche Geschäftsbetriebe"
- Klare Summenzeilen: "Summe Einnahmen A. ..." und "Summe Ausgaben A. ..."
- Ausgaben bereits negativ (z.B. -155,43)
- Überschuss/Verlust-Zeile am Ende jeder Sektion

FORMAT B (DATEV Kontennachweis § 4 Abs. 3 EStG):
- Section-Header: "IDEELLER BEREICH", "VERMÖGENSVERWALTUNG", "ZWECKBETRIEB", "WIRTSCHAFTLICHER GESCHÄFTSBETRIEB"
- KEINE separaten Summenzeilen — nur JAHRESERGEBNIS (Netto-Wert) am Ende jeder Sektion
- Einnahmen/Ausgaben erkennbar an Kategoriegruppen-Überschriften:
  - Einnahmen: "Einnahmen aus ...", "Neutrale Einnahmen", "Umsatzsteuer-Erstattungen"
  - Ausgaben: "Löhne und Gehälter", "Steuern, Versicherungen...", "Heizung", "Gas, Strom, Wasser", "Abschreibungen auf Anlagevermögen", "Vorsteuer", "Neutrale Ausgaben", "Fremdleistungen", "Instandhaltung", "Roh- Hilfs- und Betriebsstoffe", "Fahrzeug-Versicherungen", "Sonstige Fahrzeugkosten", "Werbe- und Reisekosten", "Kosten der Warenabgabe", "Umsatzsteuer"
- Negative Beträge als nachgestelltes Minus: "1.638,00-"
- Zwei EUR-Spalten: Einzelbeträge links, Gruppen-Subtotals rechts → rechte Spalte verwenden!

WICHTIG für Format B:
- Summiere alle Einnahmen-Gruppen-Subtotals pro Sektion → ideellIncome etc.
- Summiere alle Ausgaben-Gruppen-Subtotals pro Sektion → ideellExpenses etc.
- JAHRESERGEBNIS = Querprüfung (muss ≈ Income - Expenses; endet auf "-" → negativ)
- "Wirtschaftlicher Geschäftsbetrieb" = fiscalArea "wirtschaftlich"
- Bei mehreren Seiten pro Sektion (Übertrag): alle Seiten zusammenzählen

JSON-Format (genau dieses Schema, keine Abweichungen):
{
  "confidence": "high",
  "format": "lexware",
  "warnings": [],
  "totals": {
    "ideellIncome": 0,
    "ideellExpenses": 0,
    "vermoegenIncome": 0,
    "vermoegenExpenses": 0,
    "zweckbetriebIncome": 0,
    "zweckbetriebExpenses": 0,
    "wirtschaftlichIncome": 0,
    "wirtschaftlichExpenses": 0
  },
  "lineItems": [
    {
      "fiscalArea": "ideell",
      "type": "income",
      "accountNumber": "2110",
      "description": "Mitgliedsbeiträge",
      "amount": 42874.90
    }
  ]
}

Regeln:
- Alle Beträge im JSON als positive Dezimalzahlen (1.234,56 → 1234.56)
- type-Feld bestimmt ob Einnahme oder Ausgabe
- Fehlende/leere Bereiche → 0 setzen, NICHT weglassen
- confidence=high: alle 4 Bereiche gefunden, Werte plausibel
- confidence=medium: 2-3 Bereiche gefunden
- confidence=low: unklares Format oder weniger als 2 Bereiche
- fiscalArea MUSS EXAKT einer dieser 4 Werte sein: "ideell", "vermoegensverwaltung", "zweckbetrieb", "wirtschaftlich"
- NIEMALS "vermoegen" oder andere Abkürzungen verwenden — immer "vermoegensverwaltung"`;

async function parseEuerWithClaude(text: string, year: number): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey });

  // Text auf 15.000 Zeichen kürzen (beide Beispiel-PDFs passen komplett rein)
  const warnings: string[] = [];
  let processedText = text;
  if (text.length > 15000) {
    processedText = text.substring(0, 15000);
    warnings.push('PDF-Text wurde auf 15.000 Zeichen gekürzt.');
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8096,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `EÜR ${year}:\n\n${processedText}`,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // JSON aus Response extrahieren (auch wenn Markdown-Fences vorhanden)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Kein JSON in Claude-Antwort gefunden');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: nur totals-Block extrahieren falls JSON durch Token-Limit abgeschnitten wurde
    const totalsMatch = responseText.match(/"totals"\s*:\s*\{([^}]*)\}/);
    const confidenceMatch = responseText.match(/"confidence"\s*:\s*"(\w+)"/);
    if (!totalsMatch) throw new Error('JSON konnte nicht geparst werden und kein totals-Block gefunden');
    parsed = {
      confidence: confidenceMatch?.[1] ?? 'medium',
      totals: JSON.parse(`{${totalsMatch[1]}}`),
      lineItems: [],
      warnings: ['JSON-Antwort war unvollständig (Token-Limit). Nur Summen wurden extrahiert.'],
    };
  }

  const totals: Partial<ExtractedTotals> = {
    ideellIncome: parsed.totals?.ideellIncome ?? 0,
    ideellExpenses: parsed.totals?.ideellExpenses ?? 0,
    vermoegenIncome: parsed.totals?.vermoegenIncome ?? 0,
    vermoegenExpenses: parsed.totals?.vermoegenExpenses ?? 0,
    zweckbetriebIncome: parsed.totals?.zweckbetriebIncome ?? 0,
    zweckbetriebExpenses: parsed.totals?.zweckbetriebExpenses ?? 0,
    wirtschaftlichIncome: parsed.totals?.wirtschaftlichIncome ?? 0,
    wirtschaftlichExpenses: parsed.totals?.wirtschaftlichExpenses ?? 0,
  };

  const normalizeFiscalArea = (raw: string): FiscalAreaKey => {
    const lower = (raw || '').toLowerCase().trim();
    if (lower.startsWith('vermog') || lower.startsWith('vermögen')) return 'vermoegensverwaltung';
    if (['ideell', 'vermoegensverwaltung', 'zweckbetrieb', 'wirtschaftlich'].includes(lower)) return lower as FiscalAreaKey;
    return lower as FiscalAreaKey;
  };

  const lineItems: ExtractedLineItem[] = (parsed.lineItems ?? [])
    .filter((item: any) => item && item.description && typeof item.amount === 'number')
    .map((item: any) => ({
      fiscalArea: normalizeFiscalArea(item.fiscalArea),
      type: item.type as 'income' | 'expense',
      accountNumber: item.accountNumber?.toString(),
      description: item.description,
      amount: Math.abs(item.amount),
    }));

  return {
    success: true,
    method: 'claude',
    confidence: parsed.confidence ?? 'medium',
    totals,
    lineItems,
    rawTextSnippet: text.substring(0, 500),
    isImageOnlyPdf: false,
    warnings: [...warnings, ...(parsed.warnings ?? [])],
  };
}

// Sektion-zu-fiscalArea-Mapping
function sectionToFiscalArea(sectionLabel: string): FiscalAreaKey | null {
  const lower = sectionLabel.toLowerCase();
  if (/ideell/.test(lower)) return 'ideell';
  if (/verm[öo]gen/.test(lower)) return 'vermoegensverwaltung';
  if (/zweck/.test(lower)) return 'zweckbetrieb';
  if (/wirtschaft|steuerpflichtig/.test(lower)) return 'wirtschaftlich';
  return null;
}

// FiscalAreaKey → prefix in ExtractedTotals (vermoegensverwaltung → vermoegen)
const FISCAL_TOTALS_PREFIX: Record<FiscalAreaKey, string> = {
  ideell: 'ideell',
  vermoegensverwaltung: 'vermoegen',
  zweckbetrieb: 'zweckbetrieb',
  wirtschaftlich: 'wirtschaftlich',
};

function parseEuerWithRegex(text: string): ParseResult {
  const warnings: string[] = [];
  const totals: Partial<ExtractedTotals> = {
    ideellIncome: 0, ideellExpenses: 0,
    vermoegenIncome: 0, vermoegenExpenses: 0,
    zweckbetriebIncome: 0, zweckbetriebExpenses: 0,
    wirtschaftlichIncome: 0, wirtschaftlichExpenses: 0,
  };
  const lineItems: ExtractedLineItem[] = [];
  let matchCount = 0;

  const lines = text.split('\n').map(l => l.trim());

  // Format B (DATEV) erkennen — ALL-CAPS Sektionsköpfe ohne Buchstabenpräfix (A., B., C., D.)
  // DATEV: "IDEELLER BEREICH", "ZWECKBETRIEB", "VERMÖGENSVERWALTUNG" als eigenständige Zeilen
  // Lexware: "A. Ideeller Tätigkeitsbereich" (gemischte Groß-/Kleinschreibung, mit Buchstabenpräfix)
  if (/^IDEELLER BEREICH$|^ZWECKBETRIEB$|^WIRTSCHAFTLICHER GESCHÄFTSBETRIEB$/m.test(text)) {
    warnings.push('DATEV-Format erkannt. Automatische Extraktion nur mit Claude möglich — bitte Werte manuell prüfen.');
    return {
      success: false,
      method: 'regex',
      confidence: 'low',
      totals,
      lineItems,
      rawTextSnippet: text.substring(0, 500),
      isImageOnlyPdf: false,
      warnings,
    };
  }

  // Format A (Lexware): Actual PDF text has concatenated labels with amount on preceding line.
  // Line i-1: "123.459,92"  (or "-19.676,60")
  // Line i:   "SummeA. Ideeller TätigkeitsbereichEinnahmen"  (no spaces)
  //
  // Also handles the spaced variant: "Summe Einnahmen A. Ideeller Tätigkeitsbereich   123.459,92"
  const summeLinePattern = /^Summe([A-D]\.[A-ZÄÖÜa-zäöüß\s\.\-]+?)(Einnahmen|Ausgaben)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Variant 1: concatenated "Summe<Section><Direction>" — amount on prev line
    const concatMatch = line.match(summeLinePattern);
    if (concatMatch && i > 0) {
      const sectionLabel = concatMatch[1].trim();
      const direction = concatMatch[2].toLowerCase();
      const amountStr = lines[i - 1];
      const amount = parseGermanAmount(amountStr);
      const fiscalArea = sectionToFiscalArea(sectionLabel);

      if (fiscalArea && !isNaN(amount) && amountStr.match(/[\d,]/)) {
        const prefix = FISCAL_TOTALS_PREFIX[fiscalArea];
        if (direction === 'einnahmen') {
          (totals as any)[`${prefix}Income`] = Math.abs(amount);
          matchCount++;
        } else if (direction === 'ausgaben') {
          (totals as any)[`${prefix}Expenses`] = Math.abs(amount);
          matchCount++;
        }
      }
      continue;
    }

    // Variant 2: spaced "Summe Einnahmen A. ...   123.459,92" on single line
    const spacedMatch = line.match(/^Summe\s+(Einnahmen|Ausgaben)\s+([A-D]\.[\wÄÖÜäöüß\s\.\-]+?)\s{2,}(-?[\d.]+,\d{2})/i);
    if (spacedMatch) {
      const direction = spacedMatch[1].toLowerCase();
      const sectionLabel = spacedMatch[2].trim();
      const amount = parseGermanNumber(spacedMatch[3]);
      const fiscalArea = sectionToFiscalArea(sectionLabel);

      if (fiscalArea && amount > 0) {
        const prefix = FISCAL_TOTALS_PREFIX[fiscalArea];
        if (direction === 'einnahmen') {
          (totals as any)[`${prefix}Income`] = amount;
          matchCount++;
        } else if (direction === 'ausgaben') {
          (totals as any)[`${prefix}Expenses`] = Math.abs(amount);
          matchCount++;
        }
      }
    }
  }

  // Einzelpositionen extrahieren:
  // Actual format: line i = "2701Büromaterial" (no space), line i+1 = "-155,43"
  // Also handles: "2110  Mitgliedsbeiträge  42.874,90" (spaced, on one line)
  let currentArea: FiscalAreaKey = 'ideell';
  const sectionHeaderRe = /^([A-D]\.\s*(?:Ideeller|Verm[öo]gens|Zweck|Steuerpflichtig|Wirtschaft))/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track section
    const secMatch = line.match(sectionHeaderRe);
    if (secMatch) {
      const area = sectionToFiscalArea(secMatch[1]);
      if (area) currentArea = area;
      continue;
    }

    // Concatenated: "2701Büromaterial" — 4 digits immediately followed by description
    const concatItemMatch = line.match(/^(\d{4})([A-ZÄÖÜa-zäöüß].+)$/);
    if (concatItemMatch && i + 1 < lines.length) {
      const accountNumber = concatItemMatch[1];
      const description = concatItemMatch[2].trim();
      const nextLine = lines[i + 1];
      const amountMatch = nextLine.match(/^-?[\d.]+,\d{2}-?$/);
      if (amountMatch && description.length >= 3) {
        const amount = parseGermanAmount(nextLine);
        const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense';
        lineItems.push({ fiscalArea: currentArea, type, accountNumber, description, amount: Math.abs(amount) });
        i++; // skip amount line
        continue;
      }
    }

    // Spaced: "2110  Mitgliedsbeiträge  42.874,90"
    const spacedItemMatch = line.match(/^(\d{4})\s{1,3}([\wÄÖÜäöüß\s\-\/,\.]+?)\s{2,}(-?[\d.]+,\d{2}-?)$/);
    if (spacedItemMatch) {
      const accountNumber = spacedItemMatch[1];
      const description = spacedItemMatch[2].trim().replace(/\s+/g, ' ');
      const amount = parseGermanAmount(spacedItemMatch[3]);
      if (description.length >= 3) {
        const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense';
        lineItems.push({ fiscalArea: currentArea, type, accountNumber, description, amount: Math.abs(amount) });
      }
    }
  }

  const nonZeroAreas = [
    (totals.ideellIncome ?? 0) + (totals.ideellExpenses ?? 0) > 0,
    (totals.vermoegenIncome ?? 0) + (totals.vermoegenExpenses ?? 0) > 0,
    (totals.zweckbetriebIncome ?? 0) + (totals.zweckbetriebExpenses ?? 0) > 0,
    (totals.wirtschaftlichIncome ?? 0) + (totals.wirtschaftlichExpenses ?? 0) > 0,
  ].filter(Boolean).length;

  const confidence: 'high' | 'medium' | 'low' =
    nonZeroAreas >= 4 ? 'high' : nonZeroAreas >= 2 ? 'medium' : 'low';

  if (matchCount === 0) {
    warnings.push('Keine Summenzeilen gefunden. Bitte Format prüfen und Werte manuell eingeben.');
  }

  return {
    success: matchCount > 0,
    method: 'regex',
    confidence,
    totals,
    lineItems,
    rawTextSnippet: text.substring(0, 500),
    isImageOnlyPdf: false,
    warnings,
  };
}

// ============================================================
// Summen- und Saldenliste Parser
// ============================================================

export interface SummenSaldenLineEntry {
  konto: string;
  sub: string;
  beschriftung: string;
  ebWert: number;
  ebSeite: 'S' | 'H' | null;
  kumSoll: number;
  kumHaben: number;
  saldo: number;
  saldoSeite: 'S' | 'H' | null;
}

export interface SummenSaldenResult {
  success: boolean;
  year: number;
  entries: SummenSaldenLineEntry[];
  warnings: string[];
}

// Konten der liquiden Mittel: Kasse (16xx) und Bank (18xx)
const LIQUIDE_MITTEL_PREFIXES = ['16', '18'];

function isLiquideMittel(konto: string): boolean {
  return LIQUIDE_MITTEL_PREFIXES.some(p => konto.startsWith(p));
}

// pdf-parse liefert die Spalten GESPIEGELT: Zahlen kommen VOR der Kontonummer.
// Format pro Zeile: [zahlen][S/H-Indikator(en)][konto][space][sub][space][beschriftung][trailing-zahl?]
//
// Beobachtete Positionen (EB=letzter Wert, Saldo je nach Anzahl Werte):
//   n=2: [EB=Saldo, EB=Saldo]          → Saldo=idx 0
//   n=3: [Saldo, kum-wert, EB]         → Saldo=idx 0
//   n≥4: [..., Saldo at idx 2, ..., EB]→ Saldo=idx 2
//
// S/H-Indikatoren direkt vor der Kontonummer:
//   2 Zeichen (SS/SH/HH/HS): Zeichen[0]=EB-Seite, Zeichen[1]=Saldo-Seite
//   1 Zeichen (S/H): EB-Seite ODER Saldo-Seite (unterschieden via Saldo-Wert=0?)
function parseSummenSaldenLine(line: string): SummenSaldenLineEntry | null {
  // Suche: S/H-Indikatoren unmittelbar vor 3-4-stelliger Kontonummer
  // Kein trailing \s+ nach Sub-Konto, da Beschriftung direkt folgt (z.B. "SS1600 0Kasse")
  const acctRe = /([SH]{1,2})(\d{3,4})\s+(\d)/;
  const acctMatch = line.match(acctRe);
  if (!acctMatch) return null;

  const sideIndicators = acctMatch[1];
  // Führende Null für 3-stellige Konten (Klasse 0: "241" → "0241")
  const konto = acctMatch[2].padStart(4, '0');
  const sub = acctMatch[3];
  const acctPos = acctMatch.index!;

  // Zahlen VOR dem S/H+Konto-Muster extrahieren
  const beforeSH = line.substring(0, acctPos);
  const nums: number[] = [];
  const numRe = /[\d.]+,\d{2}/g;
  let m: RegExpExecArray | null;
  while ((m = numRe.exec(beforeSH)) !== null) {
    nums.push(parseGermanNumber(m[0]));
  }

  const n = nums.length;
  if (n === 0) return null;

  let ebWert = 0, ebSeite: 'S' | 'H' | null = null;
  let saldo = 0, saldoSeite: 'S' | 'H' | null = null;

  // Saldo-Position: Index 2 wenn n≥4, sonst Index 0 (letzter)
  // EB immer letzter Wert (n-1)
  // Empirisch verifiziert gegen DATEV SuSa: Saldo steht immer an 3. Stelle von rechts
  const saldoIdx = n >= 4 ? 2 : 0;

  if (sideIndicators.length === 2) {
    // Beide Indikatoren bekannt: [0]=EB-Seite, [1]=Saldo-Seite
    ebSeite = sideIndicators[0] as 'S' | 'H';
    saldoSeite = sideIndicators[1] as 'S' | 'H';
    ebWert = nums[n - 1];       // EB immer als letzter Wert
    saldo = nums[saldoIdx];
  } else {
    // Nur 1 Indikator: kann EB-Seite oder Saldo-Seite sein
    const candidate = nums[saldoIdx];
    if (candidate === 0) {
      // Saldo = 0 → Indikator gehört zum EB
      ebSeite = sideIndicators[0] as 'S' | 'H';
      ebWert = nums[n - 1];
      saldo = 0;
      saldoSeite = null;
    } else {
      // Saldo ≠ 0 → neues Konto ohne EB, Indikator gehört zum Saldo
      saldoSeite = sideIndicators[0] as 'S' | 'H';
      saldo = candidate;
      ebWert = 0;
      ebSeite = null;
    }
  }

  // Beschriftung: alles nach Konto+Sub, ohne abschließende Zahl
  const afterAcct = line.substring(acctPos + acctMatch[0].length);
  const beschriftung = afterAcct.replace(/[\d.]+,\d{2}$/, '').replace(/\s+/g, ' ').trim();

  return { konto, sub, beschriftung, ebWert, ebSeite, kumSoll: 0, kumHaben: 0, saldo, saldoSeite };
}

export async function parseSummenSaldenPdf(filePath: string, year: number): Promise<SummenSaldenResult> {
  let text: string;
  const warnings: string[] = [];
  try {
    text = await extractPdfText(filePath);
  } catch (e) {
    return { success: false, year, entries: [], warnings: ['PDF-Textextraktion fehlgeschlagen.'] };
  }

  // Formatprüfung
  if (!text.includes('Summen und Salden') && !text.includes('Summen- und Saldenliste')) {
    warnings.push('Datei scheint keine Summen-/Saldenliste zu sein — trotzdem geparst.');
  }

  const entries: SummenSaldenLineEntry[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Summenzeilen und Kopfzeilen überspringen
    if (line.startsWith('Summe') || line.startsWith('KontoBeschriftung') || line.startsWith('Die Auswertung')) continue;
    const entry = parseSummenSaldenLine(line);
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    warnings.push('Keine Kontenzeilen gefunden. Bitte Format prüfen.');
    return { success: false, year, entries, warnings };
  }

  return { success: true, year, entries, warnings };
}

export async function parsePdf(filePath: string, year: number): Promise<ParseResult> {
  let text: string;
  try {
    text = await extractPdfText(filePath);
  } catch (e) {
    console.error('[pdfParser] PDF-Text-Extraktion fehlgeschlagen:', e);
    return {
      success: false,
      method: 'none',
      confidence: 'low',
      totals: {},
      lineItems: [],
      rawTextSnippet: '',
      isImageOnlyPdf: false,
      warnings: ['PDF konnte nicht gelesen werden.'],
    };
  }

  if (text.trim().length < 50) {
    return {
      success: false,
      method: 'none',
      confidence: 'low',
      totals: {},
      lineItems: [],
      rawTextSnippet: text.substring(0, 200),
      isImageOnlyPdf: true,
      warnings: ['Das PDF enthält keinen extrahierbaren Text (Bild-PDF). Bitte Werte manuell eintragen.'],
    };
  }

  // Claude zuerst versuchen
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await parseEuerWithClaude(text, year);
      if (result.success) return result;
    } catch (e) {
      console.error('[pdfParser] Claude-Parsing fehlgeschlagen, wechsle zu Regex:', e);
    }
  }

  // Regex-Fallback
  return parseEuerWithRegex(text);
}
