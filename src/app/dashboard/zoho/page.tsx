'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, TrendingUp, Users, DollarSign, BarChart3, AlertCircle, Calendar, Database } from 'lucide-react';
import { 
  getZohoLeads, 
  getZohoDeals, 
  getZohoPipelines, 
  getZohoStats,
  triggerZohoSync,
  type ZohoLead,
  type ZohoDeal,
  type ZohoPipeline,
  type ZohoStats
} from '@/lib/api';
import { decodeAccessToken } from '@/lib/auth';
import type { UserRole } from '@/types/documents';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

export default function ZohoCRMPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState('stats');
  
  // Datos
  const [stats, setStats] = useState<ZohoStats | null>(null);
  const [lastMonthStats, setLastMonthStats] = useState<ZohoStats | null>(null);
  const [leads, setLeads] = useState<ZohoLead[]>([]);
  const [deals, setDeals] = useState<ZohoDeal[]>([]);
  const [pipelines, setPipelines] = useState<ZohoPipeline[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [selectedDesarrollo, setSelectedDesarrollo] = useState<string>('all');
  const [showLastMonth, setShowLastMonth] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const { toast } = useToast();

  // Verificar rol del usuario
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = decodeAccessToken(token);
      if (payload) {
        setUserRole(payload.role as UserRole);
      }
    }
  }, []);

  // Obtener lista de desarrollos únicos de los datos
  const availableDevelopments = useMemo(() => {
    const developments = new Set<string>();
    leads.forEach(lead => {
      if (lead.Desarrollo) {
        developments.add(lead.Desarrollo);
      }
    });
    deals.forEach(deal => {
      if (deal.Desarrollo) {
        developments.add(deal.Desarrollo);
      }
    });
    return Array.from(developments).sort();
  }, [leads, deals]);

  // Cargar estadísticas con filtros
  const loadStats = useCallback(async (desarrollo?: string, lastMonth: boolean = false) => {
    setLoadingStats(true);
    try {
      const statsData = await getZohoStats({
        desarrollo: desarrollo === 'all' ? undefined : desarrollo,
        lastMonth,
      });
      if (lastMonth) {
        setLastMonthStats(statsData);
      } else {
        setStats(statsData);
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las estadísticas.',
        variant: 'destructive',
      });
    } finally {
      setLoadingStats(false);
    }
  }, [toast]);

  // Cargar todos los datos
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Cargar otros datos en paralelo
      const [leadsData, dealsData, pipelinesData] = await Promise.all([
        getZohoLeads(1, 200).catch(() => ({ data: [], info: {} })),
        getZohoDeals(1, 200).catch(() => ({ data: [], info: {} })),
        getZohoPipelines().catch(() => ({ data: [] })),
      ]);
      
      setLeads(leadsData.data || []);
      setDeals(dealsData.data || []);
      setPipelines(pipelinesData.data || []);
      
      // Cargar estadísticas después de obtener los datos
      await loadStats(selectedDesarrollo, false);
      await loadStats(selectedDesarrollo, true);
      
    } catch (err) {
      console.error('Error cargando datos de ZOHO:', err);
      setError(err instanceof Error ? err.message : 'Error cargando datos de ZOHO CRM');
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de ZOHO CRM. Verifica la configuración.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, loadStats, selectedDesarrollo]);

  // Recargar estadísticas cuando cambia el filtro (solo si ya se cargaron los datos iniciales)
  useEffect(() => {
    if (!loading && (stats !== null || lastMonthStats !== null)) {
      loadStats(selectedDesarrollo, false);
      loadStats(selectedDesarrollo, true);
    }
  }, [selectedDesarrollo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Verificar permisos
  useEffect(() => {
    if (userRole !== null) {
      const allowedRoles: UserRole[] = ['admin', 'ceo', 'sales_manager'];
      if (!allowedRoles.includes(userRole)) {
        setError('No tienes permisos para acceder a ZOHO CRM. Solo gerentes, CEO y administradores pueden acceder.');
        setLoading(false);
      } else {
        loadData();
      }
    }
  }, [userRole, loadData]);

  // Refrescar datos (sincroniza automáticamente si la BD está vacía)
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Primero intentar cargar datos (esto sincronizará automáticamente si la BD está vacía)
      await loadData();
      
      toast({
        title: '✅ Datos actualizados',
        description: 'Los datos de ZOHO CRM se han actualizado correctamente',
      });
    } catch (error) {
      console.error('Error actualizando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar los datos. Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Sincronizar datos desde Zoho
  const handleSync = async () => {
    if (!userRole || !['admin'].includes(userRole)) {
      toast({
        title: 'Error',
        description: 'Solo los administradores pueden sincronizar datos.',
        variant: 'destructive',
      });
      return;
    }

    setSyncing(true);
    try {
      const result = await triggerZohoSync('full');
      toast({
        title: '✅ Sincronización completada',
        description: `Se sincronizaron ${result.recordsSynced} registros (${result.recordsCreated} nuevos, ${result.recordsUpdated} actualizados)`,
      });
      
      // Recargar datos después de sincronizar
      await loadData();
    } catch (error) {
      console.error('Error sincronizando:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al sincronizar datos de Zoho',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  // Formatear fecha
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Si no tiene permisos
  if (userRole !== null && !['admin', 'ceo', 'sales_manager'].includes(userRole)) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Acceso Denegado
            </CardTitle>
            <CardDescription>
              No tienes permisos para acceder a ZOHO CRM
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Solo gerentes, CEO y administradores pueden acceder a esta sección.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Cargando datos de ZOHO CRM...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold navy-text">ZOHO CRM</h1>
          <p className="text-muted-foreground">
            Visualiza y gestiona leads, deals y pipelines desde ZOHO CRM
          </p>
        </div>
        <div className="flex gap-2">
          {userRole === 'admin' && (
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="default"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Sincronizar desde Zoho
                </>
              )}
            </Button>
          )}
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
          >
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Actualizando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="stats">Estadísticas</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
        </TabsList>

        {/* Estadísticas */}
        <TabsContent value="stats" className="flex-1 overflow-auto">
          {/* Filtros */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Filtra las estadísticas por desarrollo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-sm font-medium mb-2 block">Desarrollo</label>
                  <Select value={selectedDesarrollo} onValueChange={setSelectedDesarrollo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar desarrollo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los desarrollos</SelectItem>
                      {availableDevelopments.map((dev) => (
                        <SelectItem key={dev} value={dev}>
                          {dev}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={showLastMonth ? "default" : "outline"}
                    onClick={() => setShowLastMonth(!showLastMonth)}
                    className="mt-6 sm:mt-0"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {showLastMonth ? 'Ver Actual' : 'Ver Mes Anterior'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingStats ? (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p className="text-muted-foreground">Cargando estadísticas...</p>
                </div>
              </CardContent>
            </Card>
          ) : (showLastMonth ? lastMonthStats : stats) ? (
            <div className="mt-4 space-y-4">
              {/* Tarjetas de resumen */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Total Leads */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(showLastMonth ? lastMonthStats : stats)?.totalLeads || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {showLastMonth ? 'Leads del mes anterior' : 'Leads registrados'}
                  </p>
                </CardContent>
              </Card>

              {/* Total Deals */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Deals</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(showLastMonth ? lastMonthStats : stats)?.totalDeals || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {showLastMonth ? 'Deals del mes anterior' : 'Oportunidades activas'}
                  </p>
                </CardContent>
              </Card>

              {/* Valor Total */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency((showLastMonth ? lastMonthStats : stats)?.totalDealValue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {showLastMonth ? 'Valor del mes anterior' : 'Valor de todos los deals'}
                  </p>
                </CardContent>
              </Card>

              {/* Valor Promedio */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Valor Promedio</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency((showLastMonth ? lastMonthStats : stats)?.averageDealValue || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Por deal
                  </p>
                </CardContent>
              </Card>
              </div>

              {/* Gráficas del mes anterior */}
              {showLastMonth && lastMonthStats && (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Gráfica de Leads por Fecha */}
                  {lastMonthStats.leadsByDate && Object.keys(lastMonthStats.leadsByDate).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Leads por Día - Mes Anterior</CardTitle>
                        <CardDescription>Evolución diaria de leads</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={Object.entries(lastMonthStats.leadsByDate).map(([date, count]) => ({
                            fecha: new Date(date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }),
                            leads: count
                          })).sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="fecha" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="leads" stroke="#8884d8" name="Leads" />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Gráfica de Deals por Fecha */}
                  {lastMonthStats.dealsByDate && Object.keys(lastMonthStats.dealsByDate).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Deals por Día - Mes Anterior</CardTitle>
                        <CardDescription>Evolución diaria de deals</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={Object.entries(lastMonthStats.dealsByDate).map(([date, count]) => ({
                            fecha: new Date(date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }),
                            deals: count
                          })).sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="fecha" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="deals" stroke="#82ca9d" name="Deals" />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Gráfica de Valor por Fecha */}
                  {lastMonthStats.dealValueByDate && Object.keys(lastMonthStats.dealValueByDate).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Valor de Deals por Día - Mes Anterior</CardTitle>
                        <CardDescription>Evolución diaria del valor</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={Object.entries(lastMonthStats.dealValueByDate).map(([date, value]) => ({
                            fecha: new Date(date).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }),
                            valor: value
                          })).sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="fecha" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="valor" fill="#8884d8" name="Valor (MXN)" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Gráfica de Leads por Desarrollo */}
                  {lastMonthStats.leadsByDevelopment && Object.keys(lastMonthStats.leadsByDevelopment).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Leads por Desarrollo - Mes Anterior</CardTitle>
                        <CardDescription>Distribución de leads</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={Object.entries(lastMonthStats.leadsByDevelopment).map(([dev, count]) => ({
                            desarrollo: dev,
                            leads: count
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="desarrollo" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="leads" fill="#8884d8" name="Leads" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Gráfica de Deals por Desarrollo */}
                  {lastMonthStats.dealsByDevelopment && Object.keys(lastMonthStats.dealsByDevelopment).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Deals por Desarrollo - Mes Anterior</CardTitle>
                        <CardDescription>Distribución de deals</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={Object.entries(lastMonthStats.dealsByDevelopment).map(([dev, count]) => ({
                            desarrollo: dev,
                            deals: count
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="desarrollo" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="deals" fill="#82ca9d" name="Deals" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Gráfica de Valor por Desarrollo */}
                  {lastMonthStats.dealValueByDevelopment && Object.keys(lastMonthStats.dealValueByDevelopment).length > 0 && (
                    <Card className="md:col-span-2">
                      <CardHeader>
                        <CardTitle>Valor de Deals por Desarrollo - Mes Anterior</CardTitle>
                        <CardDescription>Valor total por desarrollo</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={Object.entries(lastMonthStats.dealValueByDevelopment).map(([dev, value]) => ({
                            desarrollo: dev,
                            valor: value
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="desarrollo" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                            <Bar dataKey="valor" fill="#ffc658" name="Valor (MXN)" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Estadísticas por Estado y Etapa */}
              <div className="grid gap-4 md:grid-cols-2">

              {/* Leads por Estado */}
              <Card>
                <CardHeader>
                  <CardTitle>Leads por Estado</CardTitle>
                  <CardDescription>Distribución de leads según su estado</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries((showLastMonth ? lastMonthStats : stats)?.leadsByStatus || {}).map(([status, count]) => {
                      const total = (showLastMonth ? lastMonthStats : stats)?.totalLeads || 1;
                      return (
                        <div key={status} className="flex items-center justify-between">
                          <span className="text-sm">{status}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-muted rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full"
                                style={{
                                  width: `${(count / total) * 100}%`,
                                }}
                              />
                            </div>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Deals por Etapa */}
              <Card>
                <CardHeader>
                  <CardTitle>Deals por Etapa</CardTitle>
                  <CardDescription>Distribución de deals según su etapa</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries((showLastMonth ? lastMonthStats : stats)?.dealsByStage || {}).map(([stage, count]) => {
                      const total = (showLastMonth ? lastMonthStats : stats)?.totalDeals || 1;
                      return (
                        <div key={stage} className="flex items-center justify-between">
                          <span className="text-sm">{stage}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-muted rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full"
                                style={{
                                  width: `${(count / total) * 100}%`,
                                }}
                              />
                            </div>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              </div>
            </div>
          ) : (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  No se pudieron cargar las estadísticas
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Leads */}
        <TabsContent value="leads" className="flex-1 overflow-auto">
          <div className="mt-4 space-y-4">
            {/* Análisis de Leads */}
            {stats && (
              <>
                {/* Embudo de Leads */}
                {stats.leadsFunnel && Object.keys(stats.leadsFunnel).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Embudo de Leads</CardTitle>
                      <CardDescription>Distribución de leads por estado (embudo de conversión)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={Object.entries(stats.leadsFunnel).map(([status, count]) => ({
                            estado: status,
                            cantidad: count,
                            porcentaje: stats.totalLeads > 0 ? Math.round((count / stats.totalLeads) * 100) : 0
                          }))}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="estado" type="category" width={150} />
                          <Tooltip 
                            formatter={(value: number, name: string, props: any) => {
                              if (name === 'cantidad') {
                                return [`${value} leads (${props.payload.porcentaje}%)`, 'Cantidad'];
                              }
                              return value;
                            }}
                          />
                          <Legend />
                          <Bar dataKey="cantidad" fill="#8884d8" name="Leads">
                            {Object.entries(stats.leadsFunnel).map((entry, index) => {
                              const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0'];
                              return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Tiempos en Fases - Leads */}
                {stats.averageTimeInPhaseLeads && Object.keys(stats.averageTimeInPhaseLeads).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Tiempos Promedio en Fases</CardTitle>
                      <CardDescription>Tiempo promedio (en días) que los leads permanecen en cada estado</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={Object.entries(stats.averageTimeInPhaseLeads).map(([status, days]) => ({
                          estado: status,
                          dias: days
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="estado" />
                          <YAxis label={{ value: 'Días', angle: -90, position: 'insideLeft' }} />
                          <Tooltip formatter={(value: number) => [`${value} días`, 'Tiempo promedio']} />
                          <Legend />
                          <Bar dataKey="dias" fill="#82ca9d" name="Días promedio" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Motivos de Descarte - Leads */}
                {stats.leadsDiscardReasons && Object.keys(stats.leadsDiscardReasons).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Motivos de Descarte</CardTitle>
                      <CardDescription>Análisis de los motivos por los que se descartan leads</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={Object.entries(stats.leadsDiscardReasons)
                          .sort(([, a], [, b]) => b - a)
                          .map(([motivo, count]) => ({
                            motivo,
                            cantidad: count
                          }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="motivo" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="cantidad" fill="#ff7300" name="Cantidad" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Lista de Leads */}
            <Card>
              <CardHeader>
                <CardTitle>Lista de Leads</CardTitle>
                <CardDescription>
                  Lista de leads de ZOHO CRM (mostrando primeros 200)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leads.length > 0 ? (
                  <div className="space-y-4">
                    {leads.map((lead) => (
                      <div
                        key={lead.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">
                              {lead.Full_Name || 'Sin nombre'}
                            </h3>
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              {lead.Email && <p>📧 {lead.Email}</p>}
                              {lead.Phone && <p>📞 {lead.Phone}</p>}
                              {lead.Company && <p>🏢 {lead.Company}</p>}
                              {lead.Lead_Status && (
                                <p>
                                  Estado: <Badge variant="outline">{lead.Lead_Status}</Badge>
                                </p>
                              )}
                              {lead.Lead_Source && (
                                <p>Fuente: {lead.Lead_Source}</p>
                              )}
                              {lead.Desarrollo && (
                                <p>Desarrollo: <Badge variant="secondary">{lead.Desarrollo}</Badge></p>
                              )}
                              {lead.Motivo_Descarte && (
                                <p className="text-orange-600">Motivo descarte: {lead.Motivo_Descarte}</p>
                              )}
                              {lead.Tiempo_En_Fase !== undefined && (
                                <p>Tiempo en fase: {lead.Tiempo_En_Fase} días</p>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(lead.Created_Time)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No hay leads disponibles
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Deals */}
        <TabsContent value="deals" className="flex-1 overflow-auto">
          <div className="mt-4 space-y-4">
            {/* Análisis de Deals */}
            {stats && (
              <>
                {/* Deals por Desarrollo */}
                {stats.dealsByDevelopment && Object.keys(stats.dealsByDevelopment).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Deals por Desarrollo</CardTitle>
                      <CardDescription>Distribución de deals según el desarrollo</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-medium mb-4">Cantidad de Deals</h4>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={Object.entries(stats.dealsByDevelopment).map(([dev, count]) => ({
                              desarrollo: dev,
                              cantidad: count
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="desarrollo" angle={-45} textAnchor="end" height={100} />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="cantidad" fill="#8884d8" name="Deals" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        {stats.dealValueByDevelopment && Object.keys(stats.dealValueByDevelopment).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-4">Valor de Deals</h4>
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart data={Object.entries(stats.dealValueByDevelopment).map(([dev, value]) => ({
                                desarrollo: dev,
                                valor: value
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="desarrollo" angle={-45} textAnchor="end" height={100} />
                                <YAxis />
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                <Legend />
                                <Bar dataKey="valor" fill="#82ca9d" name="Valor (MXN)" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Embudo de Deals */}
                {stats.dealsFunnel && Object.keys(stats.dealsFunnel).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Embudo de Deals</CardTitle>
                      <CardDescription>Distribución de deals por etapa (embudo de conversión)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart
                          data={Object.entries(stats.dealsFunnel).map(([stage, count]) => ({
                            etapa: stage,
                            cantidad: count,
                            porcentaje: stats.totalDeals > 0 ? Math.round((count / stats.totalDeals) * 100) : 0
                          }))}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="etapa" type="category" width={150} />
                          <Tooltip 
                            formatter={(value: number, name: string, props: any) => {
                              if (name === 'cantidad') {
                                return [`${value} deals (${props.payload.porcentaje}%)`, 'Cantidad'];
                              }
                              return value;
                            }}
                          />
                          <Legend />
                          <Bar dataKey="cantidad" fill="#82ca9d" name="Deals">
                            {Object.entries(stats.dealsFunnel).map((entry, index) => {
                              const colors = ['#82ca9d', '#8884d8', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0'];
                              return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Tiempos en Fases - Deals */}
                {stats.averageTimeInPhaseDeals && Object.keys(stats.averageTimeInPhaseDeals).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Tiempos Promedio en Fases</CardTitle>
                      <CardDescription>Tiempo promedio (en días) que los deals permanecen en cada etapa</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={Object.entries(stats.averageTimeInPhaseDeals).map(([stage, days]) => ({
                          etapa: stage,
                          dias: days
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="etapa" angle={-45} textAnchor="end" height={100} />
                          <YAxis label={{ value: 'Días', angle: -90, position: 'insideLeft' }} />
                          <Tooltip formatter={(value: number) => [`${value} días`, 'Tiempo promedio']} />
                          <Legend />
                          <Bar dataKey="dias" fill="#ffc658" name="Días promedio" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Motivos de Descarte - Deals */}
                {stats.dealsDiscardReasons && Object.keys(stats.dealsDiscardReasons).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Motivos de Descarte</CardTitle>
                      <CardDescription>Análisis de los motivos por los que se descartan deals</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={Object.entries(stats.dealsDiscardReasons)
                          .sort(([, a], [, b]) => b - a)
                          .map(([motivo, count]) => ({
                            motivo,
                            cantidad: count
                          }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="motivo" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="cantidad" fill="#ff7300" name="Cantidad" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Lista de Deals */}
            <Card>
              <CardHeader>
                <CardTitle>Lista de Deals</CardTitle>
                <CardDescription>
                  Lista de deals de ZOHO CRM (mostrando primeros 200)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {deals.length > 0 ? (
                  <div className="space-y-4">
                    {deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">
                              {deal.Deal_Name || 'Sin nombre'}
                            </h3>
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              {deal.Amount && (
                                <p className="text-lg font-semibold text-primary">
                                  {formatCurrency(deal.Amount)}
                                </p>
                              )}
                              {deal.Stage && (
                                <p>
                                  Etapa: <Badge variant="outline">{deal.Stage}</Badge>
                                </p>
                              )}
                              {deal.Probability !== undefined && (
                                <p>Probabilidad: {deal.Probability}%</p>
                              )}
                              {deal.Closing_Date && (
                                <p>Fecha de cierre: {formatDate(deal.Closing_Date)}</p>
                              )}
                              {deal.Account_Name?.name && (
                                <p>Cuenta: {deal.Account_Name.name}</p>
                              )}
                              {deal.Desarrollo && (
                                <p>Desarrollo: <Badge variant="secondary">{deal.Desarrollo}</Badge></p>
                              )}
                              {deal.Motivo_Descarte && (
                                <p className="text-orange-600">Motivo descarte: {deal.Motivo_Descarte}</p>
                              )}
                              {deal.Tiempo_En_Fase !== undefined && (
                                <p>Tiempo en fase: {deal.Tiempo_En_Fase} días</p>
                              )}
                              {deal.Notes && deal.Notes.length > 0 && (
                                <div className="mt-2 pt-2 border-t">
                                  <p className="text-xs font-medium mb-1">Notas ({deal.Notes.length}):</p>
                                  <div className="space-y-1">
                                    {deal.Notes.slice(0, 3).map((note: any) => (
                                      <div key={note.id} className="text-xs bg-muted p-2 rounded">
                                        {note.Note_Title && (
                                          <p className="font-medium">{note.Note_Title}</p>
                                        )}
                                        {note.Note_Content && (
                                          <p className="text-muted-foreground line-clamp-2">
                                            {note.Note_Content}
                                          </p>
                                        )}
                                        {note.Created_Time && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            {formatDate(note.Created_Time)}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                    {deal.Notes.length > 3 && (
                                      <p className="text-xs text-muted-foreground">
                                        +{deal.Notes.length - 3} notas más
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(deal.Created_Time)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No hay deals disponibles
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Pipelines */}
        <TabsContent value="pipelines" className="flex-1 overflow-auto">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Pipelines</CardTitle>
              <CardDescription>
                Pipelines y etapas configuradas en ZOHO CRM
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pipelines.length > 0 ? (
                <div className="space-y-6">
                  {pipelines.map((pipeline) => (
                    <div key={pipeline.id} className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-4">{pipeline.name}</h3>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {pipeline.stages.map((stage) => (
                          <div
                            key={stage.id}
                            className="border rounded p-3 bg-muted/50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">{stage.name}</span>
                              <Badge variant="secondary">{stage.probability}%</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Orden: {stage.display_order}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No hay pipelines disponibles
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

