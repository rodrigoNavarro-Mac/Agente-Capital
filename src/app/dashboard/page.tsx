'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, MessageSquare, Activity, Database } from 'lucide-react';
import { checkHealth, getDashboardStats, type DashboardStats } from '@/lib/api';

export default function DashboardPage() {
  const [lmStudioStatus, setLmStudioStatus] = useState<string>('checking');
  const [openAIStatus, setOpenAIStatus] = useState<string>('checking');
  const [currentProvider, setCurrentProvider] = useState<string>('lmstudio');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cargar estado de proveedores LLM
    checkHealth()
      .then((health) => {
        setLmStudioStatus(health.lmStudio || 'unavailable');
        setOpenAIStatus(health.openai || 'unavailable');
        setCurrentProvider(health.current || 'lmstudio');
      })
      .catch(() => {
        setLmStudioStatus('unavailable');
        setOpenAIStatus('unavailable');
      });

    // Cargar estadísticas del dashboard
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      setError('Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8">
      {/* Header */}
      <div className="pl-0 sm:pl-4">
        <h1 className="text-2xl sm:text-3xl font-bold navy-text">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Bienvenido al Agente de IA de Capital Plus
        </p>
        {error && (
          <div className="mt-3 sm:mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-xs sm:text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Proveedor LLM</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={currentProvider === 'openai' ? (openAIStatus === 'available' ? 'default' : 'destructive') : (lmStudioStatus === 'available' ? 'default' : 'destructive')}>
                {currentProvider === 'openai' ? 'OpenAI' : 'LM Studio'}
              </Badge>
              {currentProvider === 'openai' ? (
                <Badge variant={openAIStatus === 'available' ? 'default' : 'destructive'} className="text-xs">
                  {openAIStatus === 'available' ? '✓' : '✗'}
                </Badge>
              ) : (
                <Badge variant={lmStudioStatus === 'available' ? 'default' : 'destructive'} className="text-xs">
                  {lmStudioStatus === 'available' ? '✓' : '✗'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {currentProvider === 'openai' ? 'OpenAI API' : 'Servidor LLM Local'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documentos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : error ? '-' : stats?.totalDocuments.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Documentos procesados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Consultas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : error ? '-' : stats?.totalQueriesThisMonth.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Consultas este mes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tiempo de Respuesta</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : error ? '-' : stats?.averageResponseTime ? `${stats.averageResponseTime}s` : '0s'}
            </div>
            <p className="text-xs text-muted-foreground">
              Tiempo promedio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
            <CardDescription>
              Accede a las funciones principales
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/dashboard/upload"
              className="block rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5" />
                <div>
                  <h3 className="font-semibold">Subir Documento</h3>
                  <p className="text-sm text-muted-foreground">
                    Procesar nuevos documentos
                  </p>
                </div>
              </div>
            </a>
            <a
              href="/dashboard/agent"
              className="block rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5" />
                <div>
                  <h3 className="font-semibold">Consultar Agente</h3>
                  <p className="text-sm text-muted-foreground">
                    Hacer preguntas al agente
                  </p>
                </div>
              </div>
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Información del Sistema</CardTitle>
            <CardDescription>
              Estado y configuración actual
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">Modelo LLM</span>
              <Badge variant="outline">llama-3.2-3B</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Vector DB</span>
              <Badge variant="outline">Pinecone</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Database</span>
              <Badge variant="outline">PostgreSQL</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Embedding</span>
              <Badge variant="outline">llama-text-embed-v2</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

