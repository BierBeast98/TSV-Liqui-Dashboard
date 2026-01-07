import { storage } from "./storage";
import type { TransactionResponse, InsertContractSuggestion } from "@shared/schema";

interface TransactionCluster {
  name: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  accountId: number | null;
  categoryId: number | null;
  transactionIds: string[];
  dates: Date[];
  frequency: "monthly" | "quarterly" | "yearly" | null;
  confidence: number;
}

const INTERNAL_TRANSFER_CATEGORY_ID = 46;

function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d{2}[\.\-\/]\d{2}[\.\-\/]\d{2,4}/g, "")
    .replace(/\b(de\d{2}[a-z0-9]{18,22})\b/gi, "")
    .replace(/\b([a-z]{2}\d{2}[a-z0-9]{4}\d{14})\b/gi, "")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getKeyWords(desc: string): string[] {
  const normalized = normalizeDescription(desc);
  const stopWords = new Set(["der", "die", "das", "und", "oder", "fuer", "von", "an", "bei", "mit", "zu", "auf", "in", "aus", "zum", "zur"]);
  return normalized.split(" ").filter(w => w.length > 2 && !stopWords.has(w));
}

function calculateSimilarity(desc1: string, desc2: string): number {
  const words1 = new Set(getKeyWords(desc1));
  const words2 = new Set(getKeyWords(desc2));
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set(Array.from(words1).filter(w => words2.has(w)));
  const union = new Set(Array.from(words1).concat(Array.from(words2)));
  return intersection.size / union.size;
}

function inferFrequency(dates: Date[]): { frequency: "monthly" | "quarterly" | "yearly" | null; confidence: number } {
  if (dates.length < 2) return { frequency: null, confidence: 0 };
  
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const deltas: number[] = [];
  
  for (let i = 1; i < sorted.length; i++) {
    const daysDiff = Math.round((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24));
    deltas.push(daysDiff);
  }
  
  const medianDelta = deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)];
  
  if (medianDelta >= 26 && medianDelta <= 35 && dates.length >= 4) {
    return { frequency: "monthly", confidence: Math.min(0.9, 0.5 + dates.length * 0.05) };
  } else if (medianDelta >= 80 && medianDelta <= 110 && dates.length >= 3) {
    return { frequency: "quarterly", confidence: Math.min(0.85, 0.4 + dates.length * 0.1) };
  } else if (medianDelta >= 330 && medianDelta <= 400 && dates.length >= 2) {
    return { frequency: "yearly", confidence: Math.min(0.8, 0.3 + dates.length * 0.15) };
  }
  
  return { frequency: null, confidence: 0 };
}

function extractContractName(transactions: TransactionResponse[]): string {
  const descriptions = transactions.map(t => t.description);
  const firstDesc = descriptions[0] || "";
  
  const sepaMatch = firstDesc.match(/EREF[\+:]?\s*([^\s]+)/i);
  if (sepaMatch) return sepaMatch[1].substring(0, 50);
  
  const nameMatch = firstDesc.match(/(?:von|an|empfaenger|auftraggeber)[:\s]+([^,\n]+)/i);
  if (nameMatch) return nameMatch[1].trim().substring(0, 50);
  
  const keywords = getKeyWords(firstDesc).slice(0, 3);
  if (keywords.length > 0) {
    return keywords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  
  return firstDesc.substring(0, 30);
}

export async function analyzeRecurringTransactions(): Promise<void> {
  await storage.clearPendingSuggestions();
  
  const now = new Date();
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
  
  const allTransactions = await storage.getTransactions({
    startDate: twoYearsAgo.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0]
  });
  
  const nonTransfers = allTransactions.filter(t => t.categoryId !== INTERNAL_TRANSFER_CATEGORY_ID);
  
  const buckets = new Map<string, TransactionResponse[]>();
  
  for (const tx of nonTransfers) {
    const type = tx.amount >= 0 ? "income" : "expense";
    const roundedAmount = Math.round(Math.abs(tx.amount) * 100) / 100;
    const normalizedDesc = normalizeDescription(tx.description);
    const bucketKey = `${type}:${tx.accountId}:${roundedAmount}:${normalizedDesc.substring(0, 20)}`;
    
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(tx);
  }
  
  const clusters: TransactionCluster[] = [];
  
  const bucketEntries = Array.from(buckets.entries());
  for (const [key, transactions] of bucketEntries) {
    if (transactions.length < 2) continue;
    
    const dates = transactions.map((t: TransactionResponse) => new Date(t.date));
    const { frequency, confidence } = inferFrequency(dates);
    
    if (!frequency || confidence < 0.3) continue;
    
    const type: "income" | "expense" = transactions[0].amount >= 0 ? "income" : "expense";
    const amounts = transactions.map((t: TransactionResponse) => Math.abs(t.amount));
    const medianAmount = amounts.sort((a: number, b: number) => a - b)[Math.floor(amounts.length / 2)];
    const signedAmount = type === "expense" ? -medianAmount : medianAmount;
    
    clusters.push({
      name: extractContractName(transactions),
      description: transactions[0].description.substring(0, 100),
      amount: signedAmount,
      type,
      accountId: transactions[0].accountId,
      categoryId: transactions[0].categoryId,
      transactionIds: transactions.map((t: TransactionResponse) => String(t.id)),
      dates,
      frequency,
      confidence
    });
  }
  
  const existingContracts = await storage.getContracts(true);
  const existingNames = new Set(existingContracts.map(c => c.name.toLowerCase()));
  
  const newClusters = clusters.filter(c => !existingNames.has(c.name.toLowerCase()));
  
  for (const cluster of newClusters) {
    const suggestion: InsertContractSuggestion = {
      name: cluster.name,
      description: cluster.description,
      amount: cluster.amount,
      frequency: cluster.frequency!,
      type: cluster.type,
      categoryId: cluster.categoryId,
      accountId: cluster.accountId,
      confidence: cluster.confidence,
      status: "pending",
      sourceTransactionIds: cluster.transactionIds,
      sampleDates: cluster.dates.map(d => d.toISOString().split("T")[0])
    };
    
    await storage.createContractSuggestion(suggestion);
  }
  
  console.log(`Contract analysis complete: ${newClusters.length} suggestions created`);
}
