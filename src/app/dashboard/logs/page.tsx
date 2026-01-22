'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Eye, ChevronLeft, ChevronRight, X, Copy, Check, Upload, Trash2, Settings, MessageSquare, RefreshCw, Database, Loader2, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { getQueryLogs, getUser, syncZohoData, getZohoSyncLogs, getZohoFields, getLastZohoSync, type ZohoSyncLog, type ZohoFieldsResponse } from '@/lib/api';
import { ZONES } from '@/lib/config/constants';
import { formatRelativeTime, truncate, formatDate, copyToClipboard } from '@/lib/utils/utils';
import type { QueryLog, ActionLog } from '@/types/documents';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useToast } from '@/components/ui/use-toast';
import { logger } from '@/lib/utils/logger';

type UnifiedLog = {
  id: string;
  type: 'query' | 'action';
  user_id: number;
  action_type?: string;
  resource_type?: string;
  description: string;
  zone?: string;
  development?: string;
  created_at: Date;
  data: QueryLog | ActionLog;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<UnifiedLog | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // Mapa para almacenar user_id -> nombre del usuario
  const [userNames, setUserNames] = useState<Record<number, string>>({});
  const ITEMS_PER_PAGE = 20;

  // Función para cargar los nombres de los usuarios
  const loadUserNames = useCallback(async (userIds: number[]) => {
    const newUserNames: Record<number, string> = { ...userNames };
    
    // Filtrar solo los user_ids que aún no tenemos
    const missingUserIds = userIds.filter(id => !newUserNames[id]);
    
    if (missingUserIds.length === 0) {
      return; // Ya tenemos todos los nombres
    }

    console.log('👤 [LogsPage] Cargando nombres de usuarios:', missingUserIds);

    // Cargar nombres de usuarios en paralelo
    const userPromises = missingUserIds.map(async (userId) => {
      try {
        const user = await getUser(userId);
        return { userId, name: user.name };
      } catch (error) {
        console.error(`❌ [LogsPage] Error obteniendo usuario ${userId}:`, error);
        return { userId, name: `Usuario ${userId}` }; // Fallback si falla
      }
    });

    const userResults = await Promise.all(userPromises);
    
    // Actualizar el mapa de nombres
    userResults.forEach(({ userId, name }) => {
      newUserNames[userId] = name;
    });

    setUserNames(newUserNames);
  }, [userNames]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      console.log('📥 [LogsPage] Cargando logs con filtros:', {
        zone: zoneFilter || 'todas',
        actionType: actionTypeFilter || 'todas',
        page,
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
      });

      const data = await getQueryLogs({
        zone: zoneFilter || undefined,
        actionType: actionTypeFilter || undefined,
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
      });
      
      console.log('📊 [LogsPage] Datos recibidos:', {
        queriesCount: data.queries?.length || 0,
        actionsCount: data.actions?.length || 0,
        total: (data.queries?.length || 0) + (data.actions?.length || 0),
      });

      // Validar que data tenga la estructura correcta
      if (!data || typeof data !== 'object') {
        console.error('❌ [LogsPage] Respuesta inválida:', data);
        setLogs([]);
        return;
      }

      // Asegurar que queries y actions sean arrays
      const queries = Array.isArray(data.queries) ? data.queries : [];
      const actions = Array.isArray(data.actions) ? data.actions : [];
      
      // Combinar y ordenar logs
      const unifiedLogs: UnifiedLog[] = [
        ...queries.map(q => ({
          id: `query-${q.id}`,
          type: 'query' as const,
          user_id: q.user_id,
          description: truncate(q.query, 60),
          zone: q.zone,
          development: q.development,
          created_at: q.created_at,
          data: q,
        })),
        ...actions.map(a => ({
          id: `action-${a.id}`,
          type: 'action' as const,
          user_id: a.user_id,
          action_type: a.action_type,
          resource_type: a.resource_type,
          description: a.description,
          zone: a.zone,
          development: a.development,
          created_at: a.created_at,
          data: a,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      console.log('✅ [LogsPage] Logs procesados:', unifiedLogs.length);
      setLogs(unifiedLogs);

      // Obtener nombres de usuarios únicos
      const uniqueUserIds = Array.from(new Set(unifiedLogs.map(log => log.user_id)));
      await loadUserNames(uniqueUserIds);
    } catch (error) {
      console.error('❌ [LogsPage] Error loading logs:', error);
      // Mostrar error al usuario
      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack);
      }
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [zoneFilter, actionTypeFilter, page, loadUserNames]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleCopy = async (text: string, field: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Cerrar modal con ESC y cargar nombre de usuario si es necesario
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLog) {
        setSelectedLog(null);
      }
    };

    if (selectedLog) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      
      // Cargar nombre del usuario si no está en el mapa
      if (!userNames[selectedLog.user_id]) {
        loadUserNames([selectedLog.user_id]);
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLog]);

  return (
    <div className="space-y-8">
      <div className="pl-4">
        <h1 className="text-lg font-bold navy-text">Logs</h1>
        <p className="text-muted-foreground">
          Historial completo de acciones y consultas del sistema
        </p>
      </div>

      <Tabs defaultValue="system" className="w-full">
        <TabsList>
          <TabsTrigger value="system">Logs del Sistema</TabsTrigger>
          <TabsTrigger value="zoho">Sincronización Zoho CRM</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6">

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>
                Filtra logs por zona, tipo de acción o recurso
              </CardDescription>
            </div>
            <div className="flex gap-4">
              <div className="w-48">
                <Select value={zoneFilter || 'all'} onValueChange={(value) => setZoneFilter(value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las zonas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las zonas</SelectItem>
                    {ZONES.map((z) => (
                      <SelectItem key={z.value} value={z.value}>
                        {z.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Select value={actionTypeFilter || 'all'} onValueChange={(value) => setActionTypeFilter(value === 'all' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los tipos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="query">Consultas</SelectItem>
                    <SelectItem value="upload">Subidas</SelectItem>
                    <SelectItem value="delete">Eliminaciones</SelectItem>
                    <SelectItem value="update">Actualizaciones</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle>Logs del Sistema ({logs.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Cargando logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No se encontraron logs</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Acción / Consulta</TableHead>
                    <TableHead>Zona / Desarrollo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const getActionIcon = () => {
                      if (log.type === 'query') return <MessageSquare className="h-4 w-4" />;
                      if (log.action_type === 'upload') return <Upload className="h-4 w-4" />;
                      if (log.action_type === 'delete') return <Trash2 className="h-4 w-4" />;
                      if (log.action_type === 'update') return <Settings className="h-4 w-4" />;
                      return <Activity className="h-4 w-4" />;
                    };

                    const getActionBadge = () => {
                      if (log.type === 'query') {
                        return <Badge variant="default">Consulta</Badge>;
                      }
                      const colors: Record<string, string> = {
                        upload: 'bg-green-500',
                        delete: 'bg-red-500',
                        update: 'bg-blue-500',
                        create: 'bg-purple-500',
                      };
                      return (
                        <Badge className={colors[log.action_type || ''] || ''}>
                          {log.action_type || 'Acción'}
                        </Badge>
                      );
                    };

                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getActionIcon()}
                            {getActionBadge()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {userNames[log.user_id] || `Usuario ${log.user_id}`}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="text-sm">{log.description}</p>
                          {log.resource_type && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {log.resource_type}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.zone && (
                            <div className="space-y-1">
                              <Badge variant="secondary">
                                {ZONES.find(z => z.value === log.zone)?.label || log.zone}
                              </Badge>
                              {log.development && (
                                <p className="text-xs text-muted-foreground">
                                  {log.development}
                                </p>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(log.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Página {page + 1}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={logs.length < ITEMS_PER_PAGE}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalles */}
      {selectedLog && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-0"
            onClick={() => setSelectedLog(null)}
          />

          {/* Modal */}
          <div className="fixed left-[50%] top-[50%] z-50 w-full max-w-4xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%] animate-in fade-in-0 zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%]">
            <div className="bg-background border rounded-lg shadow-lg flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h2 className="text-sm font-semibold">
                    {selectedLog.type === 'query' ? 'Detalles de la Consulta' : 'Detalles de la Acción'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    ID: {selectedLog.id} • {formatDate(selectedLog.created_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedLog(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content - Scrollable */}
              <div className="p-6 overflow-y-auto space-y-6">
                {selectedLog.type === 'query' ? (
                  // Vista para Query Logs
                  <>
                    {/* Información General */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Usuario</label>
                        <p className="mt-1">{userNames[(selectedLog.data as QueryLog).user_id] || `Usuario ${(selectedLog.data as QueryLog).user_id}`}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Zona</label>
                        <div className="mt-1">
                          <Badge variant="secondary">
                            {ZONES.find(z => z.value === (selectedLog.data as QueryLog).zone)?.label || (selectedLog.data as QueryLog).zone}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Desarrollo</label>
                        <p className="mt-1">{(selectedLog.data as QueryLog).development}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Tiempo de Respuesta</label>
                        <p className="mt-1">
                          {(selectedLog.data as QueryLog).response_time_ms 
                            ? `${Math.round(((selectedLog.data as QueryLog).response_time_ms / 1000) * 100) / 100}s`
                            : 'N/A'}
                        </p>
                      </div>
                      {(selectedLog.data as QueryLog).tokens_used && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Tokens Usados</label>
                          <p className="mt-1">{(selectedLog.data as QueryLog).tokens_used?.toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* Consulta */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-muted-foreground">Consulta</label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy((selectedLog.data as QueryLog).query, 'query')}
                        >
                          {copiedField === 'query' ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="bg-muted rounded-md p-4">
                        <p className="text-sm whitespace-pre-wrap">{(selectedLog.data as QueryLog).query}</p>
                      </div>
                    </div>

                    {/* Respuesta */}
                    {(selectedLog.data as QueryLog).response && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-muted-foreground">Respuesta</label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy((selectedLog.data as QueryLog).response || '', 'response')}
                          >
                            {copiedField === 'response' ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <div className="bg-muted rounded-md p-4">
                          <MarkdownRenderer content={(selectedLog.data as QueryLog).response} />
                        </div>
                      </div>
                    )}

                    {/* Fuentes */}
                    {(selectedLog.data as QueryLog).sources_used && (selectedLog.data as QueryLog).sources_used.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">
                          Fuentes Utilizadas ({(selectedLog.data as QueryLog).sources_used.length})
                        </label>
                        <div className="space-y-2">
                          {(selectedLog.data as QueryLog).sources_used.map((source, index) => (
                            <div
                              key={index}
                              className="bg-muted rounded-md p-3 flex items-center justify-between"
                            >
                              <p className="text-sm font-mono">{source}</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopy(source, `source-${index}`)}
                              >
                                {copiedField === `source-${index}` ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  // Vista para Action Logs
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Usuario</label>
                        <p className="mt-1">{userNames[(selectedLog.data as ActionLog).user_id] || `Usuario ${(selectedLog.data as ActionLog).user_id}`}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Tipo de Acción</label>
                        <div className="mt-1">
                          <Badge>{(selectedLog.data as ActionLog).action_type}</Badge>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Tipo de Recurso</label>
                        <p className="mt-1">{(selectedLog.data as ActionLog).resource_type}</p>
                      </div>
                      {(selectedLog.data as ActionLog).resource_id && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">ID del Recurso</label>
                          <p className="mt-1">#{(selectedLog.data as ActionLog).resource_id}</p>
                        </div>
                      )}
                      {(selectedLog.data as ActionLog).zone && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Zona</label>
                          <div className="mt-1">
                            <Badge variant="secondary">
                              {ZONES.find(z => z.value === (selectedLog.data as ActionLog).zone)?.label || (selectedLog.data as ActionLog).zone}
                            </Badge>
                          </div>
                        </div>
                      )}
                      {(selectedLog.data as ActionLog).development && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Desarrollo</label>
                          <p className="mt-1">{(selectedLog.data as ActionLog).development}</p>
                        </div>
                      )}
                      {(selectedLog.data as ActionLog).ip_address && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                          <p className="mt-1 font-mono text-xs">{(selectedLog.data as ActionLog).ip_address}</p>
                        </div>
                      )}
                    </div>

                    {/* Descripción */}
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Descripción</label>
                      <div className="bg-muted rounded-md p-4">
                        <p className="text-sm">{(selectedLog.data as ActionLog).description}</p>
                      </div>
                    </div>

                    {/* Metadata */}
                    {(selectedLog.data as ActionLog).metadata && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-muted-foreground">Metadata</label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(JSON.stringify((selectedLog.data as ActionLog).metadata, null, 2), 'metadata')}
                          >
                            {copiedField === 'metadata' ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <div className="bg-muted rounded-md p-4">
                          <pre className="text-xs overflow-x-auto">
                            {JSON.stringify((selectedLog.data as ActionLog).metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end p-6 border-t">
                <Button onClick={() => setSelectedLog(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
        </TabsContent>

        <TabsContent value="zoho" className="space-y-6">
          <ZohoSyncSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================
// COMPONENTE: Sección de Sincronización de Zoho
// =====================================================

function ZohoSyncSection() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<ZohoSyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [lastSync, setLastSync] = useState<ZohoSyncLog | null>(null);
  const [fieldsLeads, setFieldsLeads] = useState<ZohoFieldsResponse | null>(null);
  const [fieldsDeals, setFieldsDeals] = useState<ZohoFieldsResponse | null>(null);
  const [loadingFields, setLoadingFields] = useState(false);
  const [syncTypeFilter, setSyncTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [totalLogs, setTotalLogs] = useState(0);
  const ITEMS_PER_PAGE = 20;

  // Cargar logs de sincronización
  const loadSyncLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const data = await getZohoSyncLogs({
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
        type: syncTypeFilter !== 'all' ? syncTypeFilter as 'leads' | 'deals' | 'full' : undefined,
        status: statusFilter !== 'all' ? statusFilter as 'success' | 'error' | 'partial' : undefined,
      });
      setSyncLogs(data.logs);
      setTotalLogs(data.total);
    } catch (error) {
      console.error('Error cargando logs de sincronización:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los logs de sincronización',
        variant: 'destructive',
      });
    } finally {
      setLoadingLogs(false);
    }
  }, [page, syncTypeFilter, statusFilter, toast]);

  // Cargar última sincronización
  const loadLastSync = useCallback(async () => {
    try {
      const last = await getLastZohoSync();
      setLastSync(last);
    } catch (error) {
      logger.error('Error loading last sync:', error);
    }
  }, []);

  // Cargar campos de Zoho
  const loadFields = useCallback(async (module: 'Leads' | 'Deals') => {
    setLoadingFields(true);
    try {
      const fields = await getZohoFields(module);
      if (module === 'Leads') {
        setFieldsLeads(fields);
      } else {
        setFieldsDeals(fields);
      }
    } catch (error) {
      console.error(`Error cargando campos de ${module}:`, error);
      toast({
        title: 'Error',
        description: `No se pudieron cargar los campos de ${module}`,
        variant: 'destructive',
      });
    } finally {
      setLoadingFields(false);
    }
  }, [toast]);

  // Sincronizar datos
  const handleSync = async (type: 'leads' | 'deals' | 'full') => {
    setSyncing(true);
    try {
      const result = await syncZohoData(type);
      toast({
        title: 'Sincronización completada',
        description: `Sincronizados ${result.recordsSynced} registros (${result.recordsCreated} nuevos, ${result.recordsUpdated} actualizados)`,
        variant: result.status === 'success' ? 'default' : 'destructive',
      });
      await loadSyncLogs();
      await loadLastSync();
    } catch (error) {
      console.error('Error sincronizando:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al sincronizar datos',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadSyncLogs();
    loadLastSync();
  }, [loadSyncLogs, loadLastSync]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary'> = {
      success: 'default',
      error: 'destructive',
      partial: 'secondary',
    };
    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status === 'success' ? 'Éxito' : status === 'error' ? 'Error' : 'Parcial'}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === 'error') return <AlertCircle className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-yellow-500" />;
  };

  return (
    <>
      {/* Última Sincronización */}
      {lastSync && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Última Sincronización
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Tipo</p>
                <p className="font-medium">{lastSync.sync_type === 'full' ? 'Completa' : lastSync.sync_type === 'leads' ? 'Leads' : 'Deals'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estado</p>
                <div className="flex items-center gap-2">
                  {getStatusIcon(lastSync.status)}
                  {getStatusBadge(lastSync.status)}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Registros</p>
                <p className="font-medium">{lastSync.records_synced} sincronizados</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha</p>
                <p className="font-medium">{formatDate(lastSync.started_at.toString())}</p>
              </div>
            </div>
            {lastSync.error_message && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
                <p className="text-sm text-destructive">{lastSync.error_message}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Controles de Sincronización */}
      <Card>
        <CardHeader>
          <CardTitle>Sincronizar Datos</CardTitle>
          <CardDescription>
            Sincroniza datos de Zoho CRM a la base de datos local
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => handleSync('full')}
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
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizar Todo
                </>
              )}
            </Button>
            <Button
              onClick={() => handleSync('leads')}
              disabled={syncing}
              variant="outline"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizar Leads
                </>
              )}
            </Button>
            <Button
              onClick={() => handleSync('deals')}
              disabled={syncing}
              variant="outline"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sincronizar Deals
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Campos Disponibles */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Campos de Leads</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadFields('Leads')}
                disabled={loadingFields}
              >
                {loadingFields ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Cargar Campos'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fieldsLeads ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total: {fieldsLeads.totalFields}</span>
                  <span>Estándar: {fieldsLeads.standardFields}</span>
                  <span>Personalizados: {fieldsLeads.customFields}</span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {fieldsLeads.fields.slice(0, 20).map((field) => (
                    <div key={field.api_name} className="text-xs p-2 bg-muted rounded">
                      <div className="font-medium">{field.display_label}</div>
                      <div className="text-muted-foreground">
                        {field.api_name} ({field.data_type})
                        {field.required && <Badge variant="outline" className="ml-2">Requerido</Badge>}
                      </div>
                    </div>
                  ))}
                  {fieldsLeads.fields.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ... y {fieldsLeads.fields.length - 20} campos más
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Haz clic en &quot;Cargar Campos&quot; para ver los campos disponibles
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Campos de Deals</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadFields('Deals')}
                disabled={loadingFields}
              >
                {loadingFields ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Cargar Campos'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fieldsDeals ? (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Total: {fieldsDeals.totalFields}</span>
                  <span>Estándar: {fieldsDeals.standardFields}</span>
                  <span>Personalizados: {fieldsDeals.customFields}</span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {fieldsDeals.fields.slice(0, 20).map((field) => (
                    <div key={field.api_name} className="text-xs p-2 bg-muted rounded">
                      <div className="font-medium">{field.display_label}</div>
                      <div className="text-muted-foreground">
                        {field.api_name} ({field.data_type})
                        {field.required && <Badge variant="outline" className="ml-2">Requerido</Badge>}
                      </div>
                    </div>
                  ))}
                  {fieldsDeals.fields.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center">
                      ... y {fieldsDeals.fields.length - 20} campos más
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Haz clic en &quot;Cargar Campos&quot; para ver los campos disponibles
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtros de Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="w-48">
              <Select value={syncTypeFilter} onValueChange={setSyncTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de sincronización" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="full">Completa</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="deals">Deals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="success">Éxito</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs de Sincronización */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Sincronizaciones ({totalLogs})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="text-center py-8 text-muted-foreground">
              Cargando logs...
            </div>
          ) : syncLogs.length === 0 ? (
            <div className="text-center py-8">
              <Database className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No hay logs de sincronización</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Registros</TableHead>
                    <TableHead>Nuevos</TableHead>
                    <TableHead>Actualizados</TableHead>
                    <TableHead>Fallidos</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {log.sync_type === 'full' ? 'Completa' : log.sync_type === 'leads' ? 'Leads' : 'Deals'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          {getStatusBadge(log.status)}
                        </div>
                      </TableCell>
                      <TableCell>{log.records_synced}</TableCell>
                      <TableCell className="text-green-600">{log.records_created}</TableCell>
                      <TableCell className="text-blue-600">{log.records_updated}</TableCell>
                      <TableCell className="text-red-600">{log.records_failed}</TableCell>
                      <TableCell>
                        {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : 'N/A'}
                      </TableCell>
                      <TableCell>{formatDate(log.started_at.toString())}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginación */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Mostrando {page * ITEMS_PER_PAGE + 1} - {Math.min((page + 1) * ITEMS_PER_PAGE, totalLogs)} de {totalLogs}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * ITEMS_PER_PAGE >= totalLogs}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}


