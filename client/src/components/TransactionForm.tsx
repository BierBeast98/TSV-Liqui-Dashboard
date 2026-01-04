import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useCategories } from "@/hooks/use-categories";
import { insertTransactionSchema } from "@shared/schema";
import { Loader2 } from "lucide-react";

const formSchema = insertTransactionSchema.extend({
  amount: z.coerce.number().min(0.01, "Amount must be greater than 0"),
  categoryId: z.coerce.number().optional(),
  date: z.coerce.date(),
  account: z.string().min(1, "Account name is required"),
});

type FormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  defaultValues?: Partial<FormValues>;
  onSubmit: (data: FormValues) => Promise<unknown>;
  isSubmitting: boolean;
  onCancel: () => void;
}

export function TransactionForm({ defaultValues, onSubmit, isSubmitting, onCancel }: TransactionFormProps) {
  const { data: categories } = useCategories();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      amount: 0,
      recurring: false,
      date: new Date(),
      account: "Hauptkonto",
      ...defaultValues,
      // Ensure date is strictly a Date object if coming from string
      date: defaultValues?.date ? new Date(defaultValues.date) : new Date(),
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="Grocery shopping..." {...field} className="rounded-xl" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (€)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0.00" {...field} className="rounded-xl" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input 
                    type="date" 
                    className="rounded-xl"
                    value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                    onChange={(e) => field.onChange(e.target.valueAsDate)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="account"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Konto</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Wähle ein Konto" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Hauptkonto">Hauptkonto</SelectItem>
                  <SelectItem value="Sparkonto">Sparkonto</SelectItem>
                  <SelectItem value="Handkasse">Handkasse</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select 
                onValueChange={(val) => field.onChange(Number(val))} 
                value={field.value ? String(field.value) : undefined}
              >
                <FormControl>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name} ({cat.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="recurring"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value || false}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  Recurring Transaction
                </FormLabel>
                <p className="text-sm text-muted-foreground">
                  Mark this if this transaction repeats monthly.
                </p>
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="rounded-xl">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="rounded-xl min-w-[100px]">
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
