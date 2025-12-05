'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, MessageSquare, Activity, Database, Building2, MapPin, Star, TrendingUp, Loader2, CheckCircle2, ChevronDown, Bot, Users, BarChart3, Clock, TrendingDown, Award } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { checkHealth, getDashboardStats, type DashboardStats, getDocuments, getQueryLogs, getChatHistory, getUser, getUserDevelopments, getAllUsers, getAgentConfig } from '@/lib/api';
import { decodeAccessToken } from '@/lib/auth';
import type { UserRole, UserDevelopment, QueryLog, DocumentMetadata } from '@/types/documents';

interface DevelopmentStats {
  zone: string;
  development: string;
  documentCount: number;
  goodRatings: number; // Calificaciones 4-5
  similarQueries: number; // Consultas similares
}

interface SimilarQuery {
  query: string;
  count: number;
  variants?: number; // Número de variantes similares encontradas
}

// Función auxiliar para normalizar consultas (usada en múltiples lugares)
const normalizeQuery = (query: string): string => {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Reemplazar múltiples espacios con uno solo
    .replace(/[¿?¡!.,;:]/g, '') // Eliminar signos de puntuación comunes
    .trim();
};

export default function DashboardPage() {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lmStudioStatus, setLmStudioStatus] = useState<string>('checking');
  const [openAIStatus, setOpenAIStatus] = useState<string>('checking');
  const [currentProvider, setCurrentProvider] = useState<string>('lmstudio');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [userDevelopments, setUserDevelopments] = useState<UserDevelopment[]>([]);
  const [developmentStats, setDevelopmentStats] = useState<DevelopmentStats[]>([]);
  const [goodRatings, setGoodRatings] = useState<QueryLog[]>([]);
  const [similarQueries, setSimilarQueries] = useState<SimilarQuery[]>([]);
  const [adminStats, setAdminStats] = useState<{
    totalUsers: number;
    activeUsers: number;
    documentsByType: Record<string, number>;
    documentsByZone: Record<string, number>;
    recentDocuments: DocumentMetadata[];
    recentQueries: QueryLog[];
    topRatedQueries: QueryLog[];
    accuracyStats: {
      accuracyPercentage: number;
      totalRated: number;
      excellent: number; // 5 estrellas
      good: number; // 4 estrellas
      average: number; // 3 estrellas
      poor: number; // 1-2 estrellas
    };
  } | null>(null);
  const [llmModel, setLlmModel] = useState<string>('gpt-4o-mini');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const payload = decodeAccessToken(token);
      if (!payload || !payload.userId) return;

      // Obtener información del usuario
      const userData = await getUser(payload.userId);
      const role = userData.role || null;
      setUserRole(role);
      
      // Verificar si es admin o ceo
      const adminRoles: UserRole[] = ['admin', 'ceo'];
      const isAdminUser = role && adminRoles.includes(role);
      setIsAdmin(isAdminUser || false);

      if (isAdminUser) {
        // Cargar dashboard de admin
        await loadAdminDashboard();
      } else {
        // Cargar dashboard de usuario regular
        await loadUserDashboard(payload.userId, role);
      }
    } catch (err) {
      console.error('Error cargando datos:', err);
      setError('Error al cargar información');
    } finally {
      setLoading(false);
    }
  };

  const loadAdminDashboard = async () => {
    // Cargar estado de proveedores LLM
    try {
      const health = await checkHealth();
      setLmStudioStatus(health.lmStudio || 'unavailable');
      setOpenAIStatus(health.openai || 'unavailable');
      setCurrentProvider(health.current || 'lmstudio');
      
      // Obtener modelo LLM desde la configuración
      try {
        const config = await getAgentConfig();
        // El modelo se obtiene de las variables de entorno, pero podemos intentar obtenerlo
        // Por ahora, usamos el proveedor actual para determinar el modelo
        if (health.current === 'openai') {
          setLlmModel('gpt-4o-mini'); // Modelo por defecto de OpenAI
        } else {
          setLlmModel('llama-3.2-3B'); // Modelo por defecto de LM Studio
        }
      } catch {
        // Si falla, usar valores por defecto
        setLlmModel(health.current === 'openai' ? 'gpt-4o-mini' : 'llama-3.2-3B');
      }
    } catch {
      setLmStudioStatus('unavailable');
      setOpenAIStatus('unavailable');
      setLlmModel('gpt-4o-mini');
    }

    // Cargar estadísticas del dashboard
    const data = await getDashboardStats();
    setStats(data);

    // Cargar estadísticas adicionales para admin
    try {
      // Obtener todos los usuarios
      const allUsers = await getAllUsers();
      const activeUsers = allUsers.filter(u => u.is_active).length;

      // Obtener todos los documentos
      const allDocuments = await getDocuments();
      
      // Documentos por tipo
      const documentsByType: Record<string, number> = {};
      allDocuments.forEach(doc => {
        documentsByType[doc.type] = (documentsByType[doc.type] || 0) + 1;
      });

      // Documentos por zona
      const documentsByZone: Record<string, number> = {};
      allDocuments.forEach(doc => {
        documentsByZone[doc.zone] = (documentsByZone[doc.zone] || 0) + 1;
      });

      // Documentos recientes (últimos 5)
      const recentDocuments = allDocuments
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 5);

      // Obtener todas las consultas para calcular estadísticas de exactitud
      // Usamos un límite mayor para obtener suficientes datos
      const logsResponse = await getQueryLogs({ limit: 500 });
      const allQueries = logsResponse.queries || [];
      
      // Consultas recientes (últimas 10)
      const recentQueries = allQueries
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      // Mejores respuestas calificadas (top 5 con calificación 5)
      const topRatedQueries = allQueries
        .filter(q => q.feedback_rating === 5)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

      // Calcular estadísticas de exactitud
      const ratedQueries = allQueries.filter(q => q.feedback_rating && q.feedback_rating > 0);
      const totalRated = ratedQueries.length;
      
      // Distribución de calificaciones
      const excellent = ratedQueries.filter(q => q.feedback_rating === 5).length;
      const good = ratedQueries.filter(q => q.feedback_rating === 4).length;
      const average = ratedQueries.filter(q => q.feedback_rating === 3).length;
      const poor = ratedQueries.filter(q => q.feedback_rating && (q.feedback_rating === 1 || q.feedback_rating === 2)).length;
      
      // Calcular porcentaje de exactitud (respuestas con 4-5 estrellas)
      const accurateResponses = excellent + good;
      const accuracyPercentage = totalRated > 0 
        ? Math.round((accurateResponses / totalRated) * 100) 
        : 0;

      setAdminStats({
        totalUsers: allUsers.length,
        activeUsers,
        documentsByType,
        documentsByZone,
        recentDocuments,
        recentQueries,
        topRatedQueries,
        accuracyStats: {
          accuracyPercentage,
          totalRated,
          excellent,
          good,
          average,
          poor,
        },
      });
    } catch (err) {
      console.error('Error cargando estadísticas adicionales:', err);
      // Inicializar con valores por defecto si hay error
      setAdminStats({
        totalUsers: 0,
        activeUsers: 0,
        documentsByType: {},
        documentsByZone: {},
        recentDocuments: [],
        recentQueries: [],
        topRatedQueries: [],
        accuracyStats: {
          accuracyPercentage: 0,
          totalRated: 0,
          excellent: 0,
          good: 0,
          average: 0,
          poor: 0,
        },
      });
    }
  };

  const loadUserDashboard = async (userId: number, role: UserRole | null) => {
    // Roles con acceso completo
    const rolesWithFullAccess: UserRole[] = ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'];
    
    // Obtener desarrollos asignados
    if (role && rolesWithFullAccess.includes(role)) {
      // Si tiene acceso completo, obtener todos los documentos
      const allDocuments = await getDocuments();
      const statsMap = new Map<string, DevelopmentStats>();
      
      allDocuments.forEach(doc => {
        const key = `${doc.zone}-${doc.development}`;
        if (!statsMap.has(key)) {
          statsMap.set(key, {
            zone: doc.zone,
            development: doc.development,
            documentCount: 0,
            goodRatings: 0,
            similarQueries: 0,
          });
        }
        const stat = statsMap.get(key)!;
        stat.documentCount++;
      });
      
      setDevelopmentStats(Array.from(statsMap.values()));
    } else {
      // Obtener desarrollos específicos del usuario
      const developments = await getUserDevelopments(userId);
      setUserDevelopments(developments);
      
      // Obtener estadísticas por desarrollo
      const statsPromises = developments.map(async (dev) => {
        const documents = await getDocuments({ zone: dev.zone, development: dev.development });
        return {
          zone: dev.zone,
          development: dev.development,
          documentCount: documents.length,
          goodRatings: 0,
          similarQueries: 0,
        };
      });
      
      const devStats = await Promise.all(statsPromises);
      setDevelopmentStats(devStats);
    }

    // Obtener consultas del usuario (usar getChatHistory para usuarios regulares)
    let userQueries: QueryLog[] = [];
    try {
      // Intentar obtener historial de chat (permite a usuarios ver su propio historial)
      // Esta función permite a usuarios regulares ver su propio historial
      userQueries = await getChatHistory({ userId, limit: 500 });
    } catch (err) {
      // Si falla getChatHistory, intentar con getQueryLogs (solo para admins/CEO)
      // Esto es un fallback por si acaso
      try {
        const logsResponse = await getQueryLogs({ userId, limit: 500 });
        userQueries = logsResponse.queries || [];
      } catch (error) {
        // Si ambos fallan, continuar sin consultas - no es crítico para el dashboard
        // El dashboard puede funcionar sin esta información
        console.warn('No se pudieron cargar las consultas del usuario. El dashboard continuará sin esta información.');
        userQueries = [];
      }
    }

    // Filtrar respuestas con buena calificación (4-5 estrellas)
    const goodRatingsList = userQueries
      .filter(q => q.feedback_rating && q.feedback_rating >= 4)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
    setGoodRatings(goodRatingsList);

    // Detectar consultas similares usando múltiples métodos
    // 1. Calcular similitud usando Levenshtein distance (distancia de edición)
    const levenshteinDistance = (str1: string, str2: string): number => {
      const matrix: number[][] = [];
      const len1 = str1.length;
      const len2 = str2.length;

      if (len1 === 0) return len2;
      if (len2 === 0) return len1;

      // Inicializar matriz
      for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
      }
      for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
      }

      // Llenar matriz
      for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
          const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,      // Eliminación
            matrix[i][j - 1] + 1,      // Inserción
            matrix[i - 1][j - 1] + cost // Sustitución
          );
        }
      }

      return matrix[len1][len2];
    };

    // 3. Calcular similitud como porcentaje (0-1)
    const calculateSimilarity = (str1: string, str2: string): number => {
      const maxLen = Math.max(str1.length, str2.length);
      if (maxLen === 0) return 1.0;
      const distance = levenshteinDistance(str1, str2);
      return 1 - (distance / maxLen);
    };

    // 4. Agrupar consultas similares
    const SIMILARITY_THRESHOLD = 0.85; // 85% de similitud para considerar como "similar"
    const queryGroups: Array<{ queries: string[]; count: number; representative: string }> = [];
    const processedQueries = new Set<number>();

    userQueries.forEach((q, index) => {
      if (processedQueries.has(index)) return;

      const normalized = normalizeQuery(q.query);
      const group: string[] = [q.query];
      processedQueries.add(index);

      // Buscar consultas similares
      userQueries.forEach((otherQ, otherIndex) => {
        if (index === otherIndex || processedQueries.has(otherIndex)) return;

        const otherNormalized = normalizeQuery(otherQ.query);
        
        // Primero verificar si son exactamente iguales (después de normalizar)
        if (normalized === otherNormalized) {
          group.push(otherQ.query);
          processedQueries.add(otherIndex);
        } else {
          // Si no son exactamente iguales, calcular similitud
          const similarity = calculateSimilarity(normalized, otherNormalized);
          if (similarity >= SIMILARITY_THRESHOLD) {
            group.push(otherQ.query);
            processedQueries.add(otherIndex);
          }
        }
      });

      // Solo agregar grupos con más de una consulta
      if (group.length > 1) {
        // Usar la consulta más corta como representante (suele ser más clara)
        const representative = group.reduce((a, b) => a.length <= b.length ? a : b);
        queryGroups.push({
          queries: group,
          count: group.length,
          representative,
        });
      }
    });

    // 5. Ordenar por frecuencia y tomar las top 5
    const similar = queryGroups
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(group => ({
        query: group.representative,
        count: group.count,
        variants: group.queries.length > 1 ? group.queries.length : 0,
      }));

    setSimilarQueries(similar);

    // Actualizar estadísticas de desarrollos con calificaciones
    setDevelopmentStats(prev => prev.map(stat => {
      const devQueries = userQueries.filter(q => 
        q.zone === stat.zone && q.development === stat.development
      );
      const goodRatingsCount = devQueries.filter(q => q.feedback_rating && q.feedback_rating >= 4).length;
      
      // Contar consultas únicas vs totales para detectar repeticiones
      const uniqueQueries = new Set(devQueries.map(q => normalizeQuery(q.query)));
      const similarCount = devQueries.length > uniqueQueries.size ? 
        devQueries.length - uniqueQueries.size : 0;
      
      return {
        ...stat,
        goodRatings: goodRatingsCount,
        similarQueries: similarCount,
      };
    }));
  };

  // Obtener nombre de la zona en español
  const getZoneName = (zone: string): string => {
    const zoneNames: Record<string, string> = {
      'yucatan': 'Yucatán',
      'puebla': 'Puebla',
      'quintana_roo': 'Quintana Roo',
      'cdmx': 'Ciudad de México',
      'jalisco': 'Jalisco',
      'nuevo_leon': 'Nuevo León'
    };
    return zoneNames[zone] || zone;
  };

  // Obtener nombre del tipo de documento en español
  const getDocumentTypeName = (type: string): string => {
    const typeNames: Record<string, string> = {
      'brochure': 'Folleto',
      'policy': 'Política',
      'price': 'Precios',
      'inventory': 'Inventario',
      'floor_plan': 'Plano',
      'amenities': 'Amenidades',
      'legal': 'Legal',
      'faq': 'Preguntas Frecuentes',
      'general': 'General'
    };
    return typeNames[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-capital-navy" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8">
      {/* Header */}
      <div className="pl-0 sm:pl-4">
        <h1 className="text-2xl sm:text-3xl font-bold navy-text">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {isAdmin 
            ? 'Vista administrativa del sistema'
            : 'Resumen de tus desarrollos y actividad'
          }
        </p>
        {error && (
          <div className="mt-3 sm:mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-xs sm:text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>

      {/* Dashboard de Admin */}
      {isAdmin && (
        <>

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

        {/* Calificación Promedio */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calificación Promedio</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">
                {loading ? '...' : error ? '-' : stats?.averageRating ? stats.averageRating.toFixed(1) : 'N/A'}
              </div>
              {stats?.averageRating && stats.averageRating > 0 && (
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-3 w-3 ${
                        star <= Math.round(stats.averageRating)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Promedio de calificaciones
            </p>
          </CardContent>
        </Card>

        {/* Usuarios Activos */}
        {adminStats && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {adminStats.activeUsers}/{adminStats.totalUsers}
              </div>
              <p className="text-xs text-muted-foreground">
                Activos / Total
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Estadísticas Adicionales */}
      {adminStats && (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
          {/* Documentos por Tipo */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-capital-navy" />
                <CardTitle>Documentos por Tipo</CardTitle>
              </div>
              <CardDescription>
                Distribución de documentos en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(adminStats.documentsByType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-sm">{getDocumentTypeName(type)}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                {Object.keys(adminStats.documentsByType).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay documentos aún
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Documentos por Zona */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-capital-navy" />
                <CardTitle>Documentos por Zona</CardTitle>
              </div>
              <CardDescription>
                Distribución geográfica de documentos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(adminStats.documentsByZone)
                  .sort(([, a], [, b]) => b - a)
                  .map(([zone, count]) => (
                    <div key={zone} className="flex items-center justify-between">
                      <span className="text-sm">{getZoneName(zone)}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                {Object.keys(adminStats.documentsByZone).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay documentos aún
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Documentos Recientes */}
      {adminStats && adminStats.recentDocuments.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-capital-navy" />
              <CardTitle>Documentos Recientes</CardTitle>
            </div>
            <CardDescription>
              Últimos documentos subidos al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {adminStats.recentDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.filename}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        <MapPin className="h-3 w-3 mr-1" />
                        {getZoneName(doc.zone)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Building2 className="h-3 w-3 mr-1" />
                        {doc.development}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {doc.type ? getDocumentTypeName(doc.type) : 'N/A'}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground ml-4 flex-shrink-0">
                    {doc.created_at && new Date(doc.created_at).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Consultas Recientes */}
      {adminStats && adminStats.recentQueries.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-capital-navy" />
              <CardTitle>Consultas Recientes</CardTitle>
            </div>
            <CardDescription>
              Últimas consultas realizadas en el sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {adminStats.recentQueries.slice(0, 5).map((query) => (
                <div
                  key={query.id}
                  className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-medium line-clamp-2 mb-2">{query.query}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      <MapPin className="h-3 w-3 mr-1" />
                      {getZoneName(query.zone)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Building2 className="h-3 w-3 mr-1" />
                      {query.development}
                    </Badge>
                    {query.feedback_rating && (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {query.feedback_rating}/5
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(query.created_at).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mejores Respuestas Calificadas */}
      {adminStats && adminStats.topRatedQueries.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-500" />
              <CardTitle>Mejores Respuestas</CardTitle>
            </div>
            <CardDescription>
              Respuestas con calificación perfecta (5/5)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {adminStats.topRatedQueries.map((query) => (
                <AccordionItem 
                  key={query.id} 
                  value={`top-${query.id}`}
                  className="border rounded-lg mb-3 last:mb-0 px-3 sm:px-4 py-2 hover:bg-gray-50 transition-colors"
                >
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-start gap-3 w-full text-left">
                      <div className="flex-shrink-0">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className="h-4 w-4 fill-yellow-400 text-yellow-400"
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 line-clamp-2">
                          {query.query}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-3 w-3 mr-1" />
                            {getZoneName(query.zone)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            <Building2 className="h-3 w-3 mr-1" />
                            {query.development}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4">
                    <div className="ml-7 space-y-3">
                      {query.response && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                          <div className="flex items-start gap-2 mb-3">
                            <Bot className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <h4 className="text-sm font-semibold text-blue-900">Respuesta del Agente</h4>
                          </div>
                          <div className="text-sm">
                            <MarkdownRenderer 
                              content={query.response}
                              sources={query.sources_used?.map((source, idx) => ({
                                filename: source,
                                page: 0,
                                chunk: idx,
                                relevance_score: 0,
                                text_preview: source,
                              }))}
                            />
                          </div>
                        </div>
                      )}
                      {query.feedback_comment && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-green-900 mb-1">Comentario:</p>
                          <p className="text-xs text-green-800">"{query.feedback_comment}"</p>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Mostrador de Exactitud */}
      {adminStats && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <CardTitle>Exactitud de las Respuestas</CardTitle>
            </div>
            <CardDescription>
              Métricas de calidad basadas en calificaciones de usuarios
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adminStats.accuracyStats.totalRated > 0 ? (
              <div className="space-y-4">
                {/* Porcentaje de Exactitud Principal */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Exactitud General</p>
                    <p className="text-3xl font-bold mt-1">
                      {adminStats.accuracyStats.accuracyPercentage}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {adminStats.accuracyStats.totalRated} respuestas calificadas
                    </p>
                  </div>
                  <div className="relative w-24 h-24">
                    <svg className="transform -rotate-90 w-24 h-24">
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-gray-200"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="40"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - adminStats.accuracyStats.accuracyPercentage / 100)}`}
                        className={`${
                          adminStats.accuracyStats.accuracyPercentage >= 80
                            ? 'text-green-600'
                            : adminStats.accuracyStats.accuracyPercentage >= 60
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold">
                        {adminStats.accuracyStats.accuracyPercentage}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Distribución de Calificaciones */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    </div>
                    <p className="text-2xl font-bold text-green-600">{adminStats.accuracyStats.excellent}</p>
                    <p className="text-xs text-muted-foreground">Excelente</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 text-gray-300" />
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{adminStats.accuracyStats.good}</p>
                    <p className="text-xs text-muted-foreground">Buena</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <Star className="h-4 w-4 text-gray-300" />
                      <Star className="h-4 w-4 text-gray-300" />
                    </div>
                    <p className="text-2xl font-bold text-yellow-600">{adminStats.accuracyStats.average}</p>
                    <p className="text-xs text-muted-foreground">Regular</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Star className="h-4 w-4 fill-red-400 text-red-400" />
                      <Star className="h-4 w-4 fill-red-400 text-red-400" />
                      <Star className="h-4 w-4 text-gray-300" />
                      <Star className="h-4 w-4 text-gray-300" />
                      <Star className="h-4 w-4 text-gray-300" />
                    </div>
                    <p className="text-2xl font-bold text-red-600">{adminStats.accuracyStats.poor}</p>
                    <p className="text-xs text-muted-foreground">Pobre</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Aún no hay respuestas calificadas</p>
                <p className="text-sm text-gray-500">
                  Las métricas de exactitud aparecerán cuando los usuarios califiquen las respuestas del agente
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Información del Sistema y Acciones Rápidas */}
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
            <a
              href="/dashboard/documents"
              className="block rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5" />
                <div>
                  <h3 className="font-semibold">Gestionar Documentos</h3>
                  <p className="text-sm text-muted-foreground">
                    Ver y administrar documentos
                  </p>
                </div>
              </div>
            </a>
            <a
              href="/dashboard/users"
              className="block rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5" />
                <div>
                  <h3 className="font-semibold">Gestionar Usuarios</h3>
                  <p className="text-sm text-muted-foreground">
                    Administrar usuarios y permisos
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
              <Badge variant="outline">{llmModel}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Proveedor</span>
              <Badge variant="outline">{currentProvider === 'openai' ? 'OpenAI' : 'LM Studio'}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Vector DB</span>
              <Badge variant="outline">Pinecone</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Database</span>
              <Badge variant="outline">Supabase - PostgreSQL</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Embedding</span>
              <Badge variant="outline">llama-text-embed-v2</Badge>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Estado del Sistema</span>
              <Badge variant={lmStudioStatus === 'available' || openAIStatus === 'available' ? 'default' : 'destructive'}>
                {lmStudioStatus === 'available' || openAIStatus === 'available' ? 'Operativo' : 'Error'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
        </>
      )}

      {/* Dashboard de Usuario Regular */}
      {!isAdmin && (
        <>
          {/* Estadísticas por Desarrollo */}
          {developmentStats.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Mis Desarrollos</h2>
              <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {developmentStats.map((stat, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-capital-navy" />
                        <CardTitle className="text-base sm:text-lg">{stat.development}</CardTitle>
                      </div>
                      <CardDescription className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{getZoneName(stat.zone)}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Documentos
                          </span>
                          <span className="text-lg font-bold">{stat.documentCount}</span>
                        </div>
                        {stat.goodRatings > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                              <Star className="h-4 w-4 text-yellow-500" />
                              Buenas calificaciones
                            </span>
                            <span className="text-lg font-bold text-green-600">{stat.goodRatings}</span>
                          </div>
                        )}
                        {stat.similarQueries > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-blue-500" />
                              Consultas repetidas
                            </span>
                            <span className="text-lg font-bold text-blue-600">{stat.similarQueries}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Respuestas con Buena Calificación */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                <CardTitle>Respuestas con Buena Calificación</CardTitle>
              </div>
              <CardDescription>
                Tus consultas mejor calificadas (4-5 estrellas)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {goodRatings.length > 0 ? (
                <Accordion type="single" collapsible className="w-full">
                  {goodRatings.map((rating) => (
                    <AccordionItem 
                      key={rating.id} 
                      value={`rating-${rating.id}`}
                      className="border rounded-lg mb-3 last:mb-0 px-3 sm:px-4 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-start gap-3 w-full text-left">
                          <div className="flex-shrink-0">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= (rating.feedback_rating || 0)
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 line-clamp-2">
                              {rating.query}
                            </p>
                            {rating.feedback_comment && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                "{rating.feedback_comment}"
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                <MapPin className="h-3 w-3 mr-1" />
                                {getZoneName(rating.zone)}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <Building2 className="h-3 w-3 mr-1" />
                                {rating.development}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2 pb-4">
                        <div className="ml-7 space-y-3">
                          {/* Respuesta del agente */}
                          {rating.response && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                              <div className="flex items-start gap-2 mb-2">
                                <Bot className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <h4 className="text-sm font-semibold text-blue-900">Respuesta del Agente</h4>
                              </div>
                              <div className="text-sm">
                                <MarkdownRenderer 
                                  content={rating.response}
                                  sources={rating.sources_used?.map((source, idx) => ({
                                    filename: source,
                                    page: 0,
                                    chunk: idx,
                                    relevance_score: 0,
                                    text_preview: source,
                                  }))}
                                />
                              </div>
                            </div>
                          )}
                          
                          {/* Fuentes utilizadas */}
                          {rating.sources_used && rating.sources_used.length > 0 && (
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                              <h4 className="text-xs font-semibold text-gray-700 mb-2">Fuentes utilizadas:</h4>
                              <ul className="space-y-1">
                                {rating.sources_used.map((source, idx) => (
                                  <li key={idx} className="text-xs text-gray-600 flex items-center gap-1">
                                    <FileText className="h-3 w-3 flex-shrink-0" />
                                    <span className="break-all">{source}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Información adicional */}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {rating.response_time_ms && (
                              <span className="flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                Tiempo: {(rating.response_time_ms / 1000).toFixed(2)}s
                              </span>
                            )}
                            {rating.tokens_used && (
                              <span className="flex items-center gap-1">
                                Tokens: {rating.tokens_used.toLocaleString()}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              Fecha: {new Date(rating.created_at).toLocaleDateString('es-MX', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Star className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aún no tienes respuestas calificadas</p>
                  <p className="text-xs mt-1">
                    Califica las respuestas del agente para verlas aquí
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Consultas Repetidas o Similares */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <CardTitle>Consultas Repetidas</CardTitle>
              </div>
              <CardDescription>
                Preguntas que has realizado múltiples veces
              </CardDescription>
            </CardHeader>
            <CardContent>
              {similarQueries.length > 0 ? (
                <div className="space-y-3">
                  {similarQueries.map((item, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 line-clamp-2">
                            {item.query}
                          </p>
                        </div>
                        <Badge variant="secondary" className="flex-shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {item.count} {item.count === 1 ? 'vez' : 'veces'}
                          {item.variants && item.variants > 1 && (
                            <span className="ml-1 text-xs opacity-75">
                              ({item.variants} variantes)
                            </span>
                          )}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No hay consultas repetidas</p>
                  <p className="text-xs mt-1">
                    Las preguntas que hagas múltiples veces aparecerán aquí
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mensaje si no hay datos */}
          {developmentStats.length === 0 && goodRatings.length === 0 && similarQueries.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Aún no tienes actividad</p>
                <p className="text-sm text-gray-500">
                  Comienza a consultar al agente para ver tus estadísticas aquí
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

    </div>
  );
}

