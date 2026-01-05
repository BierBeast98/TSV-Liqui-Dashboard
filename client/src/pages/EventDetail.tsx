import { Layout } from "@/components/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Plus, Trash2, ArrowLeft, Loader2, FileDown } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { formatCurrency } from "@/lib/utils";
import type { Event, EventEntry } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    date: "",
    receiptNumber: "",
    bankTransaction: "",
    description: "",
    income: "",
    expense: "",
  });

  const { data: event, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ["/api/events", eventId],
  });

  const { data: entries, isLoading: entriesLoading } = useQuery<EventEntry[]>({
    queryKey: ["/api/events", eventId, "entries"],
  });

  const createMutation = useMutation({
    mutationFn: async (entry: {
      date: string;
      receiptNumber?: string;
      bankTransaction?: string;
      description: string;
      income?: number;
      expense?: number;
    }) => {
      return await apiRequest("POST", `/api/events/${eventId}/entries`, entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setIsDialogOpen(false);
      setNewEntry({ date: "", receiptNumber: "", bankTransaction: "", description: "", income: "", expense: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: number) => {
      return await apiRequest("DELETE", `/api/event-entries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events", eventId, "entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
  });

  const handleCreate = () => {
    if (!newEntry.date || !newEntry.description) return;
    createMutation.mutate({
      date: newEntry.date,
      receiptNumber: newEntry.receiptNumber || undefined,
      bankTransaction: newEntry.bankTransaction || undefined,
      description: newEntry.description,
      income: newEntry.income ? parseFloat(newEntry.income) : 0,
      expense: newEntry.expense ? parseFloat(newEntry.expense) : 0,
    });
  };

  const totalIncome = entries?.reduce((sum, e) => sum + (e.income || 0), 0) || 0;
  const totalExpenses = entries?.reduce((sum, e) => sum + (e.expense || 0), 0) || 0;
  const result = totalIncome - totalExpenses;

  if (eventLoading || entriesLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold mb-2">Veranstaltung nicht gefunden</h2>
          <Link href="/events">
            <Button variant="outline">Zuruck zur Ubersicht</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link href="/events">
              <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Zuruck
              </Button>
            </Link>
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground">
              Abrechnung "{event.name}"
            </h2>
            <p className="text-muted-foreground mt-1">
              {format(new Date(event.date), "dd. MMMM yyyy", { locale: de })}
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-entry">
                  <Plus className="w-4 h-4 mr-2" />
                  Eintrag hinzufugen
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Neuer Eintrag</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Datum</Label>
                      <Input
                        id="date"
                        type="date"
                        value={newEntry.date}
                        onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                        data-testid="input-entry-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="receiptNumber">Beleg-Nr.</Label>
                      <Input
                        id="receiptNumber"
                        value={newEntry.receiptNumber}
                        onChange={(e) => setNewEntry({ ...newEntry, receiptNumber: e.target.value })}
                        placeholder="z.B. 1, 2, 3..."
                        data-testid="input-entry-receipt"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankTransaction">Bankbuchung</Label>
                    <Input
                      id="bankTransaction"
                      value={newEntry.bankTransaction}
                      onChange={(e) => setNewEntry({ ...newEntry, bankTransaction: e.target.value })}
                      placeholder="z.B. Sparkasse Mittelfranken-Sud"
                      data-testid="input-entry-bank"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Grund / Beschreibung</Label>
                    <Input
                      id="description"
                      value={newEntry.description}
                      onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                      placeholder="z.B. Gluhweinverkauf"
                      data-testid="input-entry-description"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="income">Einnahmen</Label>
                      <Input
                        id="income"
                        type="number"
                        step="0.01"
                        min="0"
                        value={newEntry.income}
                        onChange={(e) => setNewEntry({ ...newEntry, income: e.target.value })}
                        placeholder="0.00"
                        data-testid="input-entry-income"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expense">Ausgaben</Label>
                      <Input
                        id="expense"
                        type="number"
                        step="0.01"
                        min="0"
                        value={newEntry.expense}
                        onChange={(e) => setNewEntry({ ...newEntry, expense: e.target.value })}
                        placeholder="0.00"
                        data-testid="input-entry-expense"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending || !newEntry.date || !newEntry.description}
                    className="w-full"
                    data-testid="button-submit-entry"
                  >
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Hinzufugen
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Buchungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Datum</TableHead>
                    <TableHead className="w-[60px]">Beleg</TableHead>
                    <TableHead>Bankbuchung</TableHead>
                    <TableHead>Grund</TableHead>
                    <TableHead className="text-right w-[120px]">Einnahmen</TableHead>
                    <TableHead className="text-right w-[120px]">Ausgaben</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Noch keine Eintrage vorhanden. Fugen Sie den ersten Eintrag hinzu.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries?.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-entry-${entry.id}`}>
                        <TableCell className="font-medium">
                          {format(new Date(entry.date), "dd.MM.yy")}
                        </TableCell>
                        <TableCell>{entry.receiptNumber || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{entry.bankTransaction || "-"}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="text-right">
                          {entry.income && entry.income > 0 ? (
                            <span className="text-emerald-600 font-medium">{formatCurrency(entry.income)}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.expense && entry.expense > 0 ? (
                            <span className="text-red-600 font-medium">{formatCurrency(entry.expense)}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(entry.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-entry-${entry.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {entries && entries.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={4} className="font-semibold">Gesamt</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">
                        {formatCurrency(totalIncome)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        {formatCurrency(totalExpenses)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                    <TableRow className="bg-muted">
                      <TableCell colSpan={4} className="font-bold text-lg">Ergebnis</TableCell>
                      <TableCell colSpan={2} className={`text-right font-bold text-lg ${result >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {formatCurrency(result)}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
