import { Layout } from "@/components/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, TrendingUp, TrendingDown, FileText, Save, Edit2, ChevronRight, Upload, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

interface FiscalAreaSummary {
  name: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  categories?: { name: string; amount: number; type: string }[];
}

interface FiscalAreaReport {
  year: number;
  source: 'pdf' | 'transactions' | 'none';
  sourceFileName?: string;
  uploadedAt?: string;
  areas: FiscalAreaSummary[];
  totalIncome: number;
  totalExpenses: number;
  totalNet: number;
}

interface EuerFormData {
  sourceFileName: string;
  ideellIncome: number;
  ideellExpenses: number;
  vermoegenIncome: number;
  vermoegenExpenses: number;
  zweckbetriebIncome: number;
  zweckbetriebExpenses: number;
  wirtschaftlichIncome: number;
  wirtschaftlichExpenses: number;
}

interface EuerLineItem {
  id: number;
  fiscalArea: string;
  type: string;
  accountNumber: string;
  description: string;
  amount: number;
}

export default function EuerReport() {
  const [year, setYear] = useState<number>(2024);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedArea, setSelectedArea] = useState<FiscalAreaSummary | null>(null);
  const { toast } = useToast();

  const { data: report, isLoading } = useQuery<FiscalAreaReport>({
    queryKey: ['/api/report/euer', year],
    queryFn: async () => {
      const res = await fetch(`/api/report/euer?year=${year}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch report');
      return res.json();
    }
  });

  const { data: lineItems, isLoading: isLoadingItems } = useQuery<EuerLineItem[]>({
    queryKey: ['/api/euer-reports', year, 'items', selectedArea?.name],
    queryFn: async () => {
      const res = await fetch(`/api/euer-reports/${year}/items?fiscalArea=${selectedArea?.name}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedArea
  });

  const [formData, setFormData] = useState<EuerFormData>({
    sourceFileName: '',
    ideellIncome: 0,
    ideellExpenses: 0,
    vermoegenIncome: 0,
    vermoegenExpenses: 0,
    zweckbetriebIncome: 0,
    zweckbetriebExpenses: 0,
    wirtschaftlichIncome: 0,
    wirtschaftlichExpenses: 0,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: EuerFormData) => {
      return apiRequest('PUT', `/api/euer-reports/${year}`, data);
    },
    onSuccess: () => {
      toast({ title: "Gespeichert", description: "EÜR-Daten wurden aktualisiert." });
      queryClient.invalidateQueries({ queryKey: ['/api/report/euer', year] });
      setIsEditing(false);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Speichern fehlgeschlagen.", variant: "destructive" });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('pdf', file);
      const res = await fetch(`/api/euer-reports/${year}/upload-pdf`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Upload fehlgeschlagen');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "PDF hochgeladen", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/report/euer', year] });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({ title: "Fehler", description: "Nur PDF-Dateien erlaubt", variant: "destructive" });
        return;
      }
      uploadMutation.mutate(file);
    }
  };

  const startEditing = () => {
    if (report && report.source === 'pdf') {
      const ideell = report.areas.find(a => a.name === 'ideell');
      const vermoegen = report.areas.find(a => a.name === 'vermoegensverwaltung');
      const zweck = report.areas.find(a => a.name === 'zweckbetrieb');
      const wirtschaft = report.areas.find(a => a.name === 'wirtschaftlich');
      
      setFormData({
        sourceFileName: report.sourceFileName || '',
        ideellIncome: ideell?.income || 0,
        ideellExpenses: ideell?.expenses || 0,
        vermoegenIncome: vermoegen?.income || 0,
        vermoegenExpenses: vermoegen?.expenses || 0,
        zweckbetriebIncome: zweck?.income || 0,
        zweckbetriebExpenses: zweck?.expenses || 0,
        wirtschaftlichIncome: wirtschaft?.income || 0,
        wirtschaftlichExpenses: wirtschaft?.expenses || 0,
      });
    }
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" data-testid="loader-euer" />
        </div>
      </Layout>
    );
  }

  const hasData = (report?.source === 'pdf' || report?.source === 'transactions') && report.areas.length > 0;
  const isPdfData = report?.source === 'pdf';
  const totalNet = (report?.totalIncome || 0) - (report?.totalExpenses || 0);

  const chartData = report?.areas.map(area => ({
    name: area.label.split('.')[0] + '.',
    fullName: area.label,
    income: area.income,
    expenses: area.expenses,
    net: area.net
  })) || [];

  if (isEditing) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight" data-testid="text-euer-title">
                EÜR-Daten erfassen
              </h2>
              <p className="text-muted-foreground mt-1">
                Trage die Werte aus deinem offiziellen PDF-Bericht ein
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel">
                Abbrechen
              </Button>
              <Button 
                onClick={() => saveMutation.mutate(formData)} 
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Speichern
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Jahr {year}</CardTitle>
              <CardDescription>Werte aus dem offiziellen EÜR-PDF übertragen</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="sourceFile">Quelldatei (optional)</Label>
                <Input 
                  id="sourceFile"
                  placeholder="z.B. 2024_Einnahmen-Überschuss.pdf"
                  value={formData.sourceFileName}
                  onChange={(e) => setFormData({...formData, sourceFileName: e.target.value})}
                  data-testid="input-source-file"
                />
              </div>

              <div className="grid gap-6">
                <div className="p-4 rounded-lg border bg-muted/30">
                  <h3 className="font-semibold mb-3">A. Ideeller Tätigkeitsbereich</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="ideellIncome">Einnahmen</Label>
                      <Input 
                        id="ideellIncome"
                        type="number"
                        step="0.01"
                        value={formData.ideellIncome}
                        onChange={(e) => setFormData({...formData, ideellIncome: parseFloat(e.target.value) || 0})}
                        data-testid="input-ideell-income"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ideellExpenses">Ausgaben</Label>
                      <Input 
                        id="ideellExpenses"
                        type="number"
                        step="0.01"
                        value={formData.ideellExpenses}
                        onChange={(e) => setFormData({...formData, ideellExpenses: parseFloat(e.target.value) || 0})}
                        data-testid="input-ideell-expenses"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-muted/30">
                  <h3 className="font-semibold mb-3">B. Vermögensverwaltung</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="vermoegenIncome">Einnahmen</Label>
                      <Input 
                        id="vermoegenIncome"
                        type="number"
                        step="0.01"
                        value={formData.vermoegenIncome}
                        onChange={(e) => setFormData({...formData, vermoegenIncome: parseFloat(e.target.value) || 0})}
                        data-testid="input-vermoegen-income"
                      />
                    </div>
                    <div>
                      <Label htmlFor="vermoegenExpenses">Ausgaben</Label>
                      <Input 
                        id="vermoegenExpenses"
                        type="number"
                        step="0.01"
                        value={formData.vermoegenExpenses}
                        onChange={(e) => setFormData({...formData, vermoegenExpenses: parseFloat(e.target.value) || 0})}
                        data-testid="input-vermoegen-expenses"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-muted/30">
                  <h3 className="font-semibold mb-3">C. Zweckbetriebe</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="zweckbetriebIncome">Einnahmen</Label>
                      <Input 
                        id="zweckbetriebIncome"
                        type="number"
                        step="0.01"
                        value={formData.zweckbetriebIncome}
                        onChange={(e) => setFormData({...formData, zweckbetriebIncome: parseFloat(e.target.value) || 0})}
                        data-testid="input-zweckbetrieb-income"
                      />
                    </div>
                    <div>
                      <Label htmlFor="zweckbetriebExpenses">Ausgaben</Label>
                      <Input 
                        id="zweckbetriebExpenses"
                        type="number"
                        step="0.01"
                        value={formData.zweckbetriebExpenses}
                        onChange={(e) => setFormData({...formData, zweckbetriebExpenses: parseFloat(e.target.value) || 0})}
                        data-testid="input-zweckbetrieb-expenses"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-muted/30">
                  <h3 className="font-semibold mb-3">D. Wirtschaftlicher Geschäftsbetrieb</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="wirtschaftlichIncome">Einnahmen</Label>
                      <Input 
                        id="wirtschaftlichIncome"
                        type="number"
                        step="0.01"
                        value={formData.wirtschaftlichIncome}
                        onChange={(e) => setFormData({...formData, wirtschaftlichIncome: parseFloat(e.target.value) || 0})}
                        data-testid="input-wirtschaftlich-income"
                      />
                    </div>
                    <div>
                      <Label htmlFor="wirtschaftlichExpenses">Ausgaben</Label>
                      <Input 
                        id="wirtschaftlichExpenses"
                        type="number"
                        step="0.01"
                        value={formData.wirtschaftlichExpenses}
                        onChange={(e) => setFormData({...formData, wirtschaftlichExpenses: parseFloat(e.target.value) || 0})}
                        data-testid="input-wirtschaftlich-expenses"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-euer-title">
              Einnahmen-Überschussrechnung
            </h2>
            <p className="text-muted-foreground mt-1">
              Zusammenfassung nach den 4 Tätigkeitsbereichen gem. EÜR
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px]" data-testid="select-year">
                <SelectValue placeholder="Jahr" />
              </SelectTrigger>
              <SelectContent>
                {[2022, 2023, 2024, 2025].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                data-testid="input-pdf-upload"
                disabled={uploadMutation.isPending}
              />
              <Button variant="outline" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                PDF hochladen
              </Button>
            </div>
            <Button variant="outline" onClick={startEditing} data-testid="button-edit">
              <Edit2 className="w-4 h-4 mr-2" />
              Bearbeiten
            </Button>
          </div>
        </div>

        {!hasData ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Keine Daten für {year}</h3>
              <p className="text-muted-foreground mb-4">
                Klicke auf "Bearbeiten" um die Werte aus deinem offiziellen EÜR-PDF einzutragen.
              </p>
              <Button onClick={startEditing} data-testid="button-add-data">
                Daten erfassen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {isPdfData ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <FileText className="w-4 h-4" />
                <span>Quelle: {report?.sourceFileName || 'Manuell erfasst'}</span>
                {report?.uploadedAt && (
                  <span className="text-xs">
                    (erfasst am {new Date(report.uploadedAt).toLocaleDateString('de-DE')})
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/api/euer-reports/${year}/pdf`, '_blank')}
                  className="text-xs"
                  data-testid="button-view-pdf"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  PDF anzeigen
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <FileText className="w-4 h-4" />
                <span>Hinweis: Diese Daten basieren auf den Banktransaktionen. Klicke auf "Bearbeiten" um die offiziellen PDF-Werte einzutragen.</span>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Übersicht nach Tätigkeitsbereichen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                      <XAxis 
                        type="number"
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(value) => formatCurrency(value)}
                      />
                      <YAxis 
                        type="category"
                        dataKey="name" 
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                      />
                      <Bar dataKey="income" name="Einnahmen" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="expenses" name="Ausgaben" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {report?.areas.map((area) => (
                <Card 
                  key={area.name} 
                  className={`cursor-pointer transition-colors ${isPdfData ? 'hover-elevate' : ''}`}
                  onClick={() => isPdfData && setSelectedArea(area)}
                  data-testid={`card-area-${area.name}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        {area.label}
                        {isPdfData && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </span>
                      <span className={`text-base font-semibold flex items-center gap-1 ${area.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {area.net >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {formatCurrency(area.net)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                        <div className="text-xs text-muted-foreground mb-1">Einnahmen</div>
                        <div className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid={`text-income-${area.name}`}>
                          {formatCurrency(area.income)}
                        </div>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                        <div className="text-xs text-muted-foreground mb-1">Ausgaben</div>
                        <div className="text-lg font-semibold text-red-700 dark:text-red-400" data-testid={`text-expenses-${area.name}`}>
                          {formatCurrency(area.expenses)}
                        </div>
                      </div>
                    </div>
                    {isPdfData && (
                      <div className="mt-3 text-xs text-muted-foreground text-center">
                        Klicken für Kontendetails
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Gesamteinnahmen</div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-income">
                      {formatCurrency(report?.totalIncome || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Gesamtausgaben</div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-total-expenses">
                      {formatCurrency(report?.totalExpenses || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Jahresergebnis</div>
                    <div className={`text-2xl font-bold flex items-center justify-center gap-2 ${totalNet >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} data-testid="text-total-net">
                      {totalNet >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      {formatCurrency(totalNet)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <Dialog open={!!selectedArea} onOpenChange={(open) => !open && setSelectedArea(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedArea?.label}</DialogTitle>
              <DialogDescription>
                Detaillierte Kontenaufstellung aus dem EÜR-Bericht
              </DialogDescription>
            </DialogHeader>
            
            {isLoadingItems ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !lineItems || lineItems.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Keine Detaildaten vorhanden
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Einnahmen
                  </h4>
                  <div className="space-y-1">
                    {lineItems.filter(i => i.type === 'income').map((item) => (
                      <div 
                        key={item.id} 
                        className="flex justify-between items-center py-2 px-3 rounded-md bg-green-50 dark:bg-green-900/20"
                        data-testid={`line-item-${item.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-muted-foreground w-12">
                            {item.accountNumber}
                          </span>
                          <span className="text-sm">{item.description}</span>
                        </div>
                        <span className="font-medium text-green-700 dark:text-green-400">
                          {formatCurrency(Number(item.amount))}
                        </span>
                      </div>
                    ))}
                    {lineItems.filter(i => i.type === 'income').length === 0 && (
                      <div className="text-sm text-muted-foreground py-2">Keine Einnahmen</div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" />
                    Ausgaben
                  </h4>
                  <div className="space-y-1">
                    {lineItems.filter(i => i.type === 'expense').map((item) => (
                      <div 
                        key={item.id} 
                        className="flex justify-between items-center py-2 px-3 rounded-md bg-red-50 dark:bg-red-900/20"
                        data-testid={`line-item-${item.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-muted-foreground w-12">
                            {item.accountNumber}
                          </span>
                          <span className="text-sm">{item.description}</span>
                        </div>
                        <span className="font-medium text-red-700 dark:text-red-400">
                          {formatCurrency(Number(item.amount))}
                        </span>
                      </div>
                    ))}
                    {lineItems.filter(i => i.type === 'expense').length === 0 && (
                      <div className="text-sm text-muted-foreground py-2">Keine Ausgaben</div>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t flex justify-between items-center">
                  <span className="font-semibold">Ergebnis</span>
                  <span className={`text-lg font-bold ${(selectedArea?.net || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(selectedArea?.net || 0)}
                  </span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
