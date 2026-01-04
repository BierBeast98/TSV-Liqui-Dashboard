import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useTransactions, useCreateTransaction, useDeleteTransaction, useUpdateTransaction, useUploadTransactions } from "@/hooks/use-transactions";
import { useCategories } from "@/hooks/use-categories";
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
import { Plus, MoreHorizontal, Pencil, Trash, FileUp, Search, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function Transactions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  
  // Filters
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  
  const { data: transactions, isLoading } = useTransactions({ 
    year, 
    categoryId: categoryId !== "all" ? Number(categoryId) : undefined,
    search: search || undefined
  });
  
  const { data: categories } = useCategories();
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const deleteTx = useDeleteTransaction();
  const uploadTx = useUploadTransactions();
  const { toast } = useToast();

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
    const formData = new FormData(e.currentTarget);
    try {
      const result = await uploadTx.mutateAsync(formData);
      toast({ 
        title: "Import Complete", 
        description: `Imported ${result.imported} transactions. ${result.duplicates} duplicates skipped.` 
      });
      setIsUploadOpen(false);
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
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
                  <Input 
                    type="file" 
                    name="file" 
                    id="csv-upload"
                    accept=".csv" 
                    required 
                    className="cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" 
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={uploadTx.isPending}>
                    {uploadTx.isPending ? "Importing..." : "Import"}
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
      <div className="flex flex-col md:flex-row gap-4 mb-6 bg-card p-4 rounded-xl border border-border/60 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search transactions..." 
            className="pl-9 rounded-lg border-border/60 bg-background" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[120px] rounded-lg">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[180px] rounded-lg">
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
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading transactions...</TableCell>
              </TableRow>
            ) : transactions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No transactions found. Try adjusting your filters or add a new one.
                </TableCell>
              </TableRow>
            ) : (
              transactions?.map((tx) => (
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
                  <TableCell>
                    {tx.categoryName ? (
                      <Badge variant="outline" className="font-normal bg-background/50">
                        {tx.categoryName}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">Uncategorized</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${tx.categoryType === 'income' ? 'text-emerald-600' : 'text-foreground'}`}>
                    {tx.categoryType === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
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
