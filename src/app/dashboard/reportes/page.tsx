'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2, FileText, Download, RefreshCw, AlertCircle,
  CheckCircle2, Clock, Zap, Link2, Link2Off, Bug, ChevronDown, ChevronUp,
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
  pending:    { label: 'Pendiente',  variant: 'outline',     icon: Clock },
  processing: { label: 'Generando…', variant: 'secondary',   icon: Loader2 },
  ready:      { label: 'Listo',      variant: 'default',     icon: CheckCircle2 },
  error:      { label: 'Error',      variant: 'destructive', icon: AlertCircle },
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

async function fetchCanvaStatus(): Promise<boolean> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch('/api/auth/canva/status', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return false;
  const json = await res.json() as { data: { connected: boolean } };
  return json.data?.connected ?? false;
}

async function fetchCanvaConnectUrl(): Promise<string> {
  const token = localStorage.getItem('accessToken');
  const res = await fetch('/api/auth/canva/connect', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await res.json() as { success: boolean; error?: string; data?: { url: string } };
  if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo obtener URL de Canva');
  return json.data!.url;
}

// =====================================================
// DEBUG CARD
// =====================================================

interface DebugStep {
  step: string;
  ts: string;
  ok: boolean;
  detail?: string;
}

function DebugCard({ reporte }: { reporte: ReporteItem | null }) {
  const [open, setOpen] = useState(true);

  if (!reporte) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Selecciona un reporte de la lista para ver el detalle.</p>
        </CardContent>
      </Card>
    );
  }

  const metadata = reporte.metadata as Record<string, unknown> | null;
  const steps: DebugStep[] = (metadata?.debug_steps as DebugStep[] | undefined) ?? [];

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug — Reporte #{reporte.id}
          </CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={reporte.status} />
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
        <CardDescription className="mt-1">
          {reporte.desarrollo} · {formatPeriodo(reporte.periodo)}
        </CardDescription>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          {/* Info básica */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">ID: </span>
              <span className="font-mono">{reporte.id}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status: </span>
              <span className="font-mono">{reporte.status}</span>
            </div>
            {reporte.canva_design_id && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Design ID: </span>
                <span className="font-mono break-all">{reporte.canva_design_id}</span>
              </div>
            )}
            {reporte.canva_export_url && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Export URL: </span>
                <a
                  href={reporte.canva_export_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-500 underline break-all"
                >
                  {reporte.canva_export_url.substring(0, 80)}…
                </a>
              </div>
            )}
            {reporte.error_message && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Error: </span>
                <span className="font-mono text-destructive break-all">{reporte.error_message}</span>
              </div>
            )}
          </div>

          {/* Pasos de debug */}
          {steps.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pasos</p>
              <div className="rounded-lg border divide-y text-xs font-mono">
                {steps.map((s, i) => (
                  <div key={i} className={`px-3 py-2 flex gap-3 ${s.ok ? '' : 'bg-destructive/5'}`}>
                    <span className={s.ok ? 'text-green-500' : 'text-destructive'}>
                      {s.ok ? '✓' : '✗'}
                    </span>
                    <span className="font-semibold min-w-[120px]">{s.step}</span>
                    <span className="text-muted-foreground text-[10px] mt-0.5">
                      {new Date(s.ts).toLocaleTimeString('es-MX')}
                    </span>
                    {s.detail && (
                      <span className={`break-all ${s.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                        {s.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin pasos de debug registrados.</p>
          )}

          {/* Raw metadata */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Ver metadata completa
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded-lg overflow-auto max-h-48 text-[10px]">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </details>
        </CardContent>
      )}
    </Card>
  );
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function ReportesPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const DESARROLLOS = getDesarrollos();
  const PERIODOS = getPeriodos();

  const [desarrollo, setDesarrollo] = useState(DESARROLLOS[0] ?? '');
  const [periodo, setPeriodo] = useState(PERIODOS[0]?.value ?? '');
  const [reportes, setReportes] = useState<ReporteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pollingId, setPollingId] = useState<number | null>(null);
  const [canvaConnected, setCanvaConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [selectedReporte, setSelectedReporte] = useState<ReporteItem | null>(null);

  // Resultado del callback OAuth
  useEffect(() => {
    const result = searchParams.get('canva');
    if (!result) return;
    if (result === 'success') {
      toast({ title: 'Canva conectado', description: 'La integración está activa.' });
      setCanvaConnected(true);
    } else if (result === 'error') {
      const reason = searchParams.get('reason') ?? 'desconocido';
      const detail = searchParams.get('detail') ?? '';
      toast({
        title: `Error Canva: ${reason}`,
        description: detail || 'Revisa los logs del servidor para más detalle.',
        variant: 'destructive',
      });
    }
  }, [searchParams, toast]);

  useEffect(() => {
    fetchCanvaStatus().then(setCanvaConnected).catch(() => setCanvaConnected(false));
  }, []);

  const cargarReportes = useCallback(async () => {
    if (!desarrollo) return;
    setLoading(true);
    try {
      const data = await getReportes(desarrollo);
      setReportes(data);
      // Actualizar reporte seleccionado sin incluirlo como dependencia
      setSelectedReporte(prev => {
        if (!prev) return prev;
        const updated = data.find(r => r.id === prev.id);
        return updated ?? prev;
      });
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
        setSelectedReporte(reporte);
        if (reporte.status === 'ready' || reporte.status === 'error') {
          setPollingId(null);
          setGenerating(false);
          cargarReportes();
          if (reporte.status === 'ready') {
            toast({ title: 'Reporte listo', description: `ID #${reporte.id} generado.` });
          } else {
            toast({
              title: 'Error generando reporte',
              description: reporte.error_message ?? 'Error desconocido',
              variant: 'destructive',
            });
          }
        }
      } catch {
        // No interrumpir polling
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [pollingId, cargarReportes, toast]);

  const handleConectarCanva = async () => {
    setConnecting(true);
    try {
      const url = await fetchCanvaConnectUrl();
      window.location.href = url;
    } catch (err) {
      setConnecting(false);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo iniciar la conexión',
        variant: 'destructive',
      });
    }
  };

  const handleGenerar = async () => {
    if (!desarrollo || !periodo) return;
    setGenerating(true);
    try {
      const result = await generarReporte(desarrollo, periodo);
      toast({ title: 'Generando reporte…', description: `ID: #${result.reporte_id}` });
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

      {/* Conexión Canva */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {canvaConnected === null ? <Loader2 className="h-4 w-4 animate-spin" />
              : canvaConnected ? <Link2 className="h-4 w-4 text-green-500" />
              : <Link2Off className="h-4 w-4 text-muted-foreground" />}
            Conexión con Canva
          </CardTitle>
        </CardHeader>
        <CardContent>
          {canvaConnected === null ? (
            <p className="text-sm text-muted-foreground">Verificando…</p>
          ) : canvaConnected ? (
            <div className="flex items-center gap-3">
              <Badge variant="default" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Conectado
              </Badge>
              <span className="text-sm text-muted-foreground">
                La cuenta de Canva está autorizada.
              </span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-muted-foreground flex-1">
                Canva no está conectado. Autoriza la app para generar presentaciones.
              </p>
              <Button onClick={handleConectarCanva} disabled={connecting} size="sm">
                {connecting
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Redirigiendo…</>
                  : <><Link2 className="h-4 w-4 mr-2" />Conectar Canva</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generador */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Generar reporte
          </CardTitle>
          <CardDescription>
            Crea una nueva presentación — sin límite de intentos por período
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
              disabled={generating || !desarrollo || !periodo || !canvaConnected}
              title={!canvaConnected ? 'Conecta Canva primero' : undefined}
            >
              {generating
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando…</>
                : <><FileText className="h-4 w-4 mr-2" />Generar</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Historial */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial — {desarrollo}</CardTitle>
            <CardDescription>{reportes.length} intento{reportes.length !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : reportes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <FileText className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sin reportes aún</p>
              </div>
            ) : (
              <div className="divide-y">
                {reportes.map(r => (
                  <div
                    key={r.id}
                    className={`py-3 flex items-center justify-between gap-2 cursor-pointer rounded px-2 -mx-2 transition-colors ${selectedReporte?.id === r.id ? 'bg-muted' : 'hover:bg-muted/50'}`}
                    onClick={() => setSelectedReporte(r)}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">#{r.id}</span>
                        <span className="text-xs text-muted-foreground">{formatPeriodo(r.periodo)}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString('es-MX')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.canva_export_url && (
                        <Button variant="outline" size="sm" asChild onClick={e => e.stopPropagation()}>
                          <a href={r.canva_export_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3 w-3" />
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

        {/* Debug */}
        <DebugCard reporte={selectedReporte} />
      </div>
    </div>
  );
}
