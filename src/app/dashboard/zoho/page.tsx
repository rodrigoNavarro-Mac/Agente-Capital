'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, TrendingUp, Users, DollarSign, BarChart3, AlertCircle } from 'lucide-react';
import { 
  getZohoLeads, 
  getZohoDeals, 
  getZohoPipelines, 
  getZohoStats,
  type ZohoLead,
  type ZohoDeal,
  type ZohoPipeline,
  type ZohoStats
} from '@/lib/api';
import { decodeAccessToken } from '@/lib/auth';
import type { UserRole } from '@/types/documents';

export default function ZohoCRMPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState('stats');
  
  // Datos
  const [stats, setStats] = useState<ZohoStats | null>(null);
  const [leads, setLeads] = useState<ZohoLead[]>([]);
  const [deals, setDeals] = useState<ZohoDeal[]>([]);
  const [pipelines, setPipelines] = useState<ZohoPipeline[]>([]);
  const [error, setError] = useState<string | null>(null);
  
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
  }, [userRole]);

  // Cargar todos los datos
  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Cargar estadísticas primero (más rápido)
      const statsData = await getZohoStats();
      setStats(statsData);
      
      // Cargar otros datos en paralelo
      const [leadsData, dealsData, pipelinesData] = await Promise.all([
        getZohoLeads(1, 50).catch(() => ({ data: [], info: {} })),
        getZohoDeals(1, 50).catch(() => ({ data: [], info: {} })),
        getZohoPipelines().catch(() => ({ data: [] })),
      ]);
      
      setLeads(leadsData.data || []);
      setDeals(dealsData.data || []);
      setPipelines(pipelinesData.data || []);
      
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
  };

  // Refrescar datos
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast({
      title: '✅ Datos actualizados',
      description: 'Los datos de ZOHO CRM se han actualizado correctamente',
    });
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
          {stats ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
              {/* Total Leads */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalLeads}</div>
                  <p className="text-xs text-muted-foreground">
                    Leads registrados
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
                  <div className="text-2xl font-bold">{stats.totalDeals}</div>
                  <p className="text-xs text-muted-foreground">
                    Oportunidades activas
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
                    {formatCurrency(stats.totalDealValue)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Valor de todos los deals
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
                    {formatCurrency(stats.averageDealValue)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Por deal
                  </p>
                </CardContent>
              </Card>

              {/* Leads por Estado */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Leads por Estado</CardTitle>
                  <CardDescription>Distribución de leads según su estado</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.leadsByStatus).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <span className="text-sm">{status}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{
                                width: `${(count / stats.totalLeads) * 100}%`,
                              }}
                            />
                          </div>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Deals por Etapa */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Deals por Etapa</CardTitle>
                  <CardDescription>Distribución de deals según su etapa</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.dealsByStage).map(([stage, count]) => (
                      <div key={stage} className="flex items-center justify-between">
                        <span className="text-sm">{stage}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{
                                width: `${(count / stats.totalDeals) * 100}%`,
                              }}
                            />
                          </div>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
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
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Leads</CardTitle>
              <CardDescription>
                Lista de leads de ZOHO CRM (mostrando primeros 50)
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
        </TabsContent>

        {/* Deals */}
        <TabsContent value="deals" className="flex-1 overflow-auto">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Deals</CardTitle>
              <CardDescription>
                Lista de deals de ZOHO CRM (mostrando primeros 50)
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

