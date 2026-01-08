import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { useTransactions, useCreateTransaction, useDeleteTransaction, useUpdateTransaction, useUploadTransactions, useAutoCategorize } from "@/hooks/use-transactions";
import { useCategories } from "@/hooks/use-categories";
import { useYear } from "@/contexts/YearContext";
import { queryClient } from "@/lib/queryClient";
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
import { TransactionForm } from "@/components/TransactionForm";
import { Plus, MoreHorizontal, Pencil, Trash, FileUp, Search, Filter, Sparkles, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Transactions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  
  // Year from global context (persisted in localStorage)
  const { selectedYear: year, setSelectedYear: setYear } = useYear();
  
  // Other filters - load from localStorage for persistence across navigation
  const [categoryId, setCategoryId] = useState<string>(() => {
    return localStorage.getItem('txFilter_categoryId') || "all";
  });
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [accountId, setAccountId] = useState<string>(() => {
    return localStorage.getItem('txFilter_accountId') || "all";
  });
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('txFilter_categoryId', categoryId);
  }, [categoryId]);
  
  useEffect(() => {
    localStorage.setItem('txFilter_accountId', accountId);
  }, [accountId]);
  
  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  const { data: accounts } = useQuery<any[]>({ queryKey: ["/api/accounts"] });

  const { data: transactions, isLoading } = useTransactions({ 
    year, 
    categoryId: categoryId !== "all" ? Number(categoryId) : undefined,
    accountId: accountId !== "all" ? Number(accountId) : undefined,
    search: search || undefined,
    minAmount: minAmount ? Number(minAmount) : undefined,
    maxAmount: maxAmount ? Number(maxAmount) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  } as any) as any;

  const resetFilters = () => {
    const currentYear = new Date().getFullYear();
    setYear(currentYear);
    setCategoryId("all");
    setAccountFilter("all");
    setAccountId("all");
    setSearch("");
    setMinAmount("");
    setMaxAmount("");
    setStartDate("");
    setEndDate("");
    // Clear persisted filters (year is handled by YearContext)
    localStorage.setItem('txFilter_categoryId', 'all');
    localStorage.setItem('txFilter_accountId', 'all');
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold font-display tracking-tight">Transactions</h2>
          <p className="text-muted-foreground mt-1">Manage and track your financial activity.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2 rounded-xl text-primary border-primary/20 hover:bg-primary/5"
            onClick={handleAutoCategorize}
            disabled={autoCat.isPending}
          >
            <Sparkles className={`w-4 h-4 ${autoCat.isPending ? 'animate-spin' : ''}`} />
            Automatisch kategorisieren
          </Button>
          <Button 
            type="button"
            variant="outline" 
            className="gap-2 rounded-xl text-destructive border-destructive/20 hover:bg-destructive/5"
            onClick={(e) => handleDeleteAll(e)}
          >
            <Trash className="w-4 h-4" />
            Alle löschen
          </Button>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 rounded-xl">
                <FileUp className="w-4 h-4" /> Import CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Transactions</DialogTitle>
                <DialogDescription>Upload a CSV file from your bank. We'll handle duplicate detection automatically.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4 pt-4">
                <div className="grid w-full items-center gap-1.5">
                  <label className="text-sm font-medium">CSV-Dateien auswählen (mehrere möglich)</label>
                  <Input 
                    type="file" 
                    name="files" 
                    id="csv-upload"
                    accept=".csv" 
                    multiple
                    required 
                    className="cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" 
                    data-testid="input-csv-files"
                  />
                  <p className="text-xs text-muted-foreground">Das Konto wird automatisch aus der IBAN in der CSV erkannt.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
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
              <Button className="gap-2 rounded-xl shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4" /> Add Transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Transaction</DialogTitle>
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

      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search transactions..." 
              className="pl-9 rounded-lg border-border/60 bg-background" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px] rounded-lg">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-[160px] rounded-lg">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-[160px] rounded-lg">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Konto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Konten</SelectItem>
                {accounts?.map((acc) => (
                  <SelectItem key={acc.id} value={String(acc.id)}>{acc.name} ({acc.iban})</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-lg gap-2"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Filter className="w-4 h-4" />
              {showAdvanced ? "Hide Advanced" : "Advanced"}
            </Button>

            <Button 
              variant="ghost" 
              size="sm" 
              className="rounded-lg text-muted-foreground hover:text-foreground"
              onClick={resetFilters}
            >
              Reset
            </Button>
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

      {/* Table */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[120px] cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('date')}>
                <div className="flex items-center">Date <SortIcon column="date" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('description')}>
                <div className="flex items-center">Description <SortIcon column="description" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('counterparty')}>
                <div className="flex items-center">Zahlungsbeteiligter <SortIcon column="counterparty" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('account')}>
                <div className="flex items-center">Konto <SortIcon column="account" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('category')}>
                <div className="flex items-center">Category <SortIcon column="category" /></div>
              </TableHead>
              <TableHead className="text-right cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => toggleSort('amount')}>
                <div className="flex items-center justify-end">Amount <SortIcon column="amount" /></div>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Loading transactions...</TableCell>
              </TableRow>
            ) : sortedTransactions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No transactions found. Try adjusting your filters or add a new one.
                </TableCell>
              </TableRow>
            ) : (
              sortedTransactions?.map((tx) => (
                <TableRow key={tx.id} className="group transition-colors hover:bg-muted/30">
                  <TableCell className="font-medium font-mono text-xs text-muted-foreground">
                    {format(new Date(tx.date), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {tx.description}
                    {tx.recurring && (
                      <Badge variant="secondary" className="ml-2 text-[10px] h-5 px-1.5">Recurring</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {tx.counterparty || <span className="italic text-xs">-</span>}
                  </TableCell>
                  <TableCell>
                    {tx.accountName ? (
                      <Badge variant="secondary" className="font-normal bg-muted/50">
                        {tx.accountName}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-normal bg-muted/50">
                        {tx.account || "Hauptkonto"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {tx.categoryName ? (
                      <Badge variant="outline" className="font-normal bg-background/50">
                        {tx.categoryName}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">Uncategorized</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${tx.amount > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => { setSelectedTx(tx); setIsEditOpen(true); }}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(tx.id)}>
                          <Trash className="w-4 h-4 mr-2" /> Delete
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
            <DialogTitle>Edit Transaction</DialogTitle>
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
    </Layout>
  );
}
