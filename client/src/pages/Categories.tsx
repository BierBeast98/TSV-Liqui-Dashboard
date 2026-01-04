import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/use-categories";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertCategorySchema } from "@shared/routes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Pencil, Trash, Tags } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const categoryFormSchema = insertCategorySchema;
type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export default function Categories() {
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      type: "expense",
      isDefault: false
    }
  });

  const onSubmit = async (data: CategoryFormValues) => {
    try {
      if (editingId) {
        await updateCategory.mutateAsync({ id: editingId, ...data });
        toast({ title: "Updated", description: "Category updated successfully" });
      } else {
        await createCategory.mutateAsync(data);
        toast({ title: "Created", description: "Category created successfully" });
      }
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleEdit = (category: any) => {
    setEditingId(category.id);
    form.reset(category);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this category? Transactions linked to it may lose their categorization.")) {
      try {
        await deleteCategory.mutateAsync(id);
        toast({ title: "Deleted", description: "Category removed" });
      } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    }
  };

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({ name: "", type: "expense", isDefault: false });
    setIsDialogOpen(true);
  }

  return (
    <Layout>
       <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold font-display tracking-tight">Categories</h2>
          <p className="text-muted-foreground mt-1">Organize your transaction types.</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} className="gap-2 rounded-xl shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4" /> Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Category" : "New Category"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Housing, Salary..." {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">Cancel</Button>
                  <Button type="submit" disabled={createCategory.isPending || updateCategory.isPending} className="rounded-xl">
                    Save
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Income Categories */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Income
          </h3>
          {categories?.filter(c => c.type === 'income').map(cat => (
             <CategoryCard key={cat.id} category={cat} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>

        {/* Expense Categories */}
        <div className="space-y-4 md:col-span-2">
           <h3 className="text-lg font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Expenses
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {categories?.filter(c => c.type === 'expense').map(cat => (
               <CategoryCard key={cat.id} category={cat} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function CategoryCard({ category, onEdit, onDelete }: { category: any, onEdit: (c: any) => void, onDelete: (id: number) => void }) {
  return (
    <Card className="rounded-xl border border-border/60 hover:border-primary/50 transition-colors group">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${category.type === 'income' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
            <Tags className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-medium">{category.name}</h4>
            {category.isDefault && <Badge variant="secondary" className="text-[10px] h-4 px-1">Default</Badge>}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(category)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {!category.isDefault && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(category.id)}>
              <Trash className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
