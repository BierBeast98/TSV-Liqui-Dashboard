import { Layout } from "@/components/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowRight, Loader2, PartyPopper } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/utils";
import type { EventWithTotals } from "@shared/schema";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function Events() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: "", date: "", description: "" });

  const { data: events, isLoading } = useQuery<EventWithTotals[]>({
    queryKey: ["/api/events"],
  });

  const createMutation = useMutation({
    mutationFn: async (event: { name: string; date: string; description?: string }) => {
      return await apiRequest("POST", "/api/events", event);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setIsDialogOpen(false);
      setNewEvent({ name: "", date: "", description: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
  });

  const handleCreate = () => {
    if (!newEvent.name || !newEvent.date) return;
    createMutation.mutate(newEvent);
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold font-display tracking-tight text-foreground">Veranstaltungen</h2>
            <p className="text-muted-foreground mt-1">Einnahmen und Ausgaben bei Festen und Events tracken</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-event">
                <Plus className="w-4 h-4 mr-2" />
                Neue Veranstaltung
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neue Veranstaltung erstellen</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newEvent.name}
                    onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                    placeholder="z.B. Weihnachtsfeier 2025"
                    data-testid="input-event-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    type="date"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    data-testid="input-event-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Beschreibung (optional)</Label>
                  <Textarea
                    id="description"
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    placeholder="Weitere Details zur Veranstaltung..."
                    data-testid="input-event-description"
                  />
                </div>
                <Button 
                  onClick={handleCreate} 
                  disabled={createMutation.isPending || !newEvent.name || !newEvent.date}
                  className="w-full"
                  data-testid="button-submit-event"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Erstellen
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {events?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <PartyPopper className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Veranstaltungen</h3>
              <p className="text-muted-foreground text-center mb-4">
                Erstelle deine erste Veranstaltung, um Einnahmen und Ausgaben zu tracken.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-first-event">
                <Plus className="w-4 h-4 mr-2" />
                Erste Veranstaltung erstellen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {events?.map((event) => (
              <Card key={event.id} className="group" data-testid={`card-event-${event.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      <CardDescription>
                        {format(new Date(event.date), "dd. MMMM yyyy", { locale: de })}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(event.id)}
                      disabled={deleteMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-delete-event-${event.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {event.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Einnahmen</p>
                      <p className="font-semibold text-emerald-600">{formatCurrency(event.totalIncome)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Ausgaben</p>
                      <p className="font-semibold text-red-600">{formatCurrency(event.totalExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Ergebnis</p>
                      <p className={`font-semibold ${event.result >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {formatCurrency(event.result)}
                      </p>
                    </div>
                  </div>
                  <Link href={`/events/${event.id}`}>
                    <Button variant="outline" className="w-full" data-testid={`button-view-event-${event.id}`}>
                      Details anzeigen
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
