import { useState, useMemo, ReactNode, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEuerReport, useEuerItems } from "@/hooks/use-euer";
import { useFilter } from "@/contexts/FilterContext";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Loader2, Info, Eye, EyeOff, Link2, Unlink2, ArrowUpDown,
  ChevronDown, ChevronRight, Presentation,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DatevAuswertungTab } from "@/components/DatevAuswertungTab";
import { LiquideMittelCard } from "@/components/LiquideMittelCard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface FiscalAreaSummary {
  name: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

interface FiscalAreaReport {
  year: number;
  source: "pdf" | "transactions" | "none";
  areas: FiscalAreaSummary[];
  totalIncome: number;
  totalExpenses: number;
  totalNet: number;
}

interface EuerLineItem {
  id: number;
  fiscalArea: string;
  type: string;
  accountNumber: string;
  description: string;
  amount: number;
}

interface ManualMapping {
  id: string;
  fiscalArea: string;
  type: "income" | "expense";
  displayDescs: string[];   // 2025 descriptions (1..N)
  compareDescs: string[];   // 2024 descriptions (1..N)
  blocked: boolean;         // true = prevent fuzzy match for this pair, no positive match
}

interface MatchedLineItem {
  key: string;
  displayDescription: string;
  compareDescription: string;
  displayAccountNumber?: string;   // SKR account from display year
  compareAccountNumber?: string;   // SKR account from compare year
  fiscalArea: string;
  type: "income" | "expense";
  compareAmount: number;
  displayAmount: number;
  delta: number;
  deltaPercent: number | null;
  matched: boolean;
  matchType: "manual" | "exact" | "fuzzy" | "none";
  manualId?: string;
  allDisplayDescs?: string[];   // all 2025 descriptions when grouped (N > 1)
  allCompareDescs?: string[];   // all 2024 descriptions when grouped (N > 1)
}

// ── Fuzzy Matching ────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "von", "der", "die", "das", "und", "aus", "für", "nach", "mit",
  "auf", "in", "an", "zu", "des", "dem", "den", "ein", "eine",
  "einer", "beim", "über", "zum", "zur", "bei",
]);

function tokenize(desc: string): string[] {
  return desc
    .toLowerCase()
    .replace(/[\/\-\.%§&()+]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function fuzzyScore(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let score = 0;
  for (const ta_t of ta) {
    for (const tb_t of tb) {
      if (ta_t === tb_t) {
        score += ta_t.length * 2;
      } else if (tb_t.includes(ta_t) || ta_t.includes(tb_t)) {
        const shorter = Math.min(ta_t.length, tb_t.length);
        if (shorter >= 5) score += shorter;
      }
    }
  }
  return score;
}

const normalizeDesc = (d: string) => d.toLowerCase().trim().replace(/\s+/g, " ");

function matchLineItems(
  displayItems: EuerLineItem[],
  compareItems: EuerLineItem[],
  manualMappings: ManualMapping[],
): MatchedLineItem[] {
  const SCORE_THRESHOLD = 8;
  const result: MatchedLineItem[] = [];
  const usedDisplayIds = new Set<number>();
  const usedCompareIds = new Set<number>();

  // Blocked pairs (prevent fuzzy) — iterate all desc combinations
  const blockedPairs = new Set<string>();
  for (const m of manualMappings) {
    if (m.blocked) {
      for (const dd of m.displayDescs) {
        for (const cd of m.compareDescs) {
          blockedPairs.add(`${normalizeDesc(dd)}||${normalizeDesc(cd)}`);
        }
      }
    }
  }

  // Step 0: Manual positive mappings (supports N:M groups)
  for (const m of manualMappings) {
    if (m.blocked) continue;
    // Collect all matching display items
    const dItems = m.displayDescs
      .map((desc) => displayItems.find(
        (d) => !usedDisplayIds.has(d.id) &&
          normalizeDesc(d.description) === normalizeDesc(desc) &&
          d.fiscalArea === m.fiscalArea && d.type === m.type,
      ))
      .filter((d): d is EuerLineItem => d !== undefined);
    // Collect all matching compare items
    const cItems = m.compareDescs
      .map((desc) => compareItems.find(
        (c) => !usedCompareIds.has(c.id) &&
          normalizeDesc(c.description) === normalizeDesc(desc) &&
          c.fiscalArea === m.fiscalArea && c.type === m.type,
      ))
      .filter((c): c is EuerLineItem => c !== undefined);
    if (dItems.length === 0 || cItems.length === 0) continue;
    dItems.forEach((d) => usedDisplayIds.add(d.id));
    cItems.forEach((c) => usedCompareIds.add(c.id));
    const displayAmount = dItems.reduce((s, d) => s + d.amount, 0);
    const compareAmount = cItems.reduce((s, c) => s + c.amount, 0);
    const delta = displayAmount - compareAmount;
    const primaryD = dItems[0];
    const primaryC = cItems[0];
    result.push({
      key: `${primaryD.fiscalArea}:${primaryD.type}:${primaryD.description}`,
      displayDescription: primaryD.description,
      compareDescription: primaryC.description,
      displayAccountNumber: primaryD.accountNumber,
      compareAccountNumber: primaryC.accountNumber,
      fiscalArea: primaryD.fiscalArea,
      type: primaryD.type as "income" | "expense",
      compareAmount,
      displayAmount,
      delta,
      deltaPercent: compareAmount !== 0 ? (delta / Math.abs(compareAmount)) * 100 : null,
      matched: true,
      matchType: "manual",
      manualId: m.id,
      allDisplayDescs: dItems.length > 1 ? dItems.map((d) => d.description) : undefined,
      allCompareDescs: cItems.length > 1 ? cItems.map((c) => c.description) : undefined,
    });
  }

  // Step 1: Exact matching
  const compareByNorm = new Map<string, EuerLineItem>();
  for (const c of compareItems) {
    if (!usedCompareIds.has(c.id)) compareByNorm.set(`${c.fiscalArea}:${c.type}:${normalizeDesc(c.description)}`, c);
  }
  for (const d of displayItems) {
    if (usedDisplayIds.has(d.id)) continue;
    const cItem = compareByNorm.get(`${d.fiscalArea}:${d.type}:${normalizeDesc(d.description)}`);
    if (!cItem || usedCompareIds.has(cItem.id)) continue;
    // Check not blocked
    if (blockedPairs.has(`${normalizeDesc(d.description)}||${normalizeDesc(cItem.description)}`)) continue;
    usedDisplayIds.add(d.id);
    usedCompareIds.add(cItem.id);
    const delta = d.amount - cItem.amount;
    result.push({
      key: `${d.fiscalArea}:${d.type}:${d.description}`,
      displayDescription: d.description,
      compareDescription: cItem.description,
      displayAccountNumber: d.accountNumber,
      compareAccountNumber: cItem.accountNumber,
      fiscalArea: d.fiscalArea,
      type: d.type as "income" | "expense",
      compareAmount: cItem.amount,
      displayAmount: d.amount,
      delta,
      deltaPercent: cItem.amount !== 0 ? (delta / Math.abs(cItem.amount)) * 100 : null,
      matched: true,
      matchType: "exact",
    });
  }

  // Step 2: Fuzzy matching
  const remDisplay = displayItems.filter((d) => !usedDisplayIds.has(d.id));
  const remCompare = compareItems.filter((c) => !usedCompareIds.has(c.id));

  type Cand = { di: number; ci: number; score: number };
  const cands: Cand[] = [];
  for (let di = 0; di < remDisplay.length; di++) {
    const d = remDisplay[di];
    for (let ci = 0; ci < remCompare.length; ci++) {
      const c = remCompare[ci];
      if (c.fiscalArea !== d.fiscalArea || c.type !== d.type) continue;
      if (blockedPairs.has(`${normalizeDesc(d.description)}||${normalizeDesc(c.description)}`)) continue;
      const score = fuzzyScore(d.description, c.description);
      if (score >= SCORE_THRESHOLD) cands.push({ di, ci, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const usedDi = new Set<number>();
  const usedCi = new Set<number>();
  for (const { di, ci } of cands) {
    if (usedDi.has(di) || usedCi.has(ci)) continue;
    usedDi.add(di);
    usedCi.add(ci);
    const d = remDisplay[di];
    const c = remCompare[ci];
    usedDisplayIds.add(d.id);
    usedCompareIds.add(c.id);
    const delta = d.amount - c.amount;
    result.push({
      key: `${d.fiscalArea}:${d.type}:${d.description}`,
      displayDescription: d.description,
      compareDescription: c.description,
      displayAccountNumber: d.accountNumber,
      compareAccountNumber: c.accountNumber,
      fiscalArea: d.fiscalArea,
      type: d.type as "income" | "expense",
      compareAmount: c.amount,
      displayAmount: d.amount,
      delta,
      deltaPercent: c.amount !== 0 ? (delta / Math.abs(c.amount)) * 100 : null,
      matched: true,
      matchType: "fuzzy",
    });
  }

  // Step 3: Unmatched display items (NEU)
  for (const d of displayItems) {
    if (usedDisplayIds.has(d.id)) continue;
    result.push({
      key: `${d.fiscalArea}:${d.type}:${d.description}:neu`,
      displayDescription: d.description,
      compareDescription: "",
      displayAccountNumber: d.accountNumber,
      fiscalArea: d.fiscalArea,
      type: d.type as "income" | "expense",
      compareAmount: 0,
      displayAmount: d.amount,
      delta: d.amount,
      deltaPercent: null,
      matched: false,
      matchType: "none",
    });
  }

  // Step 4: Unmatched compare items (ENTF)
  for (const c of compareItems) {
    if (usedCompareIds.has(c.id)) continue;
    result.push({
      key: `${c.fiscalArea}:${c.type}:${c.description}:entf`,
      displayDescription: "",
      compareDescription: c.description,
      compareAccountNumber: c.accountNumber,
      fiscalArea: c.fiscalArea,
      type: c.type as "income" | "expense",
      compareAmount: c.amount,
      displayAmount: 0,
      delta: -c.amount,
      deltaPercent: null,
      matched: false,
      matchType: "none",
    });
  }

  return result.sort((a, b) => {
    if (a.fiscalArea !== b.fiscalArea) return a.fiscalArea.localeCompare(b.fiscalArea);
    if (a.type !== b.type) return a.type === "income" ? -1 : 1;
    // Sort numerically by new DATEV account number; fall back to old one for ENTF rows
    const accA = Number(a.displayAccountNumber ?? a.compareAccountNumber ?? "0") || 0;
    const accB = Number(b.displayAccountNumber ?? b.compareAccountNumber ?? "0") || 0;
    if (accA !== accB) return accA - accB;
    return (a.displayDescription || a.compareDescription).localeCompare(
      b.displayDescription || b.compareDescription,
    );
  });
}

// ── localStorage helpers (fallback / cache) ───────────────────────────────────

const LS_HIDDEN = "kassenbericht_hidden_items";
const LS_MAPPINGS = "kassenbericht_manual_mappings";

function loadHiddenLS(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) ?? "[]")); }
  catch { return new Set(); }
}
function loadMappingsLS(): ManualMapping[] {
  try {
    const raw: any[] = JSON.parse(localStorage.getItem(LS_MAPPINGS) ?? "[]");
    return raw.map((m) => ({
      ...m,
      displayDescs: m.displayDescs ?? (m.displayDesc ? [m.displayDesc] : []),
      compareDescs: m.compareDescs ?? (m.compareDesc ? [m.compareDesc] : []),
    }));
  } catch { return []; }
}
function migrateMappings(raw: any[]): ManualMapping[] {
  return raw.map((m) => ({
    ...m,
    displayDescs: m.displayDescs ?? (m.displayDesc ? [m.displayDesc] : []),
    compareDescs: m.compareDescs ?? (m.compareDesc ? [m.compareDesc] : []),
  }));
}

// ── LinkingDialog ─────────────────────────────────────────────────────────────

function LinkingDialog({
  item,
  allItems,
  compareYear,
  displayYear,
  onLink,
  onClose,
}: {
  item: MatchedLineItem;
  allItems: MatchedLineItem[];
  compareYear: number;
  displayYear: number;
  onLink: (displayDescs: string[], compareDescs: string[], fiscalArea: string, type: "income" | "expense") => void;
  onClose: () => void;
}) {
  // For ENTF items (2024 exists, no 2025): pick one or more 2025 partners
  // For NEU items (2025 exists, no 2024): pick one or more 2024 partners
  const isEntf = item.compareAmount > 0 && item.displayAmount === 0;
  const [selected, setSelected] = useState<string[]>([]);

  const candidates = allItems.filter(
    (c) =>
      c.fiscalArea === item.fiscalArea &&
      c.type === item.type &&
      c.key !== item.key &&
      (isEntf ? c.displayAmount > 0 : c.compareAmount > 0),
  );

  const unmatched = candidates.filter((c) => isEntf ? c.compareAmount === 0 : c.displayAmount === 0);
  const matched = candidates.filter((c) => isEntf ? c.compareAmount > 0 : c.displayAmount > 0);

  const getDesc = (c: MatchedLineItem) =>
    isEntf ? (c.displayDescription || c.compareDescription) : (c.compareDescription || c.displayDescription);
  const getAmount = (c: MatchedLineItem) =>
    isEntf ? c.displayAmount : c.compareAmount;

  const toggleSelect = (desc: string) => {
    setSelected((prev) => prev.includes(desc) ? prev.filter((d) => d !== desc) : [...prev, desc]);
  };

  const totalSelected = selected.reduce((sum, desc) => {
    const c = candidates.find((c) => getDesc(c) === desc);
    return sum + (c ? getAmount(c) : 0);
  }, 0);

  const handleSubmit = () => {
    if (selected.length === 0) return;
    if (isEntf) {
      onLink(selected, [item.compareDescription], item.fiscalArea, item.type);
    } else {
      onLink([item.displayDescription], selected, item.fiscalArea, item.type);
    }
    onClose();
  };

  const CandidateRow = ({ c, label }: { c: MatchedLineItem; label?: string }) => {
    const desc = getDesc(c);
    const isChecked = selected.includes(desc);
    return (
      <button
        onClick={() => toggleSelect(desc)}
        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors border ${isChecked ? "bg-primary/10 border-primary/30" : "border-transparent hover:bg-muted hover:border-muted-foreground/20"}`}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
            {isChecked && (
              <svg className="w-2.5 h-2.5 text-primary-foreground" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`font-medium text-sm truncate ${isChecked ? "text-primary" : ""}`}>{desc}</div>
            {label && <div className="text-xs text-muted-foreground mt-0.5">{label}</div>}
          </div>
          <div className="text-sm font-mono shrink-0 text-muted-foreground">{formatCurrency(getAmount(c))}</div>
        </div>
      </button>
    );
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Position verknüpfen
          </DialogTitle>
          <DialogDescription>
            Wähle eine oder mehrere{" "}
            <strong>{isEntf ? displayYear : compareYear}</strong>-Positionen für:
          </DialogDescription>
        </DialogHeader>

        {/* Current item */}
        <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
          <div className="font-semibold">{item.displayDescription || item.compareDescription}</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            {formatCurrency(isEntf ? item.compareAmount : item.displayAmount)}{" "}
            · {isEntf ? compareYear : displayYear}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3 mt-1 pr-1">
          {unmatched.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Nicht zugeordnet
              </div>
              <div className="space-y-1">
                {unmatched.map((c) => <CandidateRow key={c.key} c={c} />)}
              </div>
            </div>
          )}

          {matched.length > 0 && (
            <div>
              {unmatched.length > 0 && <Separator className="my-3" />}
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Bereits zugeordnet (wird umgeleitet)
              </div>
              <div className="space-y-1">
                {matched.map((c) => (
                  <CandidateRow
                    key={c.key}
                    c={c}
                    label={`Aktuell verknüpft mit: ${isEntf ? c.compareDescription : c.displayDescription}`}
                  />
                ))}
              </div>
            </div>
          )}

          {unmatched.length === 0 && matched.length === 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Keine weiteren Positionen verfügbar.
            </div>
          )}
        </div>

        {/* Footer with submit */}
        <div className="flex items-center justify-between pt-3 border-t mt-2 shrink-0">
          <div className="text-sm text-muted-foreground">
            {selected.length > 0
              ? `${selected.length} Position${selected.length > 1 ? "en" : ""} · ${formatCurrency(totalSelected)}`
              : "Keine Auswahl"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button size="sm" onClick={handleSubmit} disabled={selected.length === 0}>
              Verknüpfen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── AreaCard ──────────────────────────────────────────────────────────────────

function AreaCard({
  area, compareArea, compareYear, displayYear,
}: {
  area: FiscalAreaSummary;
  compareArea?: FiscalAreaSummary;
  compareYear: number;
  displayYear: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{area.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground text-center">
          <span></span>
          <span>{compareYear}</span>
          <span className="font-semibold text-foreground">{displayYear}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 items-center">
          <span className="text-xs text-muted-foreground">Einnahmen</span>
          <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-sm text-muted-foreground">
            {formatCurrency(compareArea?.income ?? 0)}
          </div>
          <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-sm font-semibold text-green-700 dark:text-green-400">
            {formatCurrency(area.income)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 items-center">
          <span className="text-xs text-muted-foreground">Ausgaben</span>
          <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-muted-foreground">
            {formatCurrency(compareArea?.expenses ?? 0)}
          </div>
          <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm font-semibold text-red-700 dark:text-red-400">
            {formatCurrency(area.expenses)}
          </div>
        </div>
        <div className={`text-center text-2xl font-bold pt-2 border-t ${area.net >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          <span className="inline-flex items-center gap-1">
            {area.net >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            {formatCurrency(area.net)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

const FISCAL_AREAS = [
  { name: "ideell", label: "Ideell" },
  { name: "vermoegensverwaltung", label: "Vermögensverwaltung" },
  { name: "zweckbetrieb", label: "Zweckbetriebe" },
  { name: "wirtschaftlich", label: "Wirtschaftlich" },
];

const AREA_LETTERS = ["A", "B", "C", "D"];

export default function Kassenbericht() {
  const currentYear = new Date().getFullYear();
  const { year: displayYear, setYear: setDisplayYear, compareYear: ctxCompareYear, setCompareYear: setCtxCompareYear } = useFilter();
  const compareYear = ctxCompareYear ?? currentYear - 2;
  const setCompareYear = (y: number) => setCtxCompareYear(y);
  const [activeTab, setActiveTab] = useState("ideell");
  const [pageTab, setPageTab] = useState<"jahresvergleich" | "datev">("jahresvergleich");
  const [deltaMode, setDeltaMode] = useState<"pct" | "eur">("pct");
  const [presentationMode, setPresentationMode] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const [hiddenItems, setHiddenItems] = useState<Set<string>>(loadHiddenLS);
  const [manualMappings, setManualMappings] = useState<ManualMapping[]>(loadMappingsLS);
  const [linkingItem, setLinkingItem] = useState<MatchedLineItem | null>(null);

  // Load config from server; update state when it arrives
  const { data: serverConfig } = useQuery<{ hiddenItems: string[]; manualMappings: ManualMapping[] }>({
    queryKey: ["/api/kassenbericht-config"],
    queryFn: async () => {
      const res = await fetch("/api/kassenbericht-config", { credentials: "include" });
      if (!res.ok) throw new Error("Config laden fehlgeschlagen");
      return res.json();
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!serverConfig) return;
    const hidden = new Set(serverConfig.hiddenItems ?? []);
    const mappings = migrateMappings(serverConfig.manualMappings ?? []);
    setHiddenItems(hidden);
    setManualMappings(mappings);
    localStorage.setItem(LS_HIDDEN, JSON.stringify([...hidden]));
    localStorage.setItem(LS_MAPPINGS, JSON.stringify(mappings));
  }, [serverConfig]);

  const saveConfigMutation = useMutation({
    mutationFn: async (payload: { hiddenItems?: string[]; manualMappings?: ManualMapping[] }) =>
      apiRequest("PUT", "/api/kassenbericht-config", payload),
  });

  const yearOptions = Array.from({ length: currentYear - 2021 }, (_, i) => 2022 + i);

  const toggleHide = (key: string) => {
    setHiddenItems((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      const arr = [...next];
      localStorage.setItem(LS_HIDDEN, JSON.stringify(arr));
      saveConfigMutation.mutate({ hiddenItems: arr });
      return next;
    });
  };

  const addManualMapping = (displayDescs: string[], compareDescs: string[], fiscalArea: string, type: "income" | "expense") => {
    const filtered = manualMappings.filter((m) => {
      if (m.blocked || m.fiscalArea !== fiscalArea || m.type !== type) return true;
      const normD = displayDescs.map(normalizeDesc);
      const normC = compareDescs.map(normalizeDesc);
      const dOverlap = m.displayDescs.some((d) => normD.includes(normalizeDesc(d)));
      const cOverlap = m.compareDescs.some((c) => normC.includes(normalizeDesc(c)));
      return !dOverlap && !cOverlap;
    });
    const next = [
      ...filtered,
      { id: `${Date.now()}-${Math.random()}`, fiscalArea, type, displayDescs, compareDescs, blocked: false },
    ];
    setManualMappings(next);
    localStorage.setItem(LS_MAPPINGS, JSON.stringify(next));
    saveConfigMutation.mutate({ manualMappings: next });
  };

  const removeMapping = (id: string) => {
    const next = manualMappings.filter((m) => m.id !== id);
    setManualMappings(next);
    localStorage.setItem(LS_MAPPINGS, JSON.stringify(next));
    saveConfigMutation.mutate({ manualMappings: next });
  };

  const blockPair = (displayDesc: string, compareDesc: string, fiscalArea: string, type: "income" | "expense") => {
    const next = [
      ...manualMappings,
      { id: `${Date.now()}-${Math.random()}`, fiscalArea, type, displayDescs: [displayDesc], compareDescs: [compareDesc], blocked: true },
    ];
    setManualMappings(next);
    localStorage.setItem(LS_MAPPINGS, JSON.stringify(next));
    saveConfigMutation.mutate({ manualMappings: next });
  };

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const { data: displayReport, isLoading: l1 } = useEuerReport(displayYear) as {
    data: FiscalAreaReport | undefined;
    isLoading: boolean;
  };
  const { data: compareReport, isLoading: l2 } = useEuerReport(compareYear) as {
    data: FiscalAreaReport | undefined;
    isLoading: boolean;
  };
  const { data: displayItems } = useEuerItems(displayYear, null, {
    enabled: !!displayReport,
  }) as { data: EuerLineItem[] | undefined };
  const { data: compareItems } = useEuerItems(compareYear, null, {
    enabled: !!compareReport,
  }) as { data: EuerLineItem[] | undefined };

  // ── Derived Data ───────────────────────────────────────────────────────────

  // Wenn die Einzelposten pro Bereich vorhanden sind und deren Netto-Saldo ≈ dem
  // PDF-gemeldeten Netto ist, nutzen wir die Summen aus den Einzelposten (sie
  // stimmen dann exakt mit der Detail-Tabelle überein). Weicht der Saldo stark ab,
  // sind Einzelposten vom Parser fehlkategorisiert — dann behalten wir die
  // PDF-Summen, die näher am offiziellen Jahresergebnis sind.
  const NET_RECONCILE_TOLERANCE = 50;
  const reconcileReport = (
    report: FiscalAreaReport | undefined,
    items: EuerLineItem[] | undefined,
  ): FiscalAreaReport | undefined => {
    if (!report) return report;
    if (!items || items.length === 0) return report;
    const sumByArea = new Map<string, { income: number; expenses: number }>();
    for (const it of items) {
      const entry = sumByArea.get(it.fiscalArea) ?? { income: 0, expenses: 0 };
      if (it.type === "income") entry.income += it.amount;
      else entry.expenses += it.amount;
      sumByArea.set(it.fiscalArea, entry);
    }
    const areas = report.areas.map((area) => {
      const s = sumByArea.get(area.name);
      if (!s) return area;
      const itemsNet = s.income - s.expenses;
      if (Math.abs(itemsNet - area.net) > NET_RECONCILE_TOLERANCE) return area;
      return { ...area, income: s.income, expenses: s.expenses, net: itemsNet };
    });
    const totalIncome = areas.reduce((a, x) => a + x.income, 0);
    const totalExpenses = areas.reduce((a, x) => a + x.expenses, 0);
    return { ...report, areas, totalIncome, totalExpenses, totalNet: totalIncome - totalExpenses };
  };

  const displayReportFixed = useMemo(
    () => reconcileReport(displayReport, displayItems),
    [displayReport, displayItems],
  );
  const compareReportFixed = useMemo(
    () => reconcileReport(compareReport, compareItems),
    [compareReport, compareItems],
  );

  const chartData = useMemo(
    () => displayReportFixed?.areas.map((area) => {
      const ca = compareReportFixed?.areas.find((a) => a.name === area.name);
      return {
        name: area.label.split(".")[0] + ".",
        fullName: area.label,
        [`income_${compareYear}`]: ca?.income ?? 0,
        [`expenses_${compareYear}`]: ca?.expenses ?? 0,
        [`income_${displayYear}`]: area.income,
        [`expenses_${displayYear}`]: area.expenses,
      };
    }) ?? [],
    [displayReportFixed, compareReportFixed, displayYear, compareYear],
  );

  const allMatched = useMemo(() => {
    if (!displayItems || !compareItems) return [];
    return matchLineItems(displayItems, compareItems, manualMappings);
  }, [displayItems, compareItems, manualMappings]);

  const filteredItems = useMemo(() => {
    let items = allMatched.filter((i) => i.fiscalArea === activeTab);
    if (!showHidden) items = items.filter((i) => !hiddenItems.has(i.key));
    return items;
  }, [allMatched, activeTab, showHidden, hiddenItems]);

  const hasLineItems = (displayItems?.length ?? 0) > 0 || (compareItems?.length ?? 0) > 0;
  const isLoading = l1 || l2;
  const hiddenCount = useMemo(() => allMatched.filter((i) => hiddenItems.has(i.key)).length, [allMatched, hiddenItems]);

  // Active fiscal area as chart letter ("A." / "B." / ...) for Cell opacity highlight
  const activeLetter = AREA_LETTERS[FISCAL_AREAS.findIndex((fa) => fa.name === activeTab)] + ".";

  // Click on a bar-group in the chart → switch active tab
  const handleChartClick = (state: { activeLabel?: string } | null) => {
    const label = state?.activeLabel;
    if (!label) return;
    const letter = label.replace(".", "");
    const idx = AREA_LETTERS.indexOf(letter);
    if (idx >= 0) setActiveTab(FISCAL_AREAS[idx].name);
  };

  // ── Row rendering helper ───────────────────────────────────────────────────

  const renderRow = (item: MatchedLineItem): ReactNode => {
    const isHidden = hiddenItems.has(item.key);
    const isNeu = !item.matched && item.displayAmount !== 0;
    const isEntf = !item.matched && item.compareAmount !== 0;
    const isIncome = item.type === "income";

    // Abweichungs-Schwellen
    const absPct = Math.abs(item.deltaPercent ?? 0);
    const isBigMover = item.matched && item.deltaPercent !== null && absPct > 30;
    const isMediumMover = item.matched && item.deltaPercent !== null && absPct > 10 && absPct <= 30;
    const isGoodDelta = item.type === "expense" ? item.delta < 0 : item.delta > 0;
    const isBadDelta = item.type === "expense" ? item.delta > 0 : item.delta < 0;
    const deltaColorClass = isGoodDelta ? "text-green-600 dark:text-green-400" : isBadDelta ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
    const deltaWeightClass = isBigMover ? "font-bold" : isMediumMover ? "font-medium" : "font-normal text-muted-foreground/70";

    // Item background tint: subtle by default, stronger when big mover
    const baseTint = isIncome
      ? "bg-green-50/40 hover:bg-green-50 dark:bg-green-900/10 dark:hover:bg-green-900/20"
      : "bg-red-50/40 hover:bg-red-50 dark:bg-red-900/10 dark:hover:bg-red-900/20";
    const moverAccent = isBigMover
      ? (isGoodDelta ? "ring-1 ring-green-300/50" : "ring-1 ring-red-300/50")
      : "";

    // Delta display
    const renderDelta = () => {
      if (!item.matched) {
        return isNeu
          ? <Badge variant="outline" className="text-xs font-normal text-green-600 border-green-300">NEU</Badge>
          : <Badge variant="outline" className="text-xs font-normal text-muted-foreground">ENTF.</Badge>;
      }
      if (deltaMode === "eur") {
        return (
          <span className={`${deltaColorClass} ${deltaWeightClass}`}>
            {item.delta !== 0 ? `${item.delta > 0 ? "+" : ""}${formatCurrency(item.delta)}` : "±0"}
          </span>
        );
      }
      return (
        <div>
          <span className={`${deltaColorClass} ${deltaWeightClass}`}>
            {item.deltaPercent !== null
              ? `${item.deltaPercent > 0 ? "+" : ""}${item.deltaPercent.toFixed(1)} %`
              : item.delta !== 0 ? `${item.delta > 0 ? "+" : ""}${formatCurrency(item.delta)}` : "±0"}
          </span>
          {item.deltaPercent !== null && (
            <div className="text-xs text-muted-foreground/60">
              {item.delta > 0 ? "+" : ""}{formatCurrency(item.delta)}
            </div>
          )}
        </div>
      );
    };

    // Subtitle (hover-reveal)
    const subtitle = item.matched
      ? item.allCompareDescs && item.allCompareDescs.length > 1
        ? `${compareYear}: ${item.allCompareDescs.join(" · ")}`
        : item.compareDescription && item.compareDescription !== item.displayDescription
          ? `${compareYear}: ${item.compareDescription}`
          : null
      : null;

    // Konto-Nr-Anzeige: "4000" wenn gleich, "4000 → 4001" wenn unterschiedlich, sonst nur die vorhandene
    const dn = item.displayAccountNumber;
    const cn = item.compareAccountNumber;
    const renderAccount = () => {
      if (dn && cn && dn !== cn) {
        return (
          <span className="inline-flex items-baseline gap-0.5">
            <span className="text-muted-foreground/60">{cn}</span>
            <span className="text-muted-foreground/40">→</span>
            <span>{dn}</span>
          </span>
        );
      }
      return <span>{dn || cn || ""}</span>;
    };

    return (
      <div
        key={item.key}
        className={`group/row flex items-center gap-3 py-2 pl-3 pr-2 rounded-md ${baseTint} ${moverAccent} ${isHidden ? "opacity-40" : ""}`}
      >
        <span className="text-xs font-mono tabular-nums text-muted-foreground w-20 shrink-0">
          {renderAccount()}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {item.allDisplayDescs && item.allDisplayDescs.length > 1
              ? item.allDisplayDescs.join(" · ")
              : (item.displayDescription || item.compareDescription)}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground/40 group-hover/row:text-muted-foreground/70 italic truncate transition-colors duration-150">
              {subtitle}
            </div>
          )}
        </div>

        <span className="text-right text-sm text-muted-foreground tabular-nums w-28 shrink-0">
          {item.compareAmount !== 0 ? formatCurrency(item.compareAmount) : <span className="text-muted-foreground/40">—</span>}
        </span>

        <span className="text-right text-sm font-medium tabular-nums w-28 shrink-0">
          {item.displayAmount !== 0 ? formatCurrency(item.displayAmount) : <span className="text-muted-foreground/40">—</span>}
        </span>

        <div className="text-right text-sm w-32 shrink-0">{renderDelta()}</div>

        {!presentationMode && (
          <div className="flex items-center gap-0.5 w-20 shrink-0 justify-end">
            {(isNeu || isEntf || item.matchType === "fuzzy") && (
              <button
                onClick={() => setLinkingItem(item)}
                className="p-1.5 rounded hover:bg-primary/10 text-muted-foreground/50 hover:text-primary transition-colors"
                title="Verknüpfen"
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>
            )}
            {item.matched && (item.matchType === "manual" || item.matchType === "fuzzy") && (
              <button
                onClick={() => {
                  if (item.matchType === "manual" && item.manualId) {
                    removeMapping(item.manualId);
                  } else if (item.matchType === "fuzzy") {
                    blockPair(item.displayDescription, item.compareDescription, item.fiscalArea, item.type);
                  }
                }}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                title={item.matchType === "manual" ? "Verknüpfung aufheben" : "Automatische Zuordnung ablehnen"}
              >
                <Unlink2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => toggleHide(item.key)}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title={isHidden ? "Einblenden" : "Ausblenden"}
            >
              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Section rendering helper ───────────────────────────────────────────────

  const renderSections = (): ReactNode[] => {
    const blocks: ReactNode[] = [];
    const areaItems = filteredItems; // already filtered to activeTab
    // Die Summenzeile soll alle Positionen des Bereichs enthalten — auch die,
    // die der Nutzer aktuell ausgeblendet hat. Dafür greifen wir auf allMatched zu.
    const areaAllItems = allMatched.filter((i) => i.fiscalArea === activeTab);

    for (const type of ["income", "expense"] as const) {
      const typeItems = areaItems.filter((i) => i.type === type);
      if (typeItems.length === 0) continue;
      const allTypeItems = areaAllItems.filter((i) => i.type === type);
      const isIncome = type === "income";
      const sectionKey = `${activeTab}-${type}`;
      const isCollapsed = collapsedSections.has(sectionKey);

      const sumC = allTypeItems.reduce((s, i) => s + i.compareAmount, 0);
      const sumD = allTypeItems.reduce((s, i) => s + i.displayAmount, 0);
      const sumDelta = sumD - sumC;
      const sumPct = sumC !== 0 ? (sumDelta / Math.abs(sumC)) * 100 : null;

      const sumDeltaColor = (isIncome ? sumDelta > 0 : sumDelta < 0)
        ? "text-green-600"
        : (isIncome ? sumDelta < 0 : sumDelta > 0)
          ? "text-red-600"
          : "text-muted-foreground";

      blocks.push(
        <div key={`${activeTab}-${type}-section`} className="space-y-1">
          {/* Section header */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer select-none ${isIncome ? "bg-green-100/70 hover:bg-green-100 dark:bg-green-900/20" : "bg-red-100/70 hover:bg-red-100 dark:bg-red-900/20"}`}
            onClick={() => toggleSection(sectionKey)}
          >
            {isCollapsed
              ? <ChevronRight className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />}
            {isIncome
              ? <TrendingUp className="w-4 h-4 text-green-700 dark:text-green-400" />
              : <TrendingDown className="w-4 h-4 text-red-700 dark:text-red-400" />}
            <span className={`text-sm font-semibold ${isIncome ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              {isIncome ? "Einnahmen" : "Ausgaben"}
            </span>
            <span className="text-xs text-muted-foreground/70 font-normal">
              {typeItems.length} Positionen
            </span>
          </div>

          {/* Items */}
          {!isCollapsed && (
            <div className="space-y-1">
              {typeItems.map((item) => renderRow(item))}
            </div>
          )}

          {/* Sum row */}
          <div className={`flex items-center gap-3 py-2 pl-3 pr-2 rounded-md font-semibold ${isIncome ? "bg-green-100 dark:bg-green-900/30 border border-green-200/60" : "bg-red-100 dark:bg-red-900/30 border border-red-200/60"}`}>
            <span className="w-20 shrink-0" />
            <span className={`flex-1 text-sm ${isIncome ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}>
              Summe {isIncome ? "Einnahmen" : "Ausgaben"}
            </span>
            <span className="text-right text-sm text-muted-foreground tabular-nums w-28 shrink-0">{formatCurrency(sumC)}</span>
            <span className={`text-right text-sm tabular-nums w-28 shrink-0 ${isIncome ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{formatCurrency(sumD)}</span>
            <span className={`text-right text-sm w-32 shrink-0 ${sumDeltaColor}`}>
              {deltaMode === "eur"
                ? (sumDelta !== 0 ? `${sumDelta > 0 ? "+" : ""}${formatCurrency(sumDelta)}` : "—")
                : (sumPct !== null ? `${sumPct > 0 ? "+" : ""}${sumPct.toFixed(1)} %` : "—")}
            </span>
            {!presentationMode && <span className="w-20 shrink-0" />}
          </div>
        </div>,
      );
    }
    return blocks;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="space-y-6">
        <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as "jahresvergleich" | "datev")}>
          <TabsList data-testid="tabs-kassenbericht-pagelevel">
            <TabsTrigger value="jahresvergleich" data-testid="tab-jahresvergleich">Jahresvergleich</TabsTrigger>
            <TabsTrigger value="datev" data-testid="tab-datev">DATEV-Auswertung</TabsTrigger>
          </TabsList>

          <TabsContent value="datev" className="mt-4">
            <div className="mb-4">
              <h1 className="text-3xl font-bold font-display">DATEV-Auswertung</h1>
              <p className="text-muted-foreground mt-1">Pivot-Auswertung des DATEV-Buchungsstapels nach EÜR-Bereichen (A1…D2)</p>
            </div>
            <DatevAuswertungTab />
          </TabsContent>

          <TabsContent value="jahresvergleich" className="mt-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-display">Kassenbericht {displayYear}</h1>
            <p className="text-muted-foreground mt-1">
              Einnahmen-Überschussrechnung — Jahresvergleich {compareYear} → {displayYear}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Vergleich</span>
              <Select value={String(compareYear)} onValueChange={(v) => setCompareYear(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.filter((y) => y !== displayYear).map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-muted-foreground">→</span>
            <Select value={String(displayYear)} onValueChange={(v) => setDisplayYear(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.filter((y) => y !== compareYear).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Section 1: AreaCards */}
            <div className="grid gap-4 md:grid-cols-2">
              {displayReportFixed?.areas.map((area) => (
                <AreaCard
                  key={area.name}
                  area={area}
                  compareArea={compareReportFixed?.areas.find((a) => a.name === area.name)}
                  compareYear={compareYear}
                  displayYear={displayYear}
                />
              ))}
            </div>

            {/* Totalszeile */}
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: "Gesamteinnahmen", cur: displayReportFixed?.totalIncome ?? 0, prev: compareReportFixed?.totalIncome, tone: "positive" as const },
                    { label: "Gesamtausgaben", cur: displayReportFixed?.totalExpenses ?? 0, prev: compareReportFixed?.totalExpenses, tone: "negative" as const },
                    { label: "Jahresergebnis", cur: displayReportFixed?.totalNet ?? 0, prev: compareReportFixed?.totalNet, net: true, tone: "signed" as const },
                  ].map(({ label, cur, prev, net, tone }) => {
                    const isPositive = tone === "positive" || (tone === "signed" && cur >= 0);
                    const colorClass = isPositive
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400";
                    return (
                    <div key={label}>
                      <div className="text-sm text-muted-foreground mb-1">{label} {displayYear}</div>
                      <div className={`text-2xl font-bold ${net ? "flex items-center justify-center gap-1 " : ""}${colorClass}`}>
                        {net && (cur >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />)}
                        {formatCurrency(cur)}
                      </div>
                      {prev !== undefined && (
                        <div className="text-xs text-muted-foreground mt-1">{compareYear}: {formatCurrency(prev)}</div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Section 2+3: Tätigkeitsbereiche-Vergleich (Chart + Detail) */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle>Tätigkeitsbereiche-Vergleich</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {hiddenCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={() => setShowHidden((v) => !v)}>
                        {showHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {hiddenCount} ausgeblendet
                      </Button>
                    )}
                    <Button
                      variant={presentationMode ? "default" : "outline"}
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setPresentationMode((v) => !v)}
                    >
                      <Presentation className="w-3.5 h-3.5" />
                      {presentationMode ? "Bearbeiten" : "Präsentation"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      barGap={2}
                      barCategoryGap="25%"
                      margin={{ top: 4, right: 16, left: 16, bottom: 4 }}
                      onClick={handleChartClick}
                      style={{ cursor: "pointer" }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tickFormatter={(v) => new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 0 }).format(v)}
                        tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                      />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(l, p) => p?.[0]?.payload.fullName ?? l} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                      <Legend />
                      <Bar dataKey={`income_${compareYear}`} name={`Einnahmen ${compareYear}`} fill="hsl(142 76% 36% / 0.35)" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={`ci-${i}`} fillOpacity={entry.name === activeLetter ? 1 : 0.35} />
                        ))}
                      </Bar>
                      <Bar dataKey={`expenses_${compareYear}`} name={`Ausgaben ${compareYear}`} fill="hsl(0 72% 51% / 0.35)" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={`ce-${i}`} fillOpacity={entry.name === activeLetter ? 1 : 0.35} />
                        ))}
                      </Bar>
                      <Bar dataKey={`income_${displayYear}`} name={`Einnahmen ${displayYear}`} fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={`di-${i}`} fillOpacity={entry.name === activeLetter ? 1 : 0.35} />
                        ))}
                      </Bar>
                      <Bar dataKey={`expenses_${displayYear}`} name={`Ausgaben ${displayYear}`} fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={`de-${i}`} fillOpacity={entry.name === activeLetter ? 1 : 0.35} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <Separator />

                {!hasLineItems ? (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Keine Einzelpositionen. EÜR-PDFs für {compareYear} und {displayYear} unter <strong>EÜR Bericht</strong> hochladen.</span>
                  </div>
                ) : (
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="mb-4 flex-wrap h-auto gap-1">
                      {FISCAL_AREAS.map((fa) => (
                        <TabsTrigger key={fa.name} value={fa.name}>{fa.label}</TabsTrigger>
                      ))}
                    </TabsList>
                    <TabsContent value={activeTab} forceMount>
                      {filteredItems.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">Keine Positionen.</div>
                      ) : (
                        <div className="space-y-3 overflow-x-auto">
                          {/* Column header */}
                          <div className="flex items-center gap-3 px-3 pb-1 text-xs font-medium text-muted-foreground border-b min-w-[640px]">
                            <span className="w-20 shrink-0">Konto</span>
                            <span className="flex-1">Bezeichnung</span>
                            <span className="text-right w-28 shrink-0">{compareYear}</span>
                            <span className="text-right w-28 shrink-0">{displayYear}</span>
                            <span className="text-right w-32 shrink-0">
                              <button
                                onClick={() => setDeltaMode((v) => v === "pct" ? "eur" : "pct")}
                                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                                title="Zwischen % und € wechseln"
                              >
                                Veränderung <span className="text-muted-foreground/60 font-normal">({deltaMode === "pct" ? "%" : "€"})</span>
                                <ArrowUpDown className="w-3 h-3 opacity-50" />
                              </button>
                            </span>
                            {!presentationMode && <span className="w-20 shrink-0" />}
                          </div>
                          {/* Sections (Einnahmen + Ausgaben) */}
                          <div className="space-y-4 min-w-[640px]">{renderSections()}</div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>

            {/* Section 4: Liquide Mittel (Mehrjahres-Uebersicht) */}
            <LiquideMittelCard defaultHighlightYears={[compareYear, displayYear]} />
          </>
        )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Linking Dialog */}
      {linkingItem && (
        <LinkingDialog
          item={linkingItem}
          allItems={allMatched}
          compareYear={compareYear}
          displayYear={displayYear}
          onLink={addManualMapping}
          onClose={() => setLinkingItem(null)}
        />
      )}
    </Layout>
  );
}
