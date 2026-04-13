import OpenAI from "openai";
import { storage } from "./storage";
import type { Transaction } from "@shared/schema";

let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

interface AssistantRequest {
  message: string;
  year: number;
  account?: string;
}

interface TransactionSummary {
  date: string;
  amount: number;
  description: string;
  category?: string;
}

async function getTransactionContext(year: number, account?: string): Promise<string> {
  const transactions = await storage.getTransactions({ year, account });
  const allAccounts = await storage.getAccounts();
  const categories = await storage.getCategories();
  const balances = await storage.getAccountBalances(year);
  const totalStats = await storage.getTotalStats(year, account);
  const monthlyStats = await storage.getMonthlyStats(year, account);
  
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  const accountMap = new Map(allAccounts.map(a => [a.id, a.name]));
  
  const transferCatId = categories.find(c => c.name === 'Interne Umbuchung')?.id;
  const filteredTransactions = transactions.filter(tx => tx.categoryId !== transferCatId);
  
  const openingBalance = balances.reduce((sum, b) => sum + (b.openingBalance || 0), 0);
  const cashFlow = totalStats.income - totalStats.expenses;
  const cashPosition = openingBalance + cashFlow;
  
  const txSummaries = filteredTransactions.slice(0, 200).map(tx => ({
    date: new Date(tx.date).toLocaleDateString('de-DE'),
    amount: tx.amount,
    description: tx.description.substring(0, 100),
    category: tx.categoryId ? categoryMap.get(tx.categoryId) : 'Unkategorisiert',
    account: tx.accountId ? accountMap.get(tx.accountId) : tx.account
  }));
  
  return `
FINANZDATEN für ${year}:
(HINWEIS: Interne Umbuchungen sind bereits aus allen Statistiken ausgeschlossen!)

KONTEN:
${allAccounts.map(a => `- ${a.name} (IBAN: ${a.iban})`).join('\n')}

ANFANGSSALDEN:
${balances.map(b => {
  const accName = accountMap.get(b.accountId) || 'Unbekannt';
  return `- ${accName}: ${b.openingBalance?.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`;
}).join('\n')}

JAHRESSTATISTIKEN (ohne interne Umbuchungen):
- Anfangssaldo gesamt: ${openingBalance.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
- Kassenbestand aktuell: ${cashPosition.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
- Einnahmen gesamt: ${totalStats.income.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
- Ausgaben gesamt: ${totalStats.expenses.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
- Cashflow: ${cashFlow.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}

MONATLICHE STATISTIKEN (ohne interne Umbuchungen):
${monthlyStats.map(m => 
  `${m.month}: Einnahmen ${m.income.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} | Ausgaben ${m.expenses.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`
).join('\n')}

TRANSAKTIONEN (${filteredTransactions.length} ohne Umbuchungen, erste 200):
${txSummaries.map(tx => 
  `${tx.date}: ${tx.amount >= 0 ? '+' : ''}${tx.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} | ${tx.category} | ${tx.description}`
).join('\n')}
`;
}

async function analyzeBalanceDrop(date: string, year: number, account?: string): Promise<string> {
  const transactions = await storage.getTransactions({ year, account });
  const targetDate = new Date(date);
  
  const nearbyTx = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    const daysDiff = Math.abs((txDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff <= 3;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const categories = await storage.getCategories();
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));
  
  const largeTx = nearbyTx.filter(tx => Math.abs(tx.amount) > 1000);
  
  return `
TRANSAKTIONEN UM DEN ${new Date(date).toLocaleDateString('de-DE')}:
${nearbyTx.map(tx => {
  const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : 'Unkategorisiert';
  return `${new Date(tx.date).toLocaleDateString('de-DE')}: ${tx.amount >= 0 ? '+' : ''}${tx.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} | ${cat} | ${tx.description}`;
}).join('\n')}

GRÖSSTE BETRÄGE (über 1.000€):
${largeTx.map(tx => {
  const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : 'Unkategorisiert';
  return `${new Date(tx.date).toLocaleDateString('de-DE')}: ${tx.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} | ${cat} | ${tx.description}`;
}).join('\n') || 'Keine großen Beträge in diesem Zeitraum'}
`;
}

export async function processAssistantQuery(request: AssistantRequest): Promise<AsyncGenerator<string>> {
  const { message, year, account } = request;
  
  const dateMatch = message.match(/(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?|(\d{1,2})\.\s*(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)/i);
  
  let additionalContext = '';
  if (dateMatch) {
    let dateStr = '';
    if (dateMatch[4] && dateMatch[5]) {
      const months: Record<string, string> = {
        'januar': '01', 'februar': '02', 'märz': '03', 'april': '04', 'mai': '05', 'juni': '06',
        'juli': '07', 'august': '08', 'september': '09', 'oktober': '10', 'november': '11', 'dezember': '12'
      };
      const day = dateMatch[4].padStart(2, '0');
      const month = months[dateMatch[5].toLowerCase()];
      dateStr = `${year}-${month}-${day}`;
    } else if (dateMatch[1] && dateMatch[2]) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const yr = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : String(year);
      dateStr = `${yr}-${month}-${day}`;
    }
    if (dateStr) {
      additionalContext = await analyzeBalanceDrop(dateStr, year, account);
    }
  }
  
  const context = await getTransactionContext(year, account);
  
  const systemPrompt = `Du bist ein Finanz-Assistent für den Sportverein TSV Greding e.V. 
Du analysierst Finanzdaten und beantwortest Fragen auf Deutsch.

WICHTIG: 
- Benutze NUR die bereitgestellten MONATLICHEN STATISTIKEN und JAHRESSTATISTIKEN für Einnahmen/Ausgaben-Fragen.
- Interne Umbuchungen zwischen Vereinskonten sind bereits aus allen Statistiken ausgeschlossen.
- Berechne KEINE eigenen Summen aus den Transaktionslisten - verwende die vorberechneten Statistiken.

Formatiere Geldbeträge immer im deutschen Format (z.B. 1.234,56 EUR).
Wenn du nach Gründen für Kontostandsänderungen gefragt wirst, nenne die konkreten Transaktionen.
Sei präzise und hilfsbereit. Antworte auf Deutsch.

${context}

${additionalContext ? `\nSPEZIFISCHE ANALYSE:\n${additionalContext}` : ''}`;

  async function* generateResponse(): AsyncGenerator<string> {
    if (!openai) {
      yield "KI-Assistent nicht verfügbar (kein API-Key konfiguriert).";
      return;
    }
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      stream: true,
      max_tokens: 1500,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
  
  return generateResponse();
}
