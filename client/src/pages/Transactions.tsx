import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { useTransactions, useCreateTransaction, useDeleteTransaction, useUpdateTransaction, useUploadTransactions, useAutoCategorize } from "@/hooks/use-transactions";
import { useCategories } from "@/hooks/use-categories";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { TransactionForm } from "@/components/TransactionForm";
import { Plus, MoreHorizontal, Pencil, Trash, FileUp, Search, Filter, Sparkles, ArrowUpDown, ArrowUp, ArrowDown, Tags, X, FileText, CalendarDays } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { MultiSelect } from "@/components/MultiSelect";

export default function Transactions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  
  // Contract creation dialog state
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false);
  const [contractTx, setContractTx] = useState<any>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<string>("");
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  
  // Multi-select filter states - load from localStorage for persistence
  // Default to current year if no years selected (maintain backwards compatibility)
  const currentYear = new Date().getFullYear();
  const [selectedYears, setSelectedYears] = useState<string[]>(() => {
    const saved = localStorage.getItem('txFilter_years');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : [String(currentYear)];
      } catch {
        return [String(currentYear)];
      }
    }
    return [String(currentYear)];
  });
  
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('txFilter_categories');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(() => {
    const saved = localStorage.getItem('txFilter_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('txFilter_years', JSON.stringify(selectedYears));
  }, [selectedYears]);
  
  useEffect(() => {
    localStorage.setItem('txFilter_categories', JSON.stringify(selectedCategories));
  }, [selectedCategories]);
  
  useEffect(() => {
    localStorage.setItem('txFilter_accounts', JSON.stringify(selectedAccounts));
  }, [selectedAccounts]);
  
  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  const { data: accounts } = useQuery<any[]>({ queryKey: ["/api/accounts"] });

  // Convert selected string arrays to number arrays for API
  const yearsAsNumbers = selectedYears.length > 0 ? selectedYears.map(Number) : undefined;
  const categoriesAsNumbers = selectedCategories.length > 0 ? selectedCategories.map(Number) : undefined;
  const accountsAsNumbers = selectedAccounts.length > 0 ? selectedAccounts.map(Number) : undefined;

  const { data: transactions, isLoading } = useTransactions({ 
    years: yearsAsNumbers,
    categoryIds: categoriesAsNumbers,
    accountIds: accountsAsNumbers,
    search: search || undefined,
    minAmount: minAmount ? Number(minAmount) : undefined,
    maxAmount: maxAmount ? Number(maxAmount) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const resetFilters = () => {
    // Reset to current year (not empty) to maintain backwards compatibility
    setSelectedYears([String(currentYear)]);
    setSelectedCategories([]);
    setSelectedAccounts([]);
    setSearch("");
    setMinAmount("");
    setMaxAmount("");
    setStartDate("");
    setEndDate("");
    // Clear persisted filters, reset years to current year
    localStorage.setItem('txFilter_years', JSON.stringify([String(currentYear)]));
    localStorage.setItem('txFilter_categories', '[]');
    localStorage.setItem('txFilter_accounts', '[]');
  };

  // Sorting Logic
  const sortedTransactions = [...(transactions || [])].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Special handling for categoryName
    if (sortConfig.key === 'category') {
      aValue = a.categoryName || '';
      bValue = b.categoryName || '';
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };
  
  const { data: categories } = useCategories();
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const uploadTx = useUploadTransactions();
  const autoCat = useAutoCategorize();
  const { toast } = useToast();

  // Related transactions query for contract creation
  const { data: relatedData, isLoading: isLoadingRelated } = useQuery<{
    transaction: any;
    relatedTransactions: any[];
    detectedFrequency: "monthly" | "quarterly" | "yearly" | null;
    intervals: { from: string; to: string; days: number }[];
  }>({
    queryKey: ["/api/transactions", contractTx?.id, "related"],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${contractTx.id}/related`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
    enabled: !!contractTx?.id && isContractDialogOpen,
  });

  // Set detected frequency when data loads
  useEffect(() => {
    if (relatedData?.detectedFrequency && !selectedFrequency) {
      setSelectedFrequency(relatedData.detectedFrequency);
    }
  }, [relatedData?.detectedFrequency]);

  // Create contract mutation with transaction linking
  const createContractMutation = useMutation({
    mutationFn: async (data: { contract: any; sourceTransactionId: number }) => {
      // Create the contract first
      const res = await apiRequest("POST", "/api/contracts", data.contract);
      const newContract = await res.json();
      
      // Link the source transaction to this contract
      await apiRequest("PATCH", `/api/transactions/${data.sourceTransactionId}`, {
        contractId: newContract.id
      });
      
      return newContract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setIsContractDialogOpen(false);
      setContractTx(null);
      setSelectedFrequency("");
      toast({ 
        title: "Vertrag erstellt", 
        description: "Der Vertrag wurde erfolgreich angelegt und mit der Buchung verknüpft." 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  const handleCreateContract = () => {
    if (!contractTx || !selectedFrequency) return;
    
    const contractData = {
      name: contractTx.counterparty || contractTx.description?.substring(0, 50) || "Neuer Vertrag",
      description: contractTx.description,
      amount: Math.abs(contractTx.amount),
      frequency: selectedFrequency,
      type: contractTx.amount < 0 ? "expense" : "income",
      categoryId: contractTx.categoryId || null,
      isActive: true,
      startDate: new Date(contractTx.date).toISOString(),
    };
    
    createContractMutation.mutate({ 
      contract: contractData, 
      sourceTransactionId: contractTx.id 
    });
  };

  const openContractDialog = (tx: any) => {
    setContractTx(tx);
    setSelectedFrequency("");
    setIsContractDialogOpen(true);
  };

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, updates }: { ids: number[], updates: { categoryId?: number | null } }) => {
      const res = await apiRequest("PATCH", "/api/transactions/bulk", { ids, updates });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setSelectedIds(new Set());
      setBulkCategoryId("");
      toast({ 
        title: "Sammelbearbeitung erfolgreich", 
        description: `${data.updatedCount} Buchungen wurden aktualisiert.` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  // Clear selection when filters or transactions change
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkCategoryId("");
  }, [selectedYears, selectedCategories, selectedAccounts, search, minAmount, maxAmount, startDate, endDate]);

  // Selection helpers
  const allCurrentIds = useMemo(() => sortedTransactions?.map((tx: any) => tx.id) || [], [sortedTransactions]);
  const allSelected = allCurrentIds.length > 0 && allCurrentIds.every((id: number) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const hasSelection = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allCurrentIds));
    }
  };

  const toggleSelectOne = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setBulkCategoryId("");
  };

  const handleBulkCategoryChange = () => {
    if (!bulkCategoryId || selectedIds.size === 0) return;
    const categoryValue = bulkCategoryId === "none" ? null : Number(bulkCategoryId);
    bulkUpdateMutation.mutate({ 
      ids: Array.from(selectedIds), 
      updates: { categoryId: categoryValue } 
    });
  };

  const handleAutoCategorize = async () => {
    try {
      const result = await autoCat.mutateAsync();
      toast({ 
        title: "Auto-Kategorisierung", 
        description: `${result.updatedCount} Transaktionen wurden automatisch kategorisiert.` 
      });
    } catch (error: any) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!window.confirm("Möchten Sie wirklich ALLE Transaktionen unwiderruflich löschen? Dieser Schritt kann nicht rückgängig gemacht werden.")) {
      return;
    }

    try {
      console.log("UI: Requesting deletion of all transactions");
      const response = await fetch("/api/transactions/all", { 
        method: "DELETE",
        credentials: "include",
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fehler beim Löschen: ${errorText}`);
      }
      
      console.log("UI: Deletion successful, force clearing all caches");
      
      // Use queryClient from props if available or global one
      queryClient.clear();
      
      toast({ title: "Gelöscht", description: "Alle Transaktionen wurden erfolgreich entfernt." });
      
      // Delay reload to let toast show
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      console.error("UI: Error deleting transactions:", error);
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  };

  const handleCreate = async (data: any) => {
    try {
      await createTx.mutateAsync(data);
      toast({ title: "Success", description: "Transaction created successfully" });
      setIsCreateOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdate = async (data: any) => {
    try {
      await updateTx.mutateAsync({ id: selectedTx.id, ...data });
      toast({ title: "Success", description: "Transaction updated successfully" });
      setIsEditOpen(false);
      setSelectedTx(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      try {
        await deleteTx.mutateAsync(id);
        toast({ title: "Deleted", description: "Transaction removed" });
      } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement;
    const files = fileInput?.files;
    
    if (!files || files.length === 0) {
      toast({ title: "Keine Dateien", description: "Bitte wählen Sie mindestens eine CSV-Datei aus.", variant: "destructive" });
      return;
    }
    
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    
    try {
      const result = await uploadTx.mutateAsync(formData);
      const fileCount = files.length;
      toast({ 
        title: "Import abgeschlossen", 
        description: `${fileCount} Datei${fileCount > 1 ? 'en' : ''}: ${result.imported} Buchungen importiert, ${result.duplicates} Duplikate übersprungen.` 
      });
      setIsUploadOpen(false);
    } catch (error: any) {
      toast({ title: "Upload fehlgeschlagen", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="flex flex-col gap-4 mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold font-display tracking-tight">Transaktionen</h2>
            <p className="text-muted-foreground text-sm mt-1">Verwalten Sie Ihre Finanzbewegungen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm"
              className="gap-1 rounded-xl text-primary border-primary/20 hover:bg-primary/5"
              onClick={handleAutoCategorize}
              disabled={autoCat.isPending}
            >
              <Sparkles className={`w-4 h-4 ${autoCat.isPending ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Auto-Kategorie</span>
            </Button>
            <Button 
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 rounded-xl text-destructive border-destructive/20 hover:bg-destructive/5"
              onClick={(e) => handleDeleteAll(e)}
            >
              <Trash className="w-4 h-4" />
              <span className="hidden sm:inline">Alle löschen</span>
            </Button>
            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 rounded-xl">
                  <FileUp className="w-4 h-4" /> <span className="hidden sm:inline">Import</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Transaktionen importieren</DialogTitle>
                <DialogDescription>
                  Laden Sie CSV-Dateien von Ihrer Bank hoch. Duplikate werden automatisch erkannt.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">CSV-Dateien auswählen (mehrere möglich)</label>
                  <Input 
                    type="file" 
                    name="files" 
                    id="csv-upload"
                    accept=".csv" 
                    multiple
                    required 
                    className="cursor-pointer" 
                    data-testid="input-csv-files"
                  />
                  <p className="text-xs text-muted-foreground">Das Konto wird automatisch aus der IBAN in der CSV erkannt.</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>Abbrechen</Button>
                  <Button type="submit" disabled={uploadTx.isPending} data-testid="button-import-csv">
                    {uploadTx.isPending ? "Importiere..." : "Importieren"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1 rounded-xl shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Neu</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg w-[95vw] sm:w-auto">
              <DialogHeader>
                <DialogTitle>Neue Transaktion</DialogTitle>
              </DialogHeader>
              <TransactionForm 
                onSubmit={handleCreate} 
                isSubmitting={createTx.isPending} 
                onCancel={() => setIsCreateOpen(false)} 
              />
            </DialogContent>
          </Dialog>
        </div>
        </div>
      </div>

      {/* Filters - Responsive */}
      <div className="flex flex-col gap-4 mb-6 bg-card p-3 md:p-4 rounded-xl border border-border/60 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Suchen..." 
              className="pl-9 rounded-lg border-border/60 bg-background h-10" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MultiSelect
              name="years"
              options={[2023, 2024, 2025, 2026].map(y => ({ value: String(y), label: String(y) }))}
              selected={selectedYears}
              onChange={setSelectedYears}
              placeholder="Jahr"
              allLabel="Alle Jahre"
            />

            <MultiSelect
              name="categories"
              options={(categories || []).map((cat: any) => ({ value: String(cat.id), label: cat.name }))}
              selected={selectedCategories}
              onChange={setSelectedCategories}
              placeholder="Kategorie"
              allLabel="Alle Kategorien"
            />

            <MultiSelect
              name="accounts"
              options={(accounts || []).map((acc: any) => ({ value: String(acc.id), label: acc.name }))}
              selected={selectedAccounts}
              onChange={setSelectedAccounts}
              placeholder="Konto"
              allLabel="Alle Konten"
            />

            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-lg h-10 flex-1 px-2"
                onClick={() => setShowAdvanced(!showAdvanced)}
                data-testid="button-advanced-filters"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">{showAdvanced ? "Weniger" : "Mehr"}</span>
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="rounded-lg h-10 px-2"
                onClick={resetFilters}
                data-testid="button-reset-filters"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-border/60">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Min Amount (€)</label>
              <Input 
                type="number" 
                placeholder="0.00" 
                className="h-9 rounded-lg"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Max Amount (€)</label>
              <Input 
                type="number" 
                placeholder="1000.00" 
                className="h-9 rounded-lg"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Start Date</label>
              <Input 
                type="date" 
                className="h-9 rounded-lg"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">End Date</label>
              <Input 
                type="date" 
                className="h-9 rounded-lg"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Bar - Responsive */}
      {hasSelection && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 md:p-4 mb-4 bg-primary/5 border border-primary/20 rounded-xl" data-testid="bulk-action-bar">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {selectedIds.size} ausgewählt
            </Badge>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={clearSelection}
              title="Auswahl aufheben"
              data-testid="button-clear-selection"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <Tags className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
              <SelectTrigger className="flex-1 sm:w-[200px]" data-testid="select-bulk-category">
                <SelectValue placeholder="Kategorie wählen..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Kategorie</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleBulkCategoryChange}
              disabled={!bulkCategoryId || bulkUpdateMutation.isPending}
              data-testid="button-apply-bulk-category"
              className="whitespace-nowrap"
            >
              {bulkUpdateMutation.isPending ? "..." : "Anwenden"}
            </Button>
          </div>
        </div>
      )}

      {/* Table - Desktop with horizontal scroll on mobile */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[40px] sticky left-0 bg-muted/50 z-10">
                <Checkbox 
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Alle auswählen"
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead className="w-[100px] cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('date')}>
                <div className="flex items-center text-xs">Datum <SortIcon column="date" /></div>
              </TableHead>
              <TableHead className="min-w-[150px] cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('description')}>
                <div className="flex items-center text-xs">Beschreibung <SortIcon column="description" /></div>
              </TableHead>
              <TableHead className="min-w-[150px] cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('counterparty')}>
                <div className="flex items-center text-xs">Zahlungsbeteiligter <SortIcon column="counterparty" /></div>
              </TableHead>
              <TableHead className="min-w-[100px] cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('account')}>
                <div className="flex items-center text-xs">Konto <SortIcon column="account" /></div>
              </TableHead>
              <TableHead className="min-w-[120px] cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('category')}>
                <div className="flex items-center text-xs">Kategorie <SortIcon column="category" /></div>
              </TableHead>
              <TableHead className="w-[100px] text-right cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('amount')}>
                <div className="flex items-center justify-end text-xs">Betrag <SortIcon column="amount" /></div>
              </TableHead>
              <TableHead className="w-[40px] sticky right-0 bg-muted/50 z-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Transaktionen werden geladen...</TableCell>
              </TableRow>
            ) : sortedTransactions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  Keine Transaktionen gefunden. Passen Sie die Filter an oder wählen Sie ein anderes Jahr.
                </TableCell>
              </TableRow>
            ) : (
              sortedTransactions?.map((tx) => (
                <TableRow 
                  key={tx.id} 
                  className={`group transition-colors ${selectedIds.has(tx.id) ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-muted/30'}`}
                  data-testid={`transaction-row-${tx.id}`}
                >
                  <TableCell onClick={(e) => e.stopPropagation()} className="sticky left-0 bg-card z-10">
                    <Checkbox 
                      checked={selectedIds.has(tx.id)}
                      onCheckedChange={() => toggleSelectOne(tx.id)}
                      aria-label={`Buchung ${tx.id} auswählen`}
                      data-testid={`checkbox-transaction-${tx.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(tx.date), "dd.MM.yy")}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="truncate max-w-[200px]">{tx.description}</span>
                      {tx.contractName && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-primary/50 text-primary shrink-0">
                          <FileText className="w-3 h-3 mr-1" />
                          Vertrag
                        </Badge>
                      )}
                      {tx.recurring && !tx.contractId && (
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">Wiederkehrend</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <span className="truncate max-w-[150px] block">{tx.counterparty || "-"}</span>
                  </TableCell>
                  <TableCell>
                    {tx.accountName ? (
                      <Badge variant="secondary" className="font-normal bg-muted/50 text-xs">
                        {tx.accountName}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal bg-muted/50 text-xs">
                        {tx.account || "Hauptkonto"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {tx.categoryName ? (
                      <Badge variant="outline" className="font-normal bg-background/50 text-xs">
                        {tx.categoryName}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-bold whitespace-nowrap ${tx.amount > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </TableCell>
                  <TableCell className="sticky right-0 bg-card z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Aktionen</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => { setSelectedTx(tx); setIsEditOpen(true); }}>
                          <Pencil className="w-4 h-4 mr-2" /> Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openContractDialog(tx)}>
                          <FileText className="w-4 h-4 mr-2" /> Als Vertrag markieren
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(tx.id)}>
                          <Trash className="w-4 h-4 mr-2" /> Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog - Rendered conditionally to reset form state */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if(!open) setSelectedTx(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transaktion bearbeiten</DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <TransactionForm 
              defaultValues={selectedTx}
              onSubmit={handleUpdate} 
              isSubmitting={updateTx.isPending} 
              onCancel={() => setIsEditOpen(false)} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Contract Creation Dialog */}
      <Dialog open={isContractDialogOpen} onOpenChange={(open) => { 
        setIsContractDialogOpen(open); 
        if(!open) { setContractTx(null); setSelectedFrequency(""); }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Als Vertrag markieren
            </DialogTitle>
            <DialogDescription>
              Erstellen Sie einen wiederkehrenden Vertrag basierend auf dieser Buchung.
            </DialogDescription>
          </DialogHeader>
          
          {contractTx && (
            <div className="space-y-6 flex-1 overflow-hidden flex flex-col">
              {/* Selected Transaction */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <p className="text-sm font-medium text-muted-foreground mb-2">Ausgewählte Buchung</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{contractTx.counterparty || contractTx.description?.substring(0, 40)}</p>
                    <p className="text-sm text-muted-foreground">{format(new Date(contractTx.date), "dd.MM.yyyy")}</p>
                  </div>
                  <p className={`text-lg font-bold ${contractTx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(contractTx.amount)}
                  </p>
                </div>
              </div>

              {/* Related Transactions */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">
                    Weitere Buchungen von {contractTx.counterparty || "diesem Zahlungspartner"}
                  </p>
                  {relatedData?.detectedFrequency && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      <CalendarDays className="w-3 h-3 mr-1" />
                      {relatedData.detectedFrequency === "monthly" ? "Monatlich erkannt" :
                       relatedData.detectedFrequency === "quarterly" ? "Quartalsweise erkannt" :
                       relatedData.detectedFrequency === "yearly" ? "Jährlich erkannt" : ""}
                    </Badge>
                  )}
                </div>
                
                {isLoadingRelated ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    Lade verwandte Buchungen...
                  </div>
                ) : relatedData?.relatedTransactions && relatedData.relatedTransactions.length > 1 ? (
                  <ScrollArea className="flex-1 border rounded-lg">
                    <div className="p-2 space-y-1">
                      {relatedData.relatedTransactions.map((rtx: any, idx: number) => (
                        <div key={rtx.id}>
                          <div className={`flex items-center justify-between p-2 rounded ${rtx.id === contractTx.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground font-mono w-20">
                                {format(new Date(rtx.date), "dd.MM.yyyy")}
                              </span>
                              <span className="text-sm truncate max-w-[200px]">{rtx.description?.substring(0, 40)}</span>
                            </div>
                            <span className={`font-medium ${rtx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(rtx.amount)}
                            </span>
                          </div>
                          {idx < relatedData.relatedTransactions.length - 1 && relatedData.intervals[idx] && (
                            <div className="text-xs text-center text-muted-foreground py-1">
                              <span className="bg-muted px-2 py-0.5 rounded">
                                {relatedData.intervals[idx].days} Tage
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground border rounded-lg">
                    Keine weiteren Buchungen mit demselben Zahlungspartner gefunden.
                  </div>
                )}
              </div>

              <Separator />

              {/* Frequency Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Zahlungsrhythmus</label>
                <Select value={selectedFrequency} onValueChange={setSelectedFrequency}>
                  <SelectTrigger data-testid="select-frequency">
                    <SelectValue placeholder="Rhythmus auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monatlich</SelectItem>
                    <SelectItem value="quarterly">Quartalsweise</SelectItem>
                    <SelectItem value="yearly">Jährlich</SelectItem>
                  </SelectContent>
                </Select>
                {relatedData?.detectedFrequency && selectedFrequency !== relatedData.detectedFrequency && (
                  <p className="text-xs text-muted-foreground">
                    Automatisch erkannt: {relatedData.detectedFrequency === "monthly" ? "Monatlich" :
                                         relatedData.detectedFrequency === "quarterly" ? "Quartalsweise" : "Jährlich"}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsContractDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button 
                  onClick={handleCreateContract}
                  disabled={!selectedFrequency || createContractMutation.isPending}
                  data-testid="button-create-contract"
                >
                  {createContractMutation.isPending ? "Wird erstellt..." : "Vertrag erstellen"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
