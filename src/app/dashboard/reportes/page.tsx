'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2,
  FileText,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Zap,
} from 'lucide-react';
import { getReportes, generarReporte, getReporte, type ReporteItem } from '@/lib/api';

// =====================================================
// HELPERS
// =====================================================

function getPeriodos(): { value: string; label: string }[] {
  const items: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    items.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return items;
}

function getDesarrollos(): string[] {
  const env = process.env.NEXT_PUBLIC_VALID_DESARROLLOS;
  if (env) return env.split(',').map(d => d.trim()).filter(Boolean);
  return ['FUEGO', 'AMURA', 'PUNTO_TIERRA'];
}

const STATUS_CONFIG: Record<ReporteItem['status'], {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ComponentType<{ className?: string }>;
}> = {
  pending:    { label: 'Pendiente',   variant: 'outline',     icon: Clock },
  processing: { label: 'Generando…',  variant: 'secondary',   icon: Loader2 },
  ready:      { label: 'Listo',       variant: 'default',     icon: CheckCircle2 },
  error:      { label: 'Error',       variant: 'destructive', icon: AlertCircle },
};

function StatusBadge({ status }: { status: ReporteItem['status'] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 text-xs">
      <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </Badge>
  );
}

function formatPeriodo(periodo: string): string {
  const [year, month] = periodo.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  const label = d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function ReportesPage() {
  const { toast } = useToast();
  const DESARROLLOS = getDesarrollos();
  const PERIODOS = getPeriodos();

  const [desarrollo, setDesarrollo] = useState(DESARROLLOS[0] ?? '');
  const [periodo, setPeriodo] = useState(PERIODOS[0]?.value ?? '');
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pollingId, setPollingId] = useState<number | null>(null);

  const cargarReportes = useCallback(async () => {
    if (!desarrollo) return;
    setLoading(true);
    try {
      const data = await getReportes(desarrollo);
      setReportes(data);
    } catch (err) {
      toast({
        title: 'Error cargando reportes',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [desarrollo, toast]);

  useEffect(() => {
    cargarReportes();
  }, [cargarReportes]);

  // Polling para reporte en processing
  useEffect(() => {
    if (pollingId === null) return;
    const interval = setInterval(async () => {
      try {
        const reporte = await getReporte(pollingId);
        if (reporte.status === 'ready' || reporte.status === 'error') {
          setPollingId(null);
          setGenerating(false);
          cargarReportes();
          if (reporte.status === 'ready') {
            toast({ title: 'Reporte listo', description: `Reporte ${reporte.periodo} generado exitosamente.` });
          } else {
            toast({
              title: 'Error al generar reporte',
              description: reporte.error_message ?? 'Error desconocido',
              variant: 'destructive',
            });
          }
        }
      } catch {
        // No interrumpir polling por error de red
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [pollingId, cargarReportes, toast]);

  const handleGenerar = async () => {
    if (!desarrollo || !periodo) return;
    setGenerating(true);
    try {
      const result = await generarReporte(desarrollo, periodo);
      toast({ title: 'Generando reporte…', description: `Reporte ${periodo} en proceso (ID: ${result.reporte_id})` });
      setPollingId(result.reporte_id);
      cargarReportes();
    } catch (err) {
      setGenerating(false);
      toast({
        title: 'Error al iniciar generación',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const reporteExistente = reportes.find(r => r.periodo === periodo);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes Canva</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Genera presentaciones automáticas de ventas desde Zoho CRM
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={cargarReportes} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Generador */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Generar nuevo reporte
          </CardTitle>
          <CardDescription>
            Selecciona el desarrollo y período para generar la presentación en Canva
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={desarrollo} onValueChange={setDesarrollo}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Desarrollo" />
              </SelectTrigger>
              <SelectContent>
                {DESARROLLOS.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleGenerar}
              disabled={generating || !desarrollo || !periodo}
              className="sm:w-auto"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando…</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />Generar</>
              )}
            </Button>
          </div>

          {/* Info del reporte existente para ese período */}
          {reporteExistente && (
            <div className="mt-4 p-3 rounded-lg bg-muted flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={reporteExistente.status} />
                <span className="text-sm text-muted-foreground">
                  Ya existe un reporte para {formatPeriodo(periodo)}
                </span>
              </div>
              {reporteExistente.canva_export_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={reporteExistente.canva_export_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-1" />
                    Descargar
                  </a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historial */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Historial — {desarrollo}
          </CardTitle>
          <CardDescription>
            {reportes.length} reporte{reportes.length !== 1 ? 's' : ''} generado{reportes.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : reportes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <FileText className="h-10 w-10 opacity-30" />
              <p className="text-sm">Aún no hay reportes para {desarrollo}</p>
            </div>
          ) : (
            <div className="divide-y">
              {reportes.map(r => (
                <div key={r.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-sm">{formatPeriodo(r.periodo)}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.error_message && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {r.error_message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {r.generated_at
                        ? `Generado el ${new Date(r.generated_at).toLocaleString('es-MX')}`
                        : `Creado el ${new Date(r.created_at).toLocaleString('es-MX')}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status === 'processing' && (
                      <span className="text-xs text-muted-foreground animate-pulse">En proceso…</span>
                    )}
                    {r.canva_export_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={r.canva_export_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-1" />
                          PDF
                        </a>
                      </Button>
                    )}
                    {r.canva_design_id && (
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={`https://www.canva.com/design/${r.canva_design_id}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir en Canva
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
