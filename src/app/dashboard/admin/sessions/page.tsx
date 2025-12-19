'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Activity, 
  Monitor, 
  Globe, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw, 
  Loader2,
  Eye,
  X,
  Copy,
  Check
} from 'lucide-react';
import { getAdminSessions, getUser } from '@/lib/api';
import { formatRelativeTime, formatDate, copyToClipboard } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { decodeAccessToken } from '@/lib/auth';

type Session = {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  ip_address?: string;
  user_agent?: string;
  session_started_at: Date;
  session_last_used: Date;
  session_expires_at: Date;
  session_status: 'active' | 'expired';
  pages_visited_count: number;
};

type ActivitySummary = {
  user_id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  total_sessions: number;
  total_page_visits: number;
  modules_visited: number;
  last_session_start: Date;
  last_page_visit: Date;
  modules_list: string;
};

type PageVisit = {
  id: number;
  user_id: number;
  session_id?: number;
  page_path: string;
  page_name?: string;
  module_name?: string;
  ip_address?: string;
  user_agent?: string;
  visited_at: Date;
  duration_seconds?: number;
};

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary[]>([]);
  const [pageVisits, setPageVisits] = useState<PageVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sessions' | 'activity' | 'visits'>('sessions');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<PageVisit | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();
  const ITEMS_PER_PAGE = 20;

  // Verificar permisos
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = decodeAccessToken(token);
      if (payload && payload.role !== 'admin' && payload.role !== 'ceo') {
        toast({
          title: 'Acceso denegado',
          description: 'Solo administradores pueden acceder a esta página',
          variant: 'destructive',
        });
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 2000);
      }
    }
  }, [toast]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminSessions({
        userId: selectedUserId,
        activeOnly,
        limit: ITEMS_PER_PAGE,
        offset: page * ITEMS_PER_PAGE,
        includeVisits: true,
      });

      setSessions(data.sessions);
      setActivitySummary(data.activitySummary);
      setPageVisits(data.pageVisits);
    } catch (error) {
      console.error('Error cargando sesiones:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las sesiones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedUserId, activeOnly, page, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopy = async (text: string, field: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const getModuleBadgeColor = (module?: string) => {
    const colors: Record<string, string> = {
      dashboard: 'bg-blue-100 text-blue-800',
      documents: 'bg-green-100 text-green-800',
      upload: 'bg-purple-100 text-purple-800',
      commissions: 'bg-yellow-100 text-yellow-800',
      zoho: 'bg-orange-100 text-orange-800',
      logs: 'bg-red-100 text-red-800',
      users: 'bg-indigo-100 text-indigo-800',
      config: 'bg-gray-100 text-gray-800',
      profile: 'bg-pink-100 text-pink-800',
    };
    return colors[module || ''] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-8">
      <div className="pl-4">
        <h1 className="text-3xl font-bold navy-text">Sesiones y Actividad de Usuarios</h1>
        <p className="text-muted-foreground">
          Visualiza sesiones activas, IPs, y módulos visitados por los usuarios
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Estado de Sesión</label>
              <Select value={activeOnly ? 'active' : 'all'} onValueChange={(v) => setActiveOnly(v === 'active')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sesiones</SelectItem>
                  <SelectItem value="active">Solo activas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 items-end">
              <Button onClick={loadData} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="sessions">
            <Monitor className="h-4 w-4 mr-2" />
            Sesiones ({sessions.length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Users className="h-4 w-4 mr-2" />
            Resumen de Actividad ({activitySummary.length})
          </TabsTrigger>
          <TabsTrigger value="visits">
            <Activity className="h-4 w-4 mr-2" />
            Visitas a Páginas ({pageVisits.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab: Sesiones */}
        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sesiones de Usuarios</CardTitle>
              <CardDescription>
                Lista de todas las sesiones activas y expiradas con información de IP y User Agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay sesiones registradas
                </div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Usuario</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Inicio</TableHead>
                          <TableHead>Último Uso</TableHead>
                          <TableHead>Visitas</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sessions.map((session) => (
                          <TableRow key={session.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{session.user_name}</div>
                                <div className="text-sm text-muted-foreground">{session.user_email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{session.user_role}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm">{session.ip_address || 'N/A'}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={session.session_status === 'active' ? 'default' : 'secondary'}>
                                {session.session_status === 'active' ? 'Activa' : 'Expirada'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {formatDate(session.session_started_at)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatRelativeTime(session.session_started_at)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {formatDate(session.session_last_used)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatRelativeTime(session.session_last_used)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{session.pages_visited_count}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedSession(session)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Paginación */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {page * ITEMS_PER_PAGE + 1} - {Math.min((page + 1) * ITEMS_PER_PAGE, sessions.length)} de {sessions.length}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={(page + 1) * ITEMS_PER_PAGE >= sessions.length}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Resumen de Actividad */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumen de Actividad por Usuario</CardTitle>
              <CardDescription>
                Estadísticas de sesiones y visitas agrupadas por usuario
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : activitySummary.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay actividad registrada
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Sesiones</TableHead>
                        <TableHead>Visitas</TableHead>
                        <TableHead>Módulos</TableHead>
                        <TableHead>Última Sesión</TableHead>
                        <TableHead>Última Visita</TableHead>
                        <TableHead>Módulos Visitados</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activitySummary.map((activity) => (
                        <TableRow key={activity.user_id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{activity.user_name}</div>
                              <div className="text-sm text-muted-foreground">{activity.user_email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{activity.user_role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{activity.total_sessions}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{activity.total_page_visits}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{activity.modules_visited}</Badge>
                          </TableCell>
                          <TableCell>
                            {activity.last_session_start ? (
                              <div className="text-sm">
                                {formatRelativeTime(activity.last_session_start)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {activity.last_page_visit ? (
                              <div className="text-sm">
                                {formatRelativeTime(activity.last_page_visit)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {activity.modules_list ? (
                                activity.modules_list.split(', ').map((module, idx) => (
                                  <Badge key={idx} className={getModuleBadgeColor(module.trim())}>
                                    {module.trim()}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground">Ninguno</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Visitas a Páginas */}
        <TabsContent value="visits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visitas a Páginas</CardTitle>
              <CardDescription>
                Historial detallado de todas las visitas a módulos del sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : pageVisits.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay visitas registradas
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Módulo</TableHead>
                        <TableHead>Página</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageVisits.map((visit) => (
                        <TableRow key={visit.id}>
                          <TableCell>
                            <div className="font-medium">Usuario {visit.user_id}</div>
                          </TableCell>
                          <TableCell>
                            {visit.module_name ? (
                              <Badge className={getModuleBadgeColor(visit.module_name)}>
                                {visit.module_name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{visit.page_name || visit.page_path}</div>
                            <div className="text-xs text-muted-foreground font-mono">{visit.page_path}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-sm">{visit.ip_address || 'N/A'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {formatDate(visit.visited_at)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatRelativeTime(visit.visited_at)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedVisit(visit)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Detalles de Sesión */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Detalles de Sesión</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedSession(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Usuario</label>
                  <div className="font-medium">{selectedSession.user_name}</div>
                  <div className="text-sm text-muted-foreground">{selectedSession.user_email}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Rol</label>
                  <div><Badge>{selectedSession.user_role}</Badge></div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{selectedSession.ip_address || 'N/A'}</span>
                    {selectedSession.ip_address && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(selectedSession.ip_address!, 'ip')}
                      >
                        {copiedField === 'ip' ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Estado</label>
                  <div>
                    <Badge variant={selectedSession.session_status === 'active' ? 'default' : 'secondary'}>
                      {selectedSession.session_status === 'active' ? 'Activa' : 'Expirada'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Inicio de Sesión</label>
                  <div className="text-sm">{formatDate(selectedSession.session_started_at)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Último Uso</label>
                  <div className="text-sm">{formatDate(selectedSession.session_last_used)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Expira</label>
                  <div className="text-sm">{formatDate(selectedSession.session_expires_at)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Páginas Visitadas</label>
                  <div><Badge variant="outline">{selectedSession.pages_visited_count}</Badge></div>
                </div>
              </div>
              {selectedSession.user_agent && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">User Agent</label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted p-2 rounded flex-1 break-all">
                      {selectedSession.user_agent}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(selectedSession.user_agent!, 'user-agent')}
                    >
                      {copiedField === 'user-agent' ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Detalles de Visita */}
      {selectedVisit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Detalles de Visita</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedVisit(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Usuario ID</label>
                  <div className="font-medium">{selectedVisit.user_id}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Módulo</label>
                  <div>
                    {selectedVisit.module_name ? (
                      <Badge className={getModuleBadgeColor(selectedVisit.module_name)}>
                        {selectedVisit.module_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Página</label>
                  <div className="font-medium">{selectedVisit.page_name || 'N/A'}</div>
                  <div className="text-sm text-muted-foreground font-mono">{selectedVisit.page_path}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{selectedVisit.ip_address || 'N/A'}</span>
                    {selectedVisit.ip_address && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(selectedVisit.ip_address!, 'visit-ip')}
                      >
                        {copiedField === 'visit-ip' ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Fecha</label>
                  <div className="text-sm">{formatDate(selectedVisit.visited_at)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelativeTime(selectedVisit.visited_at)}
                  </div>
                </div>
                {selectedVisit.duration_seconds && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Duración</label>
                    <div className="text-sm">{selectedVisit.duration_seconds} segundos</div>
                  </div>
                )}
              </div>
              {selectedVisit.user_agent && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">User Agent</label>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted p-2 rounded flex-1 break-all">
                      {selectedVisit.user_agent}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(selectedVisit.user_agent!, 'visit-user-agent')}
                    >
                      {copiedField === 'visit-user-agent' ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
