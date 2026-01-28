import { Layout } from "@/components/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Loader2, FileText, Pencil, TrendingUp, TrendingDown, Power, Sparkles, Check, X, RefreshCw, Calendar, Receipt, Link2 } from "lucide-react";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { ContractWithCategory, Category, ContractSuggestionWithDetails, TransactionWithDetails } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

type Frequency = "monthly" | "quarterly" | "yearly";
type ContractType = "income" | "expense";

const frequencyLabels: Record<Frequency, string> = {
  monthly: "Monatlich",
  quarterly: "Vierteljährlich",
  yearly: "Jährlich"
};

const frequencyMultipliers: Record<Frequency, number> = {
  monthly: 12,
  quarterly: 4,
  yearly: 1
};

interface ContractFormData {
  name: string;
  description: string;
  amount: string;
  frequency: Frequency;
  type: ContractType;
  categoryId: string;
}

const emptyFormData: ContractFormData = {
  name: "",
  description: "",
  amount: "",
  frequency: "monthly",
  type: "expense",
  categoryId: ""
};

export default function Contracts() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [formData, setFormData] = useState<ContractFormData>(emptyFormData);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ContractSuggestionWithDetails | null>(null);
  const [isTransactionsDialogOpen, setIsTransactionsDialogOpen] = useState(false);

  const { data: contracts, isLoading } = useQuery<ContractWithCategory[]>({
    queryKey: ["/api/contracts", showInactive],
    queryFn: async () => {
      const res = await fetch(`/api/contracts?includeInactive=${showInactive}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    }
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"]
  });

  const createMutation = useMutation({
    mutationFn: async (contract: Omit<ContractFormData, "amount" | "categoryId"> & { amount: number; categoryId: number | null }) => {
      return await apiRequest("POST", "/api/contracts", contract);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setIsDialogOpen(false);
      setFormData(emptyFormData);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, unknown> }) => {
      return await apiRequest("PATCH", `/api/contracts/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setIsDialogOpen(false);
      setFormData(emptyFormData);
      setEditingId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/contracts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
    }
  });

  const { toast } = useToast();

  const linkTransactionsMutation = useMutation({
    mutationFn: async (contractId: number) => {
      const res = await apiRequest("POST", `/api/contracts/${contractId}/link-transactions`, {});
      return res.json();
    },
    onSuccess: (data: { linkedCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      if (data.linkedCount > 0) {
        toast({ 
          title: "Buchungen verknüpft", 
          description: `${data.linkedCount} Buchung(en) wurden mit dem Vertrag verknüpft.` 
        });
      } else {
        toast({ 
          title: "Keine passenden Buchungen", 
          description: "Es wurden keine unverknüpften Buchungen mit passendem Betrag gefunden." 
        });
      }
    },
    onError: () => {
      toast({ title: "Fehler", description: "Verknüpfung fehlgeschlagen.", variant: "destructive" });
    }
  });

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<ContractSuggestionWithDetails[]>({
    queryKey: ["/api/contracts/suggestions", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/contracts/suggestions?status=pending", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    }
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/contracts/suggestions/run", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/suggestions"] });
      toast({ title: "Analyse abgeschlossen", description: "Buchungen wurden nach wiederkehrenden Zahlungen durchsucht." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Analyse konnte nicht durchgeführt werden.", variant: "destructive" });
    }
  });

  const acceptSuggestionMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/contracts/suggestions/${id}/accept`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({ title: "Vertrag erstellt", description: "Der Vorschlag wurde als Vertrag übernommen." });
    }
  });

  const dismissSuggestionMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/contracts/suggestions/${id}/dismiss`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/suggestions"] });
      toast({ title: "Vorschlag abgelehnt" });
    }
  });

  const relatedTransactionIds = selectedSuggestion?.sourceTransactionIds?.join(",") || "";
  const { data: relatedTransactions, isLoading: relatedLoading } = useQuery<TransactionWithDetails[]>({
    queryKey: ["/api/transactions/by-ids", relatedTransactionIds],
    queryFn: async () => {
      if (!relatedTransactionIds) return [];
      const res = await fetch(`/api/transactions/by-ids?ids=${relatedTransactionIds}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!relatedTransactionIds && isTransactionsDialogOpen
  });

  const handleSuggestionClick = (suggestion: ContractSuggestionWithDetails) => {
    setSelectedSuggestion(suggestion);
    setIsTransactionsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.amount) return;
    const parsedAmount = parseFloat(formData.amount.replace(",", "."));
    const signedAmount = formData.type === "expense" ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);
    const categoryIdValue = formData.categoryId && formData.categoryId !== "none" ? parseInt(formData.categoryId) : null;
    
    if (editingId) {
      updateMutation.mutate({ 
        id: editingId, 
        updates: {
          name: formData.name,
          description: formData.description || null,
          amount: signedAmount,
          frequency: formData.frequency,
          type: formData.type,
          categoryId: categoryIdValue
        }
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        description: formData.description || "",
        amount: signedAmount,
        frequency: formData.frequency,
        type: formData.type,
        categoryId: categoryIdValue
      });
    }
  };

  const handleEdit = (contract: ContractWithCategory) => {
    setFormData({
      name: contract.name,
      description: contract.description || "",
      amount: String(Math.abs(contract.amount)),
      frequency: contract.frequency as Frequency,
      type: contract.type as ContractType,
      categoryId: contract.categoryId ? String(contract.categoryId) : ""
    });
    setEditingId(contract.id);
    setIsDialogOpen(true);
  };

  const handleToggleActive = (contract: ContractWithCategory) => {
    updateMutation.mutate({ id: contract.id, updates: { isActive: !contract.isActive } });
  };

  const groupByFrequency = (items: ContractWithCategory[], type: ContractType) => {
    const filtered = items.filter(c => c.type === type);
    const grouped: Record<Frequency, ContractWithCategory[]> = {
      monthly: [],
      quarterly: [],
      yearly: []
    };
    
    filtered.forEach(c => {
      grouped[c.frequency as Frequency].push(c);
    });
    
    return grouped;
  };

  const calculateTotal = (items: ContractWithCategory[]) => {
    return items.reduce((sum, c) => sum + Math.abs(c.amount), 0);
  };

  const calculateYearlyTotal = (items: ContractWithCategory[]) => {
    return items.reduce((sum, c) => {
      const multiplier = frequencyMultipliers[c.frequency as Frequency];
      return sum + Math.abs(c.amount) * multiplier;
    }, 0);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const expenseGroups = contracts ? groupByFrequency(contracts, "expense") : { monthly: [], quarterly: [], yearly: [] };
  const incomeGroups = contracts ? groupByFrequency(contracts, "income") : { monthly: [], quarterly: [], yearly: [] };

  const allExpenses = contracts?.filter(c => c.type === "expense") || [];
  const allIncomes = contracts?.filter(c => c.type === "income") || [];
  
  const yearlyExpenseTotal = calculateYearlyTotal(allExpenses);
  const yearlyIncomeTotal = calculateYearlyTotal(allIncomes);

  const renderContractGroup = (title: string, items: ContractWithCategory[], total: number) => {
    if (items.length === 0) return null;
    
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-sm font-medium text-muted-foreground">{title} ({items.length})</span>
          <span className="text-sm font-semibold">{formatCurrency(total)}</span>
        </div>
        <div className="space-y-2">
          {items.map(contract => (
            <Card 
              key={contract.id} 
              className={`hover-elevate ${!contract.isActive ? 'opacity-60' : ''}`}
              data-testid={`card-contract-${contract.id}`}
            >
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-md flex items-center justify-center ${
                      contract.type === "income" ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
                    }`}>
                      {contract.type === "income" ? (
                        <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 md:w-5 md:h-5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate text-sm md:text-base">{contract.name}</p>
                      <p className="text-xs md:text-sm text-muted-foreground truncate">
                        {contract.categoryName || contract.description || "Ohne Kategorie"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <span className={`font-semibold whitespace-nowrap text-sm md:text-base ${
                      contract.type === "income" ? "text-green-600 dark:text-green-400" : ""
                    }`}>
                      {contract.type === "income" ? "+" : ""}{formatCurrency(Math.abs(contract.amount))}
                    </span>
                    <div className="flex items-center">
                      <Button 
                        size="icon" 
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleToggleActive(contract)}
                        disabled={updateMutation.isPending}
                        title={contract.isActive ? "Deaktivieren" : "Aktivieren"}
                        data-testid={`button-toggle-contract-${contract.id}`}
                      >
                        <Power className={`w-4 h-4 ${contract.isActive ? "text-green-500" : "text-muted-foreground"}`} />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => linkTransactionsMutation.mutate(contract.id)}
                        disabled={linkTransactionsMutation.isPending}
                        title="Passende Buchungen verknüpfen"
                        data-testid={`button-link-transactions-${contract.id}`}
                      >
                        <Link2 className="w-4 h-4 text-primary" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleEdit(contract)}
                        data-testid={`button-edit-contract-${contract.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => deleteMutation.mutate(contract.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-contract-${contract.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight text-foreground">Verträge</h2>
            <p className="text-muted-foreground text-sm mt-1">Wiederkehrende Einnahmen und Ausgaben verwalten</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch 
                id="show-inactive" 
                checked={showInactive} 
                onCheckedChange={setShowInactive}
                data-testid="switch-show-inactive"
              />
              <Label htmlFor="show-inactive" className="text-xs sm:text-sm">Inaktive</Label>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setFormData(emptyFormData);
                setEditingId(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-create-contract">
                  <Plus className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Neuer Vertrag</span>
                  <span className="sm:hidden">Neu</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] sm:w-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingId ? "Vertrag bearbeiten" : "Neuen Vertrag erstellen"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="z.B. Versicherung, Mitgliedsbeitrag"
                      data-testid="input-contract-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Beschreibung (optional)</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Weitere Details..."
                      data-testid="input-contract-description"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount">Betrag</Label>
                      <Input
                        id="amount"
                        type="text"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        placeholder="0,00"
                        data-testid="input-contract-amount"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Art</Label>
                      <Select 
                        value={formData.type} 
                        onValueChange={(value: ContractType) => setFormData({ ...formData, type: value })}
                      >
                        <SelectTrigger data-testid="select-contract-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Ausgabe</SelectItem>
                          <SelectItem value="income">Einnahme</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="frequency">Häufigkeit</Label>
                      <Select 
                        value={formData.frequency} 
                        onValueChange={(value: Frequency) => setFormData({ ...formData, frequency: value })}
                      >
                        <SelectTrigger data-testid="select-contract-frequency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monatlich</SelectItem>
                          <SelectItem value="quarterly">Vierteljährlich</SelectItem>
                          <SelectItem value="yearly">Jährlich</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Kategorie</Label>
                      <Select 
                        value={formData.categoryId} 
                        onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                      >
                        <SelectTrigger data-testid="select-contract-category">
                          <SelectValue placeholder="Auswählen..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Keine Kategorie</SelectItem>
                          {categories?.filter(c => c.type === formData.type).map(cat => (
                            <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={createMutation.isPending || updateMutation.isPending || !formData.name || !formData.amount}
                    className="w-full"
                    data-testid="button-submit-contract"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingId ? "Speichern" : "Erstellen"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Suggestions Panel */}
        <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Erkannte wiederkehrende Zahlungen
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                data-testid="button-analyze-contracts"
              >
                {analyzeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Buchungen analysieren
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {suggestionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : suggestions && suggestions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-3">
                  {suggestions.length} Vorschläge gefunden. Übernehmen Sie passende als Verträge.
                </p>
                {suggestions.map(suggestion => (
                  <div 
                    key={suggestion.id} 
                    className="flex items-center justify-between gap-4 p-3 rounded-md bg-background border cursor-pointer hover-elevate"
                    data-testid={`suggestion-${suggestion.id}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                        suggestion.type === "income" ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
                      }`}>
                        {suggestion.type === "income" ? (
                          <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-sm">{suggestion.name}</p>
                        {suggestion.counterparty && (
                          <p className="text-xs text-foreground/70 truncate">{suggestion.counterparty}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {frequencyLabels[suggestion.frequency as Frequency]} • {suggestion.sampleDates?.length || 0} Buchungen erkannt
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm whitespace-nowrap ${
                        suggestion.type === "income" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      }`}>
                        {suggestion.type === "income" ? "+" : "-"}{formatCurrency(Math.abs(suggestion.amount))}
                      </span>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); acceptSuggestionMutation.mutate(suggestion.id); }}
                        disabled={acceptSuggestionMutation.isPending}
                        title="Als Vertrag übernehmen"
                        data-testid={`button-accept-suggestion-${suggestion.id}`}
                      >
                        <Check className="w-4 h-4 text-green-500" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); dismissSuggestionMutation.mutate(suggestion.id); }}
                        disabled={dismissSuggestionMutation.isPending}
                        title="Ablehnen"
                        data-testid={`button-dismiss-suggestion-${suggestion.id}`}
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Keine Vorschläge vorhanden. Klicken Sie auf "Buchungen analysieren", um wiederkehrende Zahlungen zu erkennen.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-500" />
                  Ausgaben
                </CardTitle>
                <Badge variant="secondary" className="font-mono">
                  {formatCurrency(yearlyExpenseTotal)}/Jahr
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderContractGroup(frequencyLabels.monthly, expenseGroups.monthly, calculateTotal(expenseGroups.monthly))}
              {renderContractGroup(frequencyLabels.quarterly, expenseGroups.quarterly, calculateTotal(expenseGroups.quarterly))}
              {renderContractGroup(frequencyLabels.yearly, expenseGroups.yearly, calculateTotal(expenseGroups.yearly))}
              {allExpenses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Keine Ausgaben-Verträge vorhanden
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  Einnahmen
                </CardTitle>
                <Badge variant="secondary" className="font-mono">
                  {formatCurrency(yearlyIncomeTotal)}/Jahr
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {renderContractGroup(frequencyLabels.monthly, incomeGroups.monthly, calculateTotal(incomeGroups.monthly))}
              {renderContractGroup(frequencyLabels.quarterly, incomeGroups.quarterly, calculateTotal(incomeGroups.quarterly))}
              {renderContractGroup(frequencyLabels.yearly, incomeGroups.yearly, calculateTotal(incomeGroups.yearly))}
              {allIncomes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Keine Einnahmen-Verträge vorhanden
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isTransactionsDialogOpen} onOpenChange={setIsTransactionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Zugehörige Buchungen
            </DialogTitle>
          </DialogHeader>
          {selectedSuggestion && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                  selectedSuggestion.type === "income" ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
                }`}>
                  {selectedSuggestion.type === "income" ? (
                    <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{selectedSuggestion.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {frequencyLabels[selectedSuggestion.frequency as Frequency]} • {selectedSuggestion.sourceTransactionIds?.length || 0} Buchungen
                  </p>
                </div>
              </div>

              <ScrollArea className="h-[400px]">
                {relatedLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : relatedTransactions && relatedTransactions.length > 0 ? (
                  <div className="divide-y">
                    {relatedTransactions.map(tx => (
                      <div 
                        key={tx.id} 
                        className="flex items-center justify-between gap-4 py-3"
                        data-testid={`related-transaction-${tx.id}`}
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="flex-shrink-0 w-20 text-center">
                            <p className="text-sm font-medium">{new Date(tx.date).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}</p>
                            <p className="text-xs text-muted-foreground">{new Date(tx.date).getFullYear()}</p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{tx.counterparty || "Unbekannt"}</p>
                            <p className="text-xs text-muted-foreground truncate">{tx.account}</p>
                          </div>
                        </div>
                        <span className={`font-semibold text-sm whitespace-nowrap tabular-nums ${
                          tx.amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        }`}>
                          {tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Keine Buchungen gefunden
                  </p>
                )}
              </ScrollArea>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsTransactionsDialogOpen(false)}
                >
                  Schließen
                </Button>
                <Button
                  onClick={() => {
                    acceptSuggestionMutation.mutate(selectedSuggestion.id);
                    setIsTransactionsDialogOpen(false);
                  }}
                  disabled={acceptSuggestionMutation.isPending}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Als Vertrag übernehmen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
