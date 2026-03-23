'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, TrendingUp, Users, AlertCircle, Calendar, Database, Clock, Target, TrendingDown, Filter, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import {
  getZohoLeads,
  getZohoDeals,
  getZohoStats,
  getZohoNotesInsightsAI,
  getZohoNotesInsightsStored,
  triggerZohoSync,
  getUserDevelopments,
  type ZohoLead,
  type ZohoDeal,
  type ZohoStats,
  type ZohoNoteForAI,
  type ZohoNotesInsightsResponse
} from '@/lib/api';
import { decodeAccessToken } from '@/lib/auth/auth';
import type { UserRole } from '@/types/documents';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie, ReferenceLine, ComposedChart } from 'recharts';
import { getDevelopmentColors, getChartColor } from '@/lib/utils/development-colors';
import { buildBucketKeys, formatBucketLabel, getBucketKeyForDate, getRollingPeriodDates, toISODateLocal, getPreviousPeriodForCustomRange, type TimePeriod } from '@/lib/utils/time-buckets';
import { logger } from '@/lib/utils/logger';
import { DatePickerWithRange } from '@/components/date-range-picker';
import { DateRange } from 'react-day-picker';


export default function ZohoCRMPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [activeTab, setActiveTab] = useState('stats');

  // Datos
  const [stats, setStats] = useState<ZohoStats | null>(null);
  const [lastMonthStats, setLastMonthStats] = useState<ZohoStats | null>(null);
  // Stats desde backend (incluye Activities/Calls). Lo usamos para KPIs que no podemos calcular solo con leads/deals.
  const [activityStats, setActivityStats] = useState<ZohoStats | null>(null);
  const [activityStatsLoading, setActivityStatsLoading] = useState(false);
  // Insights con IA (on-demand)
  const [aiNotesInsights, setAiNotesInsights] = useState<ZohoNotesInsightsResponse | null>(null);
  const [aiNotesInsightsLoading, setAiNotesInsightsLoading] = useState(false);
  // Último insight guardado (por contexto/filtros) - fuente de verdad para gráficas
  const [storedNotesInsights, setStoredNotesInsights] = useState<ZohoNotesInsightsResponse | null>(null);
  const [storedNotesInsightsLoading, setStoredNotesInsightsLoading] = useState(false);
  const [aiChartsMode, setAiChartsMode] = useState<'themes' | 'objections' | 'friction' | 'actions'>('themes');
  const [leads, setLeads] = useState<ZohoLead[]>([]);
  const [deals, setDeals] = useState<ZohoDeal[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Desarrollos asignados al usuario (para sales_manager)
  const [assignedDevelopments, setAssignedDevelopments] = useState<string[]>([]);

  // Filtros
  const [selectedDesarrollo, setSelectedDesarrollo] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('month');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });
  const [showLastMonth, setShowLastMonth] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Analytics tab
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsSortKey, setAnalyticsSortKey] = useState<string>('total_leads');
  const [analyticsSortAsc, setAnalyticsSortAsc] = useState(false);

  const { toast } = useToast();

  // Verificar rol del usuario y obtener desarrollos asignados
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = decodeAccessToken(token);
      if (payload) {
        setUserRole(payload.role as UserRole);

        // Si es sales_manager, obtener desarrollos asignados
        if (payload.role === 'sales_manager' && payload.userId) {
          getUserDevelopments(payload.userId)
            .then((devs) => {
              // Obtener solo los desarrollos con can_query=true y normalizar nombres
              const normalizedDevs = devs
                .filter((d) => d.can_query)
                .map((d) => d.development)
                .filter((d) => typeof d === 'string' && d.trim().length > 0)
                .map((d) => d.trim());
              setAssignedDevelopments(normalizedDevs);
            })
            .catch((err) => {
              console.error('Error obteniendo desarrollos asignados:', err);
            });
        }
      }
    }
  }, []);

  // Función para normalizar nombres de desarrollos para mostrar (capitalizar primera letra)
  const normalizeDevelopmentDisplay = (name: string): string => {
    if (!name || name.trim().length === 0) return name;
    const trimmed = name.trim();
    // Capitalizar primera letra y dejar el resto en minúsculas
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  };

  // Helper para normalizar fuente de lead (Online Store -> Landing Page)
  const normalizeLeadSource = (source: string | undefined): string => {
    if (!source) return '';
    if (source === 'Online Store') return 'Landing Page';
    return source;
  };

  // Función para comparar desarrollos de forma case-insensitive
  // Envolver en useCallback para mantener referencia estable y evitar recreaciones innecesarias
  const compareDevelopments = useCallback((dev1: string, dev2: string): boolean => {
    if (!dev1 || !dev2) return false;
    return normalizeDevelopmentDisplay(dev1) === normalizeDevelopmentDisplay(dev2);
  }, []);

  // Obtener lista de desarrollos únicos de los datos
  // Para sales_manager, incluir también los desarrollos asignados (incluso si no hay datos)
  // Normalizar nombres para evitar duplicados por diferencias de mayúsculas/minúsculas
  const availableDevelopments = useMemo(() => {
    const developmentsMap = new Map<string, string>(); // Map<normalized, original>

    // Agregar desarrollos de los datos cargados
    leads.forEach(lead => {
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      const leadDesarrollo = lead.Desarrollo || (lead as any).Desarollo;
      if (leadDesarrollo) {
        const normalized = normalizeDevelopmentDisplay(leadDesarrollo);
        // Si ya existe, mantener el original que tenga mejor formato (con mayúscula)
        if (!developmentsMap.has(normalized) ||
          (leadDesarrollo.charAt(0) === leadDesarrollo.charAt(0).toUpperCase() &&
            developmentsMap.get(normalized)?.charAt(0) !== developmentsMap.get(normalized)?.charAt(0).toUpperCase())) {
          developmentsMap.set(normalized, leadDesarrollo);
        }
      }
    });
    deals.forEach(deal => {
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      const dealDesarrollo = deal.Desarrollo || (deal as any).Desarollo;
      if (dealDesarrollo) {
        const normalized = normalizeDevelopmentDisplay(dealDesarrollo);
        // Si ya existe, mantener el original que tenga mejor formato (con mayúscula)
        if (!developmentsMap.has(normalized) ||
          (dealDesarrollo.charAt(0) === dealDesarrollo.charAt(0).toUpperCase() &&
            developmentsMap.get(normalized)?.charAt(0) !== developmentsMap.get(normalized)?.charAt(0).toUpperCase())) {
          developmentsMap.set(normalized, dealDesarrollo);
        }
      }
    });

    // Para sales_manager, agregar también los desarrollos asignados
    // Esto asegura que aparezcan en la lista incluso si no hay datos para algunos
    if (userRole === 'sales_manager' && assignedDevelopments.length > 0) {
      assignedDevelopments.forEach((dev) => {
        const normalized = normalizeDevelopmentDisplay(dev);
        // Si ya existe, mantener el original que tenga mejor formato
        if (!developmentsMap.has(normalized) ||
          (dev.charAt(0) === dev.charAt(0).toUpperCase() &&
            developmentsMap.get(normalized)?.charAt(0) !== developmentsMap.get(normalized)?.charAt(0).toUpperCase())) {
          developmentsMap.set(normalized, dev);
        }
      });
    }

    // Retornar los nombres normalizados ordenados
    return Array.from(developmentsMap.keys()).sort();
  }, [leads, deals, userRole, assignedDevelopments]);

  // Obtener lista de fuentes únicas
  const availableSources = useMemo(() => {
    const sources = new Set<string>();
    leads.forEach(lead => {
      if (lead.Lead_Source) {
        sources.add(normalizeLeadSource(lead.Lead_Source));
      }
    });
    deals.forEach(deal => {
      if (deal.Lead_Source) {
        sources.add(normalizeLeadSource(deal.Lead_Source));
      }
    });
    return Array.from(sources).sort();
  }, [leads, deals]);

  // Obtener lista de asesores únicos
  const availableOwners = useMemo(() => {
    const owners = new Set<string>();
    leads.forEach(lead => {
      if (lead.Owner?.name) {
        owners.add(lead.Owner.name);
      }
    });
    deals.forEach(deal => {
      if (deal.Owner?.name) {
        owners.add(deal.Owner.name);
      }
    });
    return Array.from(owners).sort();
  }, [leads, deals]);

  // Obtener lista de estados únicos
  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>();
    leads.forEach(lead => {
      if (lead.Lead_Status) {
        statuses.add(lead.Lead_Status);
      }
    });
    deals.forEach(deal => {
      if (deal.Stage) {
        statuses.add(deal.Stage);
      }
    });
    return Array.from(statuses).sort();
  }, [leads, deals]);

  // Obtener colores personalizados según el desarrollo seleccionado
  const colors = useMemo(() => {
    return getDevelopmentColors(selectedDesarrollo);
  }, [selectedDesarrollo]);

  // Calcular fechas según el periodo seleccionado (rangos de calendario)
  // Calcular fechas según el periodo seleccionado (rangos de calendario)
  const getPeriodDates = useCallback((period: TimePeriod, isLastPeriod: boolean = false) => {
    if (period === 'custom') {
      if (!customDateRange || !customDateRange.from) {
        // Fallback default
        return getRollingPeriodDates('month', isLastPeriod);
      }
      const start = customDateRange.from;
      const end = customDateRange.to || customDateRange.from;

      if (!isLastPeriod) {
        return { startDate: start, endDate: end };
      } else {
        // Calculate previous period for custom range
        return getPreviousPeriodForCustomRange(start, end);
      }
    }
    // Calendar ranges:
    // - week: Mon -> Sun of current week
    // - month: 1st -> last day of current month
    // - quarter: start -> end of current quarter
    // - year: Jan 1 -> Dec 31 of current year
    return getRollingPeriodDates(period, isLastPeriod);
  }, [customDateRange]);

  // Si cambian filtros, invalidamos el resultado de IA (evita mostrar insights de otro periodo)
  useEffect(() => {
    setAiNotesInsights(null);
  }, [selectedDesarrollo, selectedSource, selectedOwner, selectedStatus, selectedPeriod, showLastMonth]);

  // =====================================================
  // BACKEND STATS (ACTIVITIES/CALLS)
  // =====================================================
  // Nota: el endpoint `/api/zoho/stats` incluye Activities (Call/Task).
  // Lo pedimos con filtros de periodo + desarrollo para poder mostrar "cantidad de llamadas".
  useEffect(() => {
    let cancelled = false;

    const loadActivityStats = async () => {
      try {
        // Solo pedir cuando estamos en las pestañas que lo usan (stats + executive).
        // Esto evita llamadas innecesarias cuando el usuario está viendo listas (leads/deals).
        if (activeTab !== 'stats' && activeTab !== 'executive') return;

        const { startDate, endDate } = getPeriodDates(selectedPeriod, showLastMonth);
        const debugZohoStats =
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('debugZohoStats') === '1';

        // Importante UX:
        // - Al cambiar de periodo/filtros, NO queremos mostrar el embudo del periodo anterior mientras carga.
        // - Limpiamos activityStats para forzar fallback a los cálculos locales (o a 0 si no hay datos).
        if (!cancelled) setActivityStats(null);
        setActivityStatsLoading(true);
        const data = await getZohoStats({
          desarrollo: selectedDesarrollo === 'all' ? undefined : selectedDesarrollo,
          source: selectedSource.length === 0 ? undefined : selectedSource.join(','),
          owner: selectedOwner.length === 0 ? undefined : selectedOwner.join(','),
          status: selectedStatus.length === 0 ? undefined : selectedStatus.join(','),
          startDate,
          endDate,
          debug: debugZohoStats,
        });
        if (!cancelled) setActivityStats(data);
      } catch (e) {
        // No mostramos toast para evitar "spam" cuando se cambian filtros.
        logger.error('Error loading activity stats:', e);
        if (!cancelled) setActivityStats(null);
      } finally {
        if (!cancelled) setActivityStatsLoading(false);
      }
    };

    loadActivityStats();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    getPeriodDates,
    selectedDesarrollo,
    selectedOwner,
    selectedPeriod,
    selectedSource,
    selectedStatus,
    showLastMonth,
  ]);

  // =====================================================
  // INSIGHTS DE NOTAS (TOP PALABRAS + TENDENCIA)
  // =====================================================
  const notesInsights = useMemo(() => {
    // Small helpers (kept inside useMemo to avoid extra re-renders)
    const normalizeText = (input: string) => {
      // English code + comments:
      // - Lowercase
      // - Remove accents
      // - Replace non-letters/numbers with space
      return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const stripNoise = (input: string) => {
      // English code + comments:
      // Remove common "noise" patterns that shouldn't influence insights:
      // - URLs (including Aircall recording links)
      // - Typical Aircall recording template text
      // - Extra whitespace
      return input
        .replace(/find\s+recording\s+here\s*:?\s*https?:\/\/\S+/gi, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/aircall/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Minimal Spanish stopwords list (extend as needed)
    const STOPWORDS = new Set([
      'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo',
      'como', 'mas', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'si', 'porque', 'esta', 'son', 'entre', 'cuando', 'muy', 'sin', 'sobre',
      'tambien', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'todos', 'uno', 'les', 'ni', 'contra',
      'otros', 'ese', 'eso', 'ante', 'ellos', 'e', 'esto', 'mi', 'mis', 'tu', 'tus', 'te', 'usted', 'ustedes', 'hoy', 'ayer', 'manana',
      'cliente', 'clientes', 'lead', 'leads', 'deal', 'deals', 'cita', 'visita', 'whatsapp', 'mensaje', 'llamada', 'llamadas',
      'contacto', 'contactar', 'info', 'informacion', 'datos', 'telefono', 'correo', 'email', 'nombre', 'precio', 'mxn', 'peso', 'pesos',
      // English/common templates
      'find', 'recording', 'here', 'call', 'calls', 'assets',
    ]);

    const tokenize = (input: string) => {
      const normalized = normalizeText(input);
      if (!normalized) return [];
      return normalized
        .split(' ')
        .filter(w => w.length >= 3) // ignore very short tokens
        .filter(w => !STOPWORDS.has(w))
        .filter(w => !/^\d+$/.test(w)); // ignore numbers only
    };

    const getNoteText = (note: any) => {
      const title = typeof note?.Note_Title === 'string' ? note.Note_Title : '';
      const content = typeof note?.Note_Content === 'string' ? note.Note_Content : '';
      return stripNoise(`${title} ${content}`.trim());
    };

    const { startDate: rangeStartDate, endDate: rangeEndDate } = getPeriodDates(selectedPeriod, showLastMonth);

    const filteredLeads = leads.filter((lead) => {
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (!createdTime) return false;
      const leadDate = new Date(createdTime);
      if (leadDate < rangeStartDate || leadDate > rangeEndDate) return false;

      if (selectedDesarrollo !== 'all') {
        const leadDesarrollo = lead.Desarrollo || (lead as any).Desarollo;
        if (!compareDevelopments(leadDesarrollo, selectedDesarrollo)) return false;
      }
      if (selectedSource.length > 0 && !selectedSource.includes(normalizeLeadSource(lead.Lead_Source))) return false;
      if (selectedOwner.length > 0 && !selectedOwner.includes(lead.Owner?.name || '')) return false;
      if (selectedStatus.length > 0 && !selectedStatus.includes(lead.Lead_Status || '')) return false;
      return true;
    });

    const filteredDeals = deals.filter((deal) => {
      const dealCreatedTime = deal.Created_Time || (deal as any).Creacion_de_Deal;
      if (!dealCreatedTime) return false;
      const dealDate = new Date(dealCreatedTime);
      if (dealDate < rangeStartDate || dealDate > rangeEndDate) return false;

      if (selectedDesarrollo !== 'all') {
        const dealDesarrollo = deal.Desarrollo || (deal as any).Desarollo;
        if (!compareDevelopments(dealDesarrollo, selectedDesarrollo)) return false;
      }
      if (selectedSource.length > 0 && !selectedSource.includes(normalizeLeadSource(deal.Lead_Source))) return false;
      if (selectedOwner.length > 0 && !selectedOwner.includes(deal.Owner?.name || '')) return false;
      if (selectedStatus.length > 0 && !selectedStatus.includes(deal.Stage || '')) return false;
      return true;
    });

    // Collect notes with metadata (for AI + for better slicing later)
    const leadNoteItems = filteredLeads.flatMap((lead: any) => {
      const leadDesarrollo = lead.Desarrollo || (lead as any).Desarollo;
      const leadOwner = lead.Owner?.name;
      const leadStatus = lead.Lead_Status;
      const notes = Array.isArray(lead.Notes) ? lead.Notes : [];
      return notes.map((note: any) => ({
        source: 'lead' as const,
        createdTime: note?.Created_Time || (lead as any).Creacion_de_Lead || lead.Created_Time,
        desarrollo: leadDesarrollo,
        owner: leadOwner,
        statusOrStage: leadStatus,
        note,
      }));
    });

    const dealNoteItems = filteredDeals.flatMap((deal: any) => {
      const dealDesarrollo = deal.Desarrollo || (deal as any).Desarollo;
      const dealOwner = deal.Owner?.name;
      const dealStage = deal.Stage;
      const notes = Array.isArray(deal.Notes) ? deal.Notes : [];
      return notes.map((note: any) => ({
        source: 'deal' as const,
        createdTime: note?.Created_Time || deal.Created_Time || (deal as any).Creacion_de_Deal,
        desarrollo: dealDesarrollo,
        owner: dealOwner,
        statusOrStage: dealStage,
        note,
      }));
    });

    const allNoteItems = [...leadNoteItems, ...dealNoteItems];
    const leadNotesCount = leadNoteItems.length;
    const dealNotesCount = dealNoteItems.length;

    // Build term frequency
    const termCounts = new Map<string, number>();
    allNoteItems.forEach((item: any) => {
      const text = getNoteText(item.note);
      const words = tokenize(text);
      words.forEach((w) => {
        termCounts.set(w, (termCounts.get(w) || 0) + 1);
      });
    });

    const topTerms = Array.from(termCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }));

    const trendTerms = topTerms.slice(0, 3).map(t => t.term);
    const bucketKeys = buildBucketKeys(selectedPeriod, rangeStartDate, rangeEndDate);

    // Pre-create rows for all buckets so charts always have a stable number of points.
    const trendMap = new Map<string, Record<string, number | string>>();
    for (const b of bucketKeys) {
      const row = { bucket: b } as Record<string, number | string>;
      for (const term of trendTerms) row[term] = 0;
      trendMap.set(b, row);
    }

    allNoteItems.forEach((item: any) => {
      const created = (typeof item?.createdTime === 'string' && item.createdTime) ? item.createdTime : null;
      if (!created) return;
      const createdDate = new Date(created);
      if (Number.isNaN(createdDate.getTime())) return;
      const bucket = getBucketKeyForDate(createdDate, selectedPeriod, rangeStartDate);
      const row = trendMap.get(bucket);
      if (!row) return;
      const text = getNoteText(item.note);
      const words = tokenize(text);
      trendTerms.forEach((term) => {
        const occurrences = words.reduce((acc, w) => acc + (w === term ? 1 : 0), 0);
        if (occurrences > 0) {
          const prev = typeof row[term] === 'number' ? row[term] : 0;
          row[term] = prev + occurrences;
        }
      });
    });

    const trend = bucketKeys.map((b) => trendMap.get(b) as Record<string, number | string>);

    // Notes payload for AI (cleaned + compact)
    const notesForAI: ZohoNoteForAI[] = allNoteItems
      .map((item: any) => {
        const text = getNoteText(item.note);
        return {
          source: item.source,
          createdTime: item.createdTime,
          desarrollo: item.desarrollo,
          owner: item.owner,
          statusOrStage: item.statusOrStage,
          text,
        };
      })
      .filter((n) => n.text && n.text.length >= 8); // avoid very short notes

    return {
      totalNotes: allNoteItems.length,
      totalLeadNotes: leadNotesCount,
      totalDealNotes: dealNotesCount,
      topTerms,
      trendTerms,
      trend,
      notesForAI,
    };
  }, [
    compareDevelopments,
    deals,
    getPeriodDates,
    leads,
    selectedDesarrollo,
    selectedOwner,
    selectedPeriod,
    selectedSource,
    selectedStatus,
    showLastMonth,
  ]);

  // Build bar chart data from stored IA insights (meaningful labels instead of raw tokens)
  const aiBarChartData = useMemo(() => {
    if (!storedNotesInsights) return [];
    const pick =
      aiChartsMode === 'themes'
        ? storedNotesInsights.topThemes
        : aiChartsMode === 'objections'
          ? storedNotesInsights.topObjections
          : aiChartsMode === 'friction'
            ? storedNotesInsights.frictionSignals
            : storedNotesInsights.nextActions;

    if (!Array.isArray(pick)) return [];

    return pick
      .slice(0, 10)
      .map((x) => ({
        label: x.label,
        count: x.count,
      }));
  }, [aiChartsMode, storedNotesInsights]);

  // Cargar insight guardado para el contexto actual (para que las gráficas "concuerden" con la IA)
  useEffect(() => {
    let cancelled = false;

    const loadStored = async () => {
      try {
        setStoredNotesInsightsLoading(true);
        const { startDate, endDate } = getPeriodDates(selectedPeriod, showLastMonth);
        const data = await getZohoNotesInsightsStored({
          period: selectedPeriod,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          desarrollo: selectedDesarrollo === 'all' ? undefined : selectedDesarrollo,
          source: selectedSource.length === 0 ? undefined : selectedSource.join(','),
          owner: selectedOwner.length === 0 ? undefined : selectedOwner.join(','),
          status: selectedStatus.length === 0 ? undefined : selectedStatus.join(','),
        });
        if (!cancelled) setStoredNotesInsights(data);
      } catch (e) {
        // No toast para evitar ruido al cambiar filtros
        logger.error('Error loading stored notes insights:', e);
        if (!cancelled) setStoredNotesInsights(null);
      } finally {
        if (!cancelled) setStoredNotesInsightsLoading(false);
      }
    };

    // Solo intentamos cargar cuando estamos en las pestañas que lo muestran (stats + executive).
    if (activeTab === 'stats' || activeTab === 'executive') {
      loadStored();
    }

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    getPeriodDates,
    selectedDesarrollo,
    selectedOwner,
    selectedPeriod,
    selectedSource,
    selectedStatus,
    showLastMonth,
  ]);

  // Cargar analytics solo cuando el tab esté activo
  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      if (activeTab !== 'analytics') return;
      setAnalyticsLoading(true);
      try {
        const token = localStorage.getItem('accessToken');
        const { startDate, endDate } = getPeriodDates(selectedPeriod, false);
        const params = new URLSearchParams({ type: 'all' });
        if (selectedDesarrollo && selectedDesarrollo !== 'all') params.set('desarrollo', selectedDesarrollo);
        if (selectedOwner.length > 0) params.set('owner', selectedOwner[0]);
        if (startDate) params.set('startDate', startDate.toISOString());
        if (endDate) params.set('endDate', endDate.toISOString());

        const res = await fetch(`/api/zoho/analytics?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled && json.success) {
          setAnalyticsData(json.data);
        }
      } catch (e) {
        logger.error('Error loading analytics:', e);
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    };

    loadAnalytics();
    return () => { cancelled = true; };
  }, [activeTab, getPeriodDates, selectedDesarrollo, selectedOwner, selectedPeriod]);

  const handleGenerateAINotesInsights = async () => {
    try {
      if (notesInsights.notesForAI.length === 0) {
        toast({
          title: 'Sin notas suficientes',
          description: 'No hay notas suficientes en el periodo seleccionado para generar insights con IA.',
          variant: 'destructive',
        });
        return;
      }

      setAiNotesInsightsLoading(true);
      setAiNotesInsights(null);

      const { startDate, endDate } = getPeriodDates(selectedPeriod, showLastMonth);

      const result = await getZohoNotesInsightsAI({
        notes: notesInsights.notesForAI,
        context: {
          period: selectedPeriod,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          desarrollo: selectedDesarrollo === 'all' ? undefined : selectedDesarrollo,
          source: selectedSource.length === 0 ? undefined : selectedSource.join(','),
          owner: selectedOwner.length === 0 ? undefined : selectedOwner.join(','),
          status: selectedStatus.length === 0 ? undefined : selectedStatus.join(','),
        },
        regenerate: true,
      });

      setAiNotesInsights(result);
      // La API ahora persiste el resultado: actualizar también el "stored" (fuente para gráficas)
      setStoredNotesInsights(result);
      toast({
        title: 'Insights generados',
        description: 'La IA generó insights a partir de las notas.',
      });
    } catch (e) {
      logger.error('Error generating AI notes insights:', e);
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudieron generar insights con IA.',
        variant: 'destructive',
      });
    } finally {
      setAiNotesInsightsLoading(false);
    }
  };

  // Función helper para calcular estadísticas en memoria (sin llamadas a API)
  const calculateStatsFromData = useCallback((
    allLeads: ZohoLead[],
    allDeals: ZohoDeal[],
    period: TimePeriod,
    isLastPeriod: boolean,
    desarrollo?: string,
    source?: string[],
    owner?: string[],
    status?: string[],
    overrideEndDate?: Date,
    customRange?: DateRange
  ): ZohoStats => {
    let startDate: Date;
    let initialEndDate: Date;

    if (period === 'custom' && customRange?.from) {
      const start = customRange.from;
      const end = customRange.to || customRange.from;

      if (!isLastPeriod) {
        startDate = start;
        initialEndDate = end;
      } else {
        const prev = getPreviousPeriodForCustomRange(start, end);
        startDate = prev.startDate;
        initialEndDate = prev.endDate;
      }
    } else {
      const dates = getPeriodDates(period, isLastPeriod);
      startDate = dates.startDate;
      initialEndDate = dates.endDate;
    }

    let endDate = initialEndDate;
    if (overrideEndDate) {
      endDate = overrideEndDate;
    }

    // Helper: identificar "Cerrado Ganado" por etapa (compatible con variantes)
    const wonStages = ['Ganado', 'Won', 'Cerrado Ganado'];
    const isWonStage = (stage?: string): boolean => {
      const s = String(stage || '').toLowerCase();
      return wonStages.some((k) => s.includes(k.toLowerCase()));
    };


    // Helpers de fechas localizados
    const BUSINESS_UTC_OFFSET_MINUTES = -360;
    const offsetMs = BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000;

    // Convert Date -> YYYY-MM-DD en una zona fija (business)
    const toBusinessISODate = (date: Date): string => {
      const local = new Date(date.getTime() + offsetMs);
      const yyyy = local.getUTCFullYear();
      const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(local.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const extractISODateKey = (value: unknown): string | null => {
      if (!value) return null;
      if (typeof value === 'string') {
        const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
        if (m) return m[1];
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return toBusinessISODate(d);
        return null;
      }
      if (value instanceof Date) return toBusinessISODate(value);
      return null;
    };

    const isDateKeyInRange = (key: string | null, startKey: string | null, endKey: string | null): boolean => {
      if (!key) return false;
      if (startKey && key < startKey) return false;
      if (endKey && key > endKey) return false;
      return true;
    };




    const getDealClosedWonDateKey = (deal: ZohoDeal): string | null => {
      return (
        extractISODateKey(deal.Closing_Date) ||
        extractISODateKey((deal as any).Closed_Time) ||
        extractISODateKey((deal as any).Closed_Date) ||
        extractISODateKey(deal.Modified_Time)
      );
    };



    // Aplicar filtros en memoria
    const filteredLeads = allLeads.filter(lead => {
      // Filtro de fecha
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (!createdTime) return false;
      const leadDate = new Date(createdTime);
      if (leadDate < startDate || leadDate > endDate) return false;

      // Filtro de desarrollo
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      if (desarrollo && desarrollo !== 'all') {
        const leadDesarrollo = lead.Desarrollo || (lead as any).Desarollo;
        if (!compareDevelopments(leadDesarrollo, desarrollo)) return false;
      }

      // Filtro de fuente
      if (source && source.length > 0 && !source.includes(normalizeLeadSource(lead.Lead_Source))) return false;

      // Filtro de asesor
      if (owner && owner.length > 0 && !owner.includes(lead.Owner?.name || '')) return false;

      // Filtro de estado
      if (status && status.length > 0 && !status.includes(lead.Lead_Status || '')) return false;

      return true;
    });

    // Diagnóstico: contadores para entender por qué se excluyen deals
    const dealExclusionReasons = {
      noCreatedTime: 0,
      dateOutOfRange: 0,
      desarrolloMismatch: 0,
      sourceMismatch: 0,
      ownerMismatch: 0,
      statusMismatch: 0,
      totalExcluded: 0
    };

    const filteredDeals = allDeals.filter(deal => {
      // Filtro de fecha - usar Created_Time o buscar en JSONB si no existe
      const dealCreatedTime = deal.Created_Time || (deal as any).Creacion_de_Deal;
      if (!dealCreatedTime) {
        dealExclusionReasons.noCreatedTime++;
        return false;
      }
      const dealDate = new Date(dealCreatedTime);
      if (Number.isNaN(dealDate.getTime())) {
        dealExclusionReasons.noCreatedTime++;
        return false;
      }
      if (dealDate < startDate || dealDate > endDate) {
        dealExclusionReasons.dateOutOfRange++;
        return false;
      }

      // Filtro de desarrollo
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      if (desarrollo && desarrollo !== 'all') {
        const dealDesarrollo = deal.Desarrollo || (deal as any).Desarollo;
        if (!compareDevelopments(dealDesarrollo, desarrollo)) {
          dealExclusionReasons.desarrolloMismatch++;
          return false;
        }
      }

      // Filtro de fuente
      if (source && source.length > 0 && !source.includes(normalizeLeadSource(deal.Lead_Source))) {
        dealExclusionReasons.sourceMismatch++;
        return false;
      }

      // Filtro de asesor
      if (owner && owner.length > 0 && !owner.includes(deal.Owner?.name || '')) {
        dealExclusionReasons.ownerMismatch++;
        return false;
      }

      // Filtro de estado
      if (status && status.length > 0 && !status.includes(deal.Stage || '')) {
        dealExclusionReasons.statusMismatch++;
        return false;
      }

      return true;
    });

    dealExclusionReasons.totalExcluded = allDeals.length - filteredDeals.length;

    // Cerrado Ganado por fecha de cierre:
    // - NO usamos filteredDeals (porque está filtrado por Created_Time)
    // - Un deal puede crearse en un mes y cerrarse ganado en otro
    const startKey = toISODateLocal(startDate);
    const endKey = toISODateLocal(endDate);
    const closedWonByCloseDate = allDeals.filter((deal) => {
      // Reaplicar los mismos filtros NO temporales (desarrollo, fuente, asesor, status)
      if (desarrollo && desarrollo !== 'all') {
        const dealDesarrollo = deal.Desarrollo || (deal as any).Desarollo;
        if (dealDesarrollo !== desarrollo) return false;
      }
      if (source && source.length > 0 && !source.includes(normalizeLeadSource(deal.Lead_Source))) return false;
      if (owner && owner.length > 0 && !owner.includes(deal.Owner?.name || '')) return false;
      if (status && status.length > 0 && !status.includes(deal.Stage || '')) return false;

      if (!isWonStage(deal.Stage)) return false;
      const closeKey = getDealClosedWonDateKey(deal);
      return isDateKeyInRange(closeKey, startKey, endKey);
    }).length;

    // Debug: Log para verificar filtrado
    console.log(`🔍 Filtros aplicados - Leads: ${filteredLeads.length}/${allLeads.length}, Deals: ${filteredDeals.length}/${allDeals.length}`, {
      periodo: period,
      desarrollo,
      source,
      owner,
      status,
      fechaInicio: startDate.toISOString(),
      fechaFin: endDate.toISOString(),
      razonesExclusionDeals: dealExclusionReasons
    });

    // Log adicional para deals excluidos (solo si hay muchos excluidos)
    if (dealExclusionReasons.totalExcluded > 0) {
      console.log(`⚠️ Deals excluidos del embudo: ${dealExclusionReasons.totalExcluded} de ${allDeals.length}`, {
        sinCreatedTime: dealExclusionReasons.noCreatedTime,
        fechaFueraRango: dealExclusionReasons.dateOutOfRange,
        desarrolloNoCoincide: dealExclusionReasons.desarrolloMismatch,
        fuenteNoCoincide: dealExclusionReasons.sourceMismatch,
        asesorNoCoincide: dealExclusionReasons.ownerMismatch,
        estadoNoCoincide: dealExclusionReasons.statusMismatch
      });
    }

    // Calcular estadísticas básicas
    const leadsByStatus: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const status = lead.Lead_Status || 'Sin Estado';
      leadsByStatus[status] = (leadsByStatus[status] || 0) + 1;
    });

    const dealsByStage: Record<string, number> = {};
    let totalDealValue = 0;
    filteredDeals.forEach(deal => {
      const stage = deal.Stage || 'Sin Etapa';
      dealsByStage[stage] = (dealsByStage[stage] || 0) + 1;
      if (deal.Amount) {
        totalDealValue += deal.Amount;
      }
    });

    const averageDealValue = filteredDeals.length > 0
      ? totalDealValue / filteredDeals.length
      : 0;

    // Estadísticas por desarrollo (normalizar nombres para evitar duplicados)
    const leadsByDevelopment: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      const desarrolloRaw = lead.Desarrollo || (lead as any).Desarollo || 'Sin Desarrollo';
      const desarrollo = desarrolloRaw === 'Sin Desarrollo' ? 'Sin Desarrollo' : normalizeDevelopmentDisplay(desarrolloRaw);
      leadsByDevelopment[desarrollo] = (leadsByDevelopment[desarrollo] || 0) + 1;
    });

    const dealsByDevelopment: Record<string, number> = {};
    const dealValueByDevelopment: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      // Zoho tiene un error de tipeo: usa "Desarollo" en lugar de "Desarrollo"
      const desarrolloRaw = deal.Desarrollo || (deal as any).Desarollo || 'Sin Desarrollo';
      const desarrollo = desarrolloRaw === 'Sin Desarrollo' ? 'Sin Desarrollo' : normalizeDevelopmentDisplay(desarrolloRaw);
      dealsByDevelopment[desarrollo] = (dealsByDevelopment[desarrollo] || 0) + 1;
      if (deal.Amount) {
        dealValueByDevelopment[desarrollo] = (dealValueByDevelopment[desarrollo] || 0) + deal.Amount;
      }
    });

    // Estadísticas temporales (bucketizadas según periodo)
    // month   -> cada 2 días (15 puntos)
    // quarter -> semanal (13 puntos)
    // year    -> mensual (12 puntos)
    const bucketKeys = buildBucketKeys(period, startDate, endDate);

    const leadsByDateCounts: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (!createdTime) return;
      const d = new Date(createdTime);
      if (Number.isNaN(d.getTime())) return;
      const bucket = getBucketKeyForDate(d, period, startDate);
      leadsByDateCounts[bucket] = (leadsByDateCounts[bucket] || 0) + 1;
    });

    const dealsByDateCounts: Record<string, number> = {};
    const dealValueByDateCounts: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      const dealCreatedTime = deal.Created_Time || (deal as any).Creacion_de_Deal;
      if (!dealCreatedTime) return;
      const d = new Date(dealCreatedTime);
      if (Number.isNaN(d.getTime())) return;
      const bucket = getBucketKeyForDate(d, period, startDate);
      dealsByDateCounts[bucket] = (dealsByDateCounts[bucket] || 0) + 1;
      if (deal.Amount) {
        dealValueByDateCounts[bucket] = (dealValueByDateCounts[bucket] || 0) + deal.Amount;
      }
    });

    const leadsByDate: Record<string, number> = {};
    const dealsByDate: Record<string, number> = {};
    const dealValueByDate: Record<string, number> = {};
    bucketKeys.forEach((b) => {
      leadsByDate[b] = leadsByDateCounts[b] || 0;
      dealsByDate[b] = dealsByDateCounts[b] || 0;
      dealValueByDate[b] = dealValueByDateCounts[b] || 0;
    });

    // Embudos
    const leadsFunnel: Record<string, number> = {};
    Object.entries(leadsByStatus)
      .sort(([, a], [, b]) => b - a)
      .forEach(([status, count]) => {
        leadsFunnel[status] = count;
      });

    const dealsFunnel: Record<string, number> = {};
    Object.entries(dealsByStage)
      .sort(([, a], [, b]) => b - a)
      .forEach(([stage, count]) => {
        dealsFunnel[stage] = count;
      });

    // Motivos de descarte
    const leadsDiscardReasons: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const motivo = (lead as any).Raz_n_de_descarte || lead.Motivo_Descarte;
      if (motivo) {
        leadsDiscardReasons[motivo] = (leadsDiscardReasons[motivo] || 0) + 1;
      }
    });

    const dealsDiscardReasons: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      if (deal.Motivo_Descarte) {
        dealsDiscardReasons[deal.Motivo_Descarte] = (dealsDiscardReasons[deal.Motivo_Descarte] || 0) + 1;
      }
    });

    // KPIs básicos
    const conversionRate = filteredLeads.length > 0
      ? Math.round((filteredDeals.length / filteredLeads.length) * 10000) / 100
      : 0;

    const discardedLeads = Object.values(leadsDiscardReasons).reduce((sum, count) => sum + count, 0);
    const discardedLeadsPercentage = filteredLeads.length > 0
      ? Math.round((discardedLeads / filteredLeads.length) * 10000) / 100
      : 0;

    // Estadísticas por fuente
    const leadsBySource: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const source = normalizeLeadSource(lead.Lead_Source) || 'Sin Fuente';
      leadsBySource[source] = (leadsBySource[source] || 0) + 1;
    });

    const dealsBySource: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      const source = normalizeLeadSource(deal.Lead_Source) || 'Sin Fuente';
      dealsBySource[source] = (dealsBySource[source] || 0) + 1;
    });

    const conversionBySource: Record<string, number> = {};
    Object.keys({ ...leadsBySource, ...dealsBySource }).forEach(source => {
      const leadsCount = leadsBySource[source] || 0;
      const dealsCount = dealsBySource[source] || 0;
      conversionBySource[source] = leadsCount > 0
        ? Math.round((dealsCount / leadsCount) * 10000) / 100
        : 0;
    });

    // Estadísticas por asesor
    const leadsByOwner: Record<string, number> = {};
    filteredLeads.forEach(lead => {
      const owner = lead.Owner?.name || 'Sin Asesor';
      leadsByOwner[owner] = (leadsByOwner[owner] || 0) + 1;
    });

    const dealsByOwner: Record<string, number> = {};
    filteredDeals.forEach(deal => {
      const owner = deal.Owner?.name || 'Sin Asesor';
      dealsByOwner[owner] = (dealsByOwner[owner] || 0) + 1;
    });

    // Calcular tiempo promedio a primer contacto (REPORTE-ALINEADO):
    // - Filter: lead CREATED within 08:30-20:30 (any day)
    // - Metric: time to first contact in REAL minutes (24/7), not "business minutes"
    let totalTimeToFirstContact = 0;
    let countWithFirstContact = 0;
    const businessStart = 8 * 60 + 30; // 08:30 in minutes
    const businessEnd = 20 * 60 + 30; // 20:30 in minutes



    const getLocalParts = (date: Date) => {
      const local = new Date(date.getTime() + offsetMs);
      return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth(),
        day: local.getUTCDate(),
        dow: local.getUTCDay(),
        hour: local.getUTCHours(),
        minute: local.getUTCMinutes(),
      };
    };

    const isCreatedWithinBusinessHours = (date: Date) => {
      const p = getLocalParts(date);
      const minutes = p.hour * 60 + p.minute;
      return minutes >= businessStart && minutes <= businessEnd;
    };

    filteredLeads.forEach(lead => {
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      const firstContactTime = (lead as any).First_Contact_Time || (lead as any).Ultimo_conctacto;
      const tiempoEntreContacto = (lead as any).Tiempo_entre_primer_contacto;

      if (createdTime) {
        const created = new Date(createdTime);
        if (Number.isNaN(created.getTime())) return;

        // Filter by CREATED time within business hours (08:30-20:30, any day).
        if (!isCreatedWithinBusinessHours(created)) return;

        // Prefer Zoho-provided minutes if available.
        if (tiempoEntreContacto !== null && tiempoEntreContacto !== undefined) {
          const parsed = typeof tiempoEntreContacto === 'number' ? tiempoEntreContacto : parseFloat(tiempoEntreContacto);
          if (!Number.isFinite(parsed)) return;
          if (parsed > 0 && parsed < 100000) {
            totalTimeToFirstContact += parsed;
            countWithFirstContact++;
          }
          return;
        }

        // Otherwise compute from timestamps.
        if (!firstContactTime) return;
        const firstContact = new Date(firstContactTime);
        if (Number.isNaN(firstContact.getTime())) return;

        const diffMinutes = (firstContact.getTime() - created.getTime()) / (1000 * 60);
        if (diffMinutes > 0 && diffMinutes < 100000) {
          totalTimeToFirstContact += diffMinutes;
          countWithFirstContact++;
        }
      }
    });

    const averageTimeToFirstContact = countWithFirstContact > 0
      ? Math.round((totalTimeToFirstContact / countWithFirstContact) * 10) / 10
      : 0;

    // Leads fuera de horario laboral (08:00-20:30)
    let leadsOutsideBusinessHours = 0;
    filteredLeads.forEach(lead => {
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (createdTime) {
        const date = new Date(createdTime);
        const hour = date.getHours();
        const minute = date.getMinutes();
        const timeInMinutes = hour * 60 + minute;
        const businessStart = 8 * 60; // 08:00
        const businessEnd = 20 * 60 + 30; // 20:30
        if (timeInMinutes < businessStart || timeInMinutes > businessEnd) {
          leadsOutsideBusinessHours++;
        }
      }
    });
    const leadsOutsideBusinessHoursPercentage = filteredLeads.length > 0
      ? Math.round((leadsOutsideBusinessHours / filteredLeads.length) * 10000) / 100
      : 0;

    // Leads de calidad (Solicitud de visita/cita + Estado Contactado) + Deals originados en el periodo
    let qualityLeads = 0;
    const qualityLeadsBySource: Record<string, number> = {};

    // 1. Leads
    filteredLeads.forEach(lead => {
      const solicitoVisitaCita = (lead as any).Solicito_visita_cita;
      const status = lead.Lead_Status || '';
      // Status must contain "Contactado" (case insensitive)
      const isContacted = status.toLowerCase().includes('contactado');

      if (solicitoVisitaCita && isContacted) {
        qualityLeads++;
        const source = normalizeLeadSource(lead.Lead_Source) || 'Sin Fuente';
        qualityLeadsBySource[source] = (qualityLeadsBySource[source] || 0) + 1;
      }
    });

    // 2. Deals (originados de leads creados en este periodo)
    filteredDeals.forEach(deal => {
      // Check if original lead was created in this period
      // Try to find Lead Creation Time on the deal
      const leadCreatedStr = (deal as any).Creacion_de_Lead || deal.Created_Time; // Fallback to deal creation if missing

      let isOriginLeadInPeriod = false;
      if (leadCreatedStr) {
        // Re-use the existing date range check
        const d = new Date(leadCreatedStr);
        if (!Number.isNaN(d.getTime())) {
          const key = extractISODateKey(d);
          // We need to check if this key is within startDate/endDate
          // Convert startDate/endDate to keys for comparison
          const startKey = toBusinessISODate(startDate);
          const endKey = toBusinessISODate(endDate);
          if (isDateKeyInRange(key, startKey, endKey)) {
            isOriginLeadInPeriod = true;
          }
        }
      }

      if (isOriginLeadInPeriod) {
        qualityLeads++;
        const source = normalizeLeadSource(deal.Lead_Source) || 'Sin Fuente';
        qualityLeadsBySource[source] = (qualityLeadsBySource[source] || 0) + 1;
      }
    });

    const qualityLeadsPercentage = filteredLeads.length > 0
      ? Math.round((qualityLeads / (filteredLeads.length + filteredDeals.length)) * 10000) / 100
      : 0;

    // Dependencia de canal (concentración)
    const channelConcentration: Record<string, number> = {};
    const totalLeadsBySource = Object.values(leadsBySource).reduce((sum, count) => sum + count, 0);
    Object.entries(leadsBySource).forEach(([source, count]) => {
      channelConcentration[source] = totalLeadsBySource > 0
        ? Math.round((count / totalLeadsBySource) * 10000) / 100
        : 0;
    });

    // Estadísticas por semana y mes (simplificado)
    const leadsByWeek: Record<string, number> = {};
    const dealsByWeek: Record<string, number> = {};
    const leadsByMonth: Record<string, number> = {};
    const dealsByMonth: Record<string, number> = {};

    filteredLeads.forEach(lead => {
      const createdTime = (lead as any).Creacion_de_Lead || lead.Created_Time;
      if (createdTime) {
        const date = new Date(createdTime);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const week = getWeekNumber(date);
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const weekKey = `${year}-W${String(week).padStart(2, '0')}`;
        leadsByMonth[monthKey] = (leadsByMonth[monthKey] || 0) + 1;
        leadsByWeek[weekKey] = (leadsByWeek[weekKey] || 0) + 1;
      }
    });

    filteredDeals.forEach(deal => {
      const dealCreatedTime = deal.Created_Time || (deal as any).Creacion_de_Deal;
      if (dealCreatedTime) {
        const date = new Date(dealCreatedTime);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const week = getWeekNumber(date);
        const monthKey = `${year}-${String(month).padStart(2, '0')}`;
        const weekKey = `${year}-W${String(week).padStart(2, '0')}`;
        dealsByMonth[monthKey] = (dealsByMonth[monthKey] || 0) + 1;
        dealsByWeek[weekKey] = (dealsByWeek[weekKey] || 0) + 1;
      }
    });

    // Conversión por fecha
    const conversionByDate: Record<string, number> = {};
    Object.keys({ ...leadsByDate, ...dealsByDate }).forEach(date => {
      const leadsCount = leadsByDate[date] || 0;
      const dealsCount = dealsByDate[date] || 0;
      conversionByDate[date] = leadsCount > 0
        ? Math.round((dealsCount / leadsCount) * 10000) / 100
        : 0;
    });

    // Embudo del ciclo de vida
    // 1. Leads: total de leads filtrados
    const totalLeadsCount = filteredLeads.length;

    // 2. Deals: TODOS los deals filtrados (independientemente de si tienen cita o están cerrados)
    // Cambio: ahora incluimos todos los deals, no solo los que no están cerrados
    const dealsWithAppointment = filteredDeals.length;

    // Diagnóstico: contar deals cerrados que fueron filtrados (para información)
    const closedStages = ['Ganado', 'Won', 'Cerrado Ganado', 'Perdido', 'Lost', 'Cerrado Perdido'];
    const closedDealsInFiltered = filteredDeals.filter(deal => {
      const stage = deal.Stage || '';
      return closedStages.some(closedStage =>
        stage.toLowerCase().includes(closedStage.toLowerCase())
      );
    }).length;
    const activeDealsInFiltered = filteredDeals.length - closedDealsInFiltered;

    // Log diagnóstico del embudo
    if (filteredDeals.length > 0) {
      console.log(`📊 Embudo de ventas - Total Deals: ${filteredDeals.length}, Activos: ${activeDealsInFiltered}, Cerrados: ${closedDealsInFiltered}`);
    }

    // 3. Cerrado ganado: deals con Stage que contenga "Ganado", "Won", etc.
    // Importante: este KPI usa la fecha de cierre (Closing_Date) y NO la fecha de creación.
    const closedWon = closedWonByCloseDate;

    const lifecycleFunnel = {
      leads: totalLeadsCount,
      dealsWithAppointment: dealsWithAppointment,
      closedWon: closedWon,
    };

    return {
      totalLeads: filteredLeads.length,
      totalDeals: filteredDeals.length,
      leadsByStatus,
      dealsByStage,
      totalDealValue,
      averageDealValue,
      leadsByDevelopment,
      dealsByDevelopment,
      dealValueByDevelopment,
      leadsByDate,
      dealsByDate,
      dealValueByDate,
      leadsFunnel,
      dealsFunnel,
      leadsDiscardReasons,
      dealsDiscardReasons,
      conversionRate,
      averageTimeToFirstContact,
      leadsOutsideBusinessHours,
      leadsOutsideBusinessHoursPercentage,
      discardedLeads,
      discardedLeadsPercentage,
      leadsBySource,
      dealsBySource,
      conversionBySource,
      channelConcentration,
      leadsByOwner,
      dealsByOwner,
      qualityLeads,
      qualityLeadsPercentage,
      qualityLeadsBySource, // Nuevo campo
      leadsByWeek,
      dealsByWeek,
      leadsByMonth,
      dealsByMonth,
      conversionByDate,
      lifecycleFunnel,
      // Campos que requieren datos adicionales (se pueden cargar después si es necesario)
      averageTimeToFirstContactByOwner: {},
      activitiesByType: {},
      activitiesByOwner: {},
    };
  }, [compareDevelopments, getPeriodDates]);

  // Helper para obtener número de semana
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Calcular estadísticas usando useMemo (se recalcula automáticamente cuando cambian los filtros)
  const currentStats = useMemo(() => {
    if (leads.length === 0 && deals.length === 0) return null;
    return calculateStatsFromData(
      leads,
      deals,
      selectedPeriod,
      false,
      selectedDesarrollo,
      selectedSource,
      selectedOwner,
      selectedStatus,
      undefined,
      customDateRange
    );
  }, [leads, deals, selectedPeriod, selectedDesarrollo, selectedSource, selectedOwner, selectedStatus, calculateStatsFromData, customDateRange]);

  const previousStats = useMemo(() => {
    if (leads.length === 0 && deals.length === 0) return null;
    return calculateStatsFromData(
      leads,
      deals,
      selectedPeriod,
      true,
      selectedDesarrollo,
      selectedSource,
      selectedOwner,
      selectedStatus,
      undefined,
      customDateRange
    );
  }, [leads, deals, selectedPeriod, selectedDesarrollo, selectedSource, selectedOwner, selectedStatus, calculateStatsFromData, customDateRange]);

  // Estadísticas comparables (proporcionales a la fecha actual)
  const previousComparableStats = useMemo(() => {
    if (leads.length === 0 && deals.length === 0) return null;

    const now = new Date();
    const { startDate: currentStart } = getPeriodDates(selectedPeriod, false);
    const { startDate: prevStart, endDate: prevEnd } = getPeriodDates(selectedPeriod, true);

    let elapsed = now.getTime() - currentStart.getTime();
    if (elapsed < 0) elapsed = 0;

    const proportionalPrevEnd = new Date(prevStart.getTime() + elapsed);
    const clampedPrevEnd = proportionalPrevEnd > prevEnd ? prevEnd : proportionalPrevEnd;

    return calculateStatsFromData(
      leads,
      deals,
      selectedPeriod,
      true,
      selectedDesarrollo,
      selectedSource,
      selectedOwner,
      selectedStatus,
      clampedPrevEnd,
      customDateRange
    );
  }, [leads, deals, selectedPeriod, selectedDesarrollo, selectedSource, selectedOwner, selectedStatus, calculateStatsFromData, getPeriodDates, customDateRange]);

  // Actualizar estados cuando cambian las estadísticas calculadas
  useEffect(() => {
    if (currentStats) {
      setStats(currentStats);
    }
  }, [currentStats]);

  useEffect(() => {
    if (previousStats) {
      setLastMonthStats(previousStats);
    }
  }, [previousStats]);

  // Cargar todos los datos una vez (sin filtros de fecha para tener todos los datos disponibles)
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Función helper para obtener todos los leads
      const getAllLeads = async (): Promise<ZohoLead[]> => {
        const allLeads: ZohoLead[] = [];
        let currentPage = 1;
        const perPage = 200;
        let hasMore = true;

        while (hasMore) {
          try {
            const leadsData = await getZohoLeads(currentPage, perPage);
            if (leadsData.data && leadsData.data.length > 0) {
              allLeads.push(...leadsData.data);
            }

            // Verificar si hay más registros
            hasMore = leadsData.info?.more_records === true;
            currentPage++;

            // Limitar a 50 páginas (10,000 registros) para evitar loops infinitos
            if (currentPage > 50) {
              console.warn('⚠️ Límite de páginas alcanzado para leads (50 páginas = 10,000 registros)');
              break;
            }
          } catch (err) {
            console.error(`Error obteniendo leads página ${currentPage}:`, err);
            // Si falla en la primera página, es un error crítico (no hay nada que mostrar).
            if (currentPage === 1) {
              throw err;
            }
            // Si falla después, mostramos lo que ya se pudo cargar.
            break;
          }
        }

        console.log(`✅ Total de leads obtenidos: ${allLeads.length}`);
        return allLeads;
      };

      // Función helper para obtener todos los deals
      const getAllDeals = async (): Promise<ZohoDeal[]> => {
        const allDeals: ZohoDeal[] = [];
        let currentPage = 1;
        const perPage = 200;
        let hasMore = true;

        while (hasMore) {
          try {
            const dealsData = await getZohoDeals(currentPage, perPage);
            if (dealsData.data && dealsData.data.length > 0) {
              allDeals.push(...dealsData.data);
            }

            // Verificar si hay más registros
            hasMore = dealsData.info?.more_records === true;
            currentPage++;

            // Limitar a 50 páginas (10,000 registros) para evitar loops infinitos
            if (currentPage > 50) {
              console.warn('⚠️ Límite de páginas alcanzado para deals (50 páginas = 10,000 registros)');
              break;
            }
          } catch (err) {
            console.error(`Error obteniendo deals página ${currentPage}:`, err);
            // Si falla en la primera página, es un error crítico (no hay nada que mostrar).
            if (currentPage === 1) {
              throw err;
            }
            // Si falla después, mostramos lo que ya se pudo cargar.
            break;
          }
        }

        console.log(`✅ Total de deals obtenidos: ${allDeals.length}`);
        return allDeals;
      };

      // Cargar todos los datos en paralelo
      const [allLeads, allDeals] = await Promise.all([
        getAllLeads().catch(() => []),
        getAllDeals().catch(() => []),
      ]);

      setLeads(allLeads);
      setDeals(allDeals);

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
  }, [toast]);

  // Verificar permisos
  useEffect(() => {
    if (userRole !== null) {
      const allowedRoles: UserRole[] = [
        'admin',
        'ceo',
        'sales_manager',
        'post_sales',
        'legal_manager',
        'marketing_manager',
      ];
      if (!allowedRoles.includes(userRole)) {
        setError(
          'No tienes permisos para acceder a ZOHO CRM. Solo CEO, administradores, gerentes (ventas/legal/marketing) y post-venta pueden acceder.'
        );
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


  // -----------------------------------------------------
  // Display helpers (MUST be before early returns to keep hook order stable)
  // -----------------------------------------------------
  // Stats que se están mostrando en la UI (periodo actual o periodo anterior)
  // Prefer the freshly computed memoized stats to avoid a render where state is still null.
  const effectiveCurrentStats = currentStats ?? stats;
  const effectivePreviousStats = previousStats ?? lastMonthStats;
  const displayedStats = showLastMonth ? effectivePreviousStats : effectiveCurrentStats;
  // For the "average time to first contact" KPI:
  // - Show local calculation immediately (fast)
  // - If backend value differs, it will still be available in debug, but we don't block UI on it.
  const displayedAvgTimeToFirstContact =
    displayedStats?.averageTimeToFirstContact ?? activityStats?.averageTimeToFirstContact ?? 0;

  // El embudo del ciclo de vida (lifecycle) es crítico para negocio.
  // Usamos el valor del backend cuando está disponible para evitar inconsistencias por paginación/límites en el cliente.
  const emptyLifecycleFunnel = { leads: 0, dealsWithAppointment: 0, closedWon: 0 };
  const displayedLifecycleFunnel =
    activityStats?.lifecycleFunnel ?? displayedStats?.lifecycleFunnel ?? emptyLifecycleFunnel;

  // Estadísticas para comparación (badges de porcentaje)
  const comparisonStats = previousComparableStats ?? lastMonthStats;

  // Lists for Leads/Deals tabs (must follow the selected period + toggle)




  // Si no tiene permisos
  if (
    userRole !== null &&
    !['admin', 'ceo', 'sales_manager', 'post_sales', 'legal_manager', 'marketing_manager'].includes(userRole)
  ) {
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
              Solo CEO, administradores, gerentes (ventas/legal/marketing) y post-venta pueden acceder a esta sección.
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
    <div className="w-full h-full flex flex-col responsive-spacing-y">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg font-bold navy-text">ZOHO CRM</h1>
          <p className="text-muted-foreground">
            Visualiza y gestiona leads y deals desde ZOHO CRM
          </p>
        </div>
        <div className="flex gap-2">
          {(userRole === 'admin' || userRole === 'ceo') && (
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

      {/* Global Filters — barra compacta */}
      <div className="rounded-lg border bg-card shadow-sm">
        {/* Cabecera siempre visible */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filtros</span>
          {/* Chips de filtros activos */}
          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
            {selectedDesarrollo !== 'all' && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {selectedDesarrollo}
                <button onClick={() => setSelectedDesarrollo('all')} className="hover:text-destructive leading-none">×</button>
              </span>
            )}
            {selectedPeriod !== 'month' && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {selectedPeriod === 'week' ? 'Semanal' : selectedPeriod === 'quarter' ? 'Trimestral' : selectedPeriod === 'year' ? 'Anual' : selectedPeriod === 'custom' ? 'Personalizado' : selectedPeriod}
                <button onClick={() => setSelectedPeriod('month')} className="hover:text-destructive leading-none">×</button>
              </span>
            )}
            {selectedSource.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {selectedSource.length} fuente{selectedSource.length > 1 ? 's' : ''}
                <button onClick={() => setSelectedSource([])} className="hover:text-destructive leading-none">×</button>
              </span>
            )}
            {selectedOwner.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {selectedOwner.length} asesor{selectedOwner.length > 1 ? 'es' : ''}
                <button onClick={() => setSelectedOwner([])} className="hover:text-destructive leading-none">×</button>
              </span>
            )}
            {selectedStatus.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {selectedStatus.length} estado{selectedStatus.length > 1 ? 's' : ''}
                <button onClick={() => setSelectedStatus([])} className="hover:text-destructive leading-none">×</button>
              </span>
            )}
            {showLastMonth && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">
                Período anterior
                <button onClick={() => setShowLastMonth(false)} className="hover:text-destructive leading-none">×</button>
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFiltersOpen(o => !o)}
            className="h-7 px-2 text-xs text-muted-foreground shrink-0"
          >
            {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="ml-1">{filtersOpen ? 'Cerrar' : 'Editar'}</span>
          </Button>
        </div>

        {/* Panel expandible */}
        {filtersOpen && (
          <div className="border-t px-3 py-3 flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1 min-w-[130px]">
              <label className="text-[11px] font-medium text-muted-foreground">Periodo</label>
              <Select value={selectedPeriod} onValueChange={(value: TimePeriod) => setSelectedPeriod(value)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Periodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Semanal</SelectItem>
                  <SelectItem value="month">Mensual</SelectItem>
                  <SelectItem value="quarter">Trimestral</SelectItem>
                  <SelectItem value="year">Anual</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedPeriod === 'custom' && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-muted-foreground">Rango</label>
                <DatePickerWithRange date={customDateRange} onDateChange={setCustomDateRange} />
              </div>
            )}
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] font-medium text-muted-foreground">Desarrollo</label>
              <Select value={selectedDesarrollo} onValueChange={setSelectedDesarrollo}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableDevelopments.map(dev => (
                    <SelectItem key={dev} value={dev}>{dev}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] font-medium text-muted-foreground">Fuente</label>
              <MultiSelect
                options={availableSources.map(s => ({ label: s, value: s }))}
                selected={selectedSource}
                onChange={setSelectedSource}
                placeholder="Todas"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] font-medium text-muted-foreground">Asesor</label>
              <MultiSelect
                options={availableOwners.map(o => ({ label: o, value: o }))}
                selected={selectedOwner}
                onChange={setSelectedOwner}
                placeholder="Todos"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-[11px] font-medium text-muted-foreground">Estado</label>
              <MultiSelect
                options={availableStatuses.map(s => ({ label: s, value: s }))}
                selected={selectedStatus}
                onChange={setSelectedStatus}
                placeholder="Todos"
              />
            </div>
            <Button
              variant={showLastMonth ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowLastMonth(!showLastMonth)}
              className="h-8 text-xs self-end"
            >
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              {showLastMonth ? 'Período actual' : 'Período anterior'}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="executive">Vista Ejecutiva</TabsTrigger>
          <TabsTrigger value="stats">Estadísticas</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Vista Ejecutiva */}
        <TabsContent value="executive" className="flex-1 overflow-auto">
          {loading ? (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p className="text-muted-foreground">Cargando vista ejecutiva...</p>
                </div>
              </CardContent>
            </Card>
          ) : displayedStats ? (
            <div className="mt-4 space-y-4">
              {/* Resumen Ejecutivo */}
              <Card>
                <CardHeader>
                  <CardTitle>Resumen Ejecutivo - Zoho CRM</CardTitle>
                  <CardDescription>Vista consolidada para Dirección General</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* KPIs Globales */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm">KPIs Globales</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Leads Totales:</span>
                          <span className="font-medium">{displayedStats.totalLeads}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Deals Creados:</span>
                          <span className="font-medium">{displayedStats.totalDeals}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>% Conversión:</span>
                          <span className={`font-medium ${(displayedStats.conversionRate || 0) >= 15 ? 'text-green-600' : 'text-red-600'}`}>
                            {(displayedStats.conversionRate || 0).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Valor Total:</span>
                          <span className="font-medium">{formatCurrency(displayedStats.totalDealValue || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Pipeline */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm">Pipeline</h3>
                      {displayedStats.leadsFunnel && Object.keys(displayedStats.leadsFunnel).length > 0 && (
                        <div className="space-y-1 text-sm">
                          {Object.entries(displayedStats.leadsFunnel)
                            .slice(0, 5)
                            .map(([status, count]) => (
                              <div key={status} className="flex justify-between">
                                <span className="truncate">{status}:</span>
                                <span className="font-medium ml-2">{count}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Ventas */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm">Ventas</h3>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Deals Activos:</span>
                          <span className="font-medium">{displayedStats.totalDeals}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Valor Promedio:</span>
                          <span className="font-medium">{formatCurrency(displayedStats.averageDealValue || 0)}</span>
                        </div>
                        {displayedStats.dealsByStage && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground mb-1">Top Etapas:</p>
                            {Object.entries(displayedStats.dealsByStage)
                              .sort(([, a], [, b]) => b - a)
                              .slice(0, 3)
                              .map(([stage, count]) => (
                                <div key={stage} className="flex justify-between text-xs">
                                  <span className="truncate">{stage}:</span>
                                  <span className="ml-2">{count}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Riesgos y Oportunidades */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Riesgos */}
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-600">Riesgos</CardTitle>
                    <CardDescription>Áreas que requieren atención</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(displayedStats?.discardedLeadsPercentage || 0) > 30 && (
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-sm font-medium text-red-800">Alta Tasa de Descarte</p>
                          <p className="text-xs text-red-600 mt-1">
                            {(displayedStats?.discardedLeadsPercentage || 0).toFixed(1)}% de leads descartados
                          </p>
                        </div>
                      )}
                      {displayedStats?.channelConcentration && Object.entries(displayedStats.channelConcentration).some(([, p]) => p > 50) && (
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-sm font-medium text-red-800">Dependencia de Canal</p>
                          <p className="text-xs text-red-600 mt-1">
                            Alta concentración en un solo canal de captación
                          </p>
                        </div>
                      )}
                      {displayedAvgTimeToFirstContact > 60 && (
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-sm font-medium text-red-800">Tiempo de contacto dentro de horario laboral elevado</p>
                          <p className="text-xs text-red-600 mt-1">
                            Tiempo promedio (dentro de horario laboral): {displayedAvgTimeToFirstContact.toFixed(1)} min (Meta: 30 min)
                          </p>
                        </div>
                      )}
                      {(displayedStats?.conversionRate || 0) < 10 && (
                        <div className="p-3 bg-red-50 rounded-lg">
                          <p className="text-sm font-medium text-red-800">Baja Conversión</p>
                          <p className="text-xs text-red-600 mt-1">
                            {(displayedStats?.conversionRate || 0).toFixed(1)}% (Meta: 15%)
                          </p>
                        </div>
                      )}
                      {(!displayedStats?.channelConcentration || Object.keys(displayedStats.channelConcentration).length === 0) &&
                        (!displayedStats?.discardedLeadsPercentage || displayedStats.discardedLeadsPercentage < 30) &&
                        displayedAvgTimeToFirstContact <= 60 &&
                        (displayedStats?.conversionRate || 0) >= 10 && (
                          <p className="text-sm text-muted-foreground">No se detectaron riesgos significativos</p>
                        )}
                    </div>
                  </CardContent>
                </Card>

                {/* Oportunidades */}
                <Card className="border-green-200">
                  <CardHeader>
                    <CardTitle className="text-green-600">Oportunidades</CardTitle>
                    <CardDescription>Áreas con potencial de mejora</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {displayedAvgTimeToFirstContact <= 30 && (
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-sm font-medium text-green-800">Excelente tiempo de contacto dentro de horario laboral</p>
                          <p className="text-xs text-green-600 mt-1">
                            Tiempo promedio (dentro de horario laboral): {displayedAvgTimeToFirstContact.toFixed(1)} min (Meta alcanzada)
                          </p>
                        </div>
                      )}
                      {(displayedStats?.conversionRate || 0) >= 15 && (
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-sm font-medium text-green-800">Alta Conversión</p>
                          <p className="text-xs text-green-600 mt-1">
                            {(displayedStats?.conversionRate || 0).toFixed(1)}% (Meta alcanzada)
                          </p>
                        </div>
                      )}
                      {(displayedStats?.qualityLeadsPercentage || 0) > 50 && (
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-sm font-medium text-green-800">Alta Calidad de Leads</p>
                          <p className="text-xs text-green-600 mt-1">
                            {(displayedStats?.qualityLeadsPercentage || 0).toFixed(1)}% de leads de calidad
                          </p>
                        </div>
                      )}
                      {!showLastMonth &&
                        stats &&
                        lastMonthStats &&
                        (stats?.totalLeads ?? 0) > (lastMonthStats?.totalLeads ?? 0) && (
                          <div className="p-3 bg-green-50 rounded-lg">
                            <p className="text-sm font-medium text-green-800">Crecimiento en Leads</p>
                            <p className="text-xs text-green-600 mt-1">
                              +{(stats?.totalLeads ?? 0) - (lastMonthStats?.totalLeads ?? 0)} leads vs periodo anterior
                            </p>
                          </div>
                        )}
                      {displayedAvgTimeToFirstContact > 30 &&
                        (!displayedStats.conversionRate || displayedStats.conversionRate < 15) &&
                        (!displayedStats.qualityLeadsPercentage || displayedStats.qualityLeadsPercentage <= 50) && (
                          <p className="text-sm text-muted-foreground">Oportunidades de mejora identificadas en las métricas principales</p>
                        )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Comparativo vs Periodo Anterior (solo cuando estamos viendo periodo actual) */}
              {!showLastMonth && stats && comparisonStats && (
                <Card>
                  <CardHeader>
                    <CardTitle>Comparativo vs Periodo Anterior</CardTitle>
                    <CardDescription>Variación del periodo actual respecto al periodo anterior</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Leads</p>
                        <p className="text-xl font-bold">{stats.totalLeads}</p>
                        {comparisonStats.totalLeads > 0 && stats.totalLeads !== comparisonStats.totalLeads && (
                          <p className={`text-xs mt-1 ${stats.totalLeads > comparisonStats.totalLeads ? 'text-green-600' : 'text-red-600'}`}>
                            {stats.totalLeads > comparisonStats.totalLeads ? '+' : ''}
                            {Math.round(((stats.totalLeads - comparisonStats.totalLeads) / comparisonStats.totalLeads) * 100)}%
                          </p>
                        )}
                        {comparisonStats.totalLeads === 0 && stats.totalLeads > 0 && (
                          <p className="text-xs text-green-600 mt-1">Nuevo</p>
                        )}
                      </div>
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Deals</p>
                        <p className="text-xl font-bold">{stats.totalDeals}</p>
                        {comparisonStats.totalDeals > 0 && stats.totalDeals !== comparisonStats.totalDeals && (
                          <p className={`text-xs mt-1 ${stats.totalDeals > comparisonStats.totalDeals ? 'text-green-600' : 'text-red-600'}`}>
                            {stats.totalDeals > comparisonStats.totalDeals ? '+' : ''}
                            {Math.round(((stats.totalDeals - comparisonStats.totalDeals) / comparisonStats.totalDeals) * 100)}%
                          </p>
                        )}
                        {comparisonStats.totalDeals === 0 && stats.totalDeals > 0 && (
                          <p className="text-xs text-green-600 mt-1">Nuevo</p>
                        )}
                      </div>
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Conversión</p>
                        <p className="text-xl font-bold">{(stats.conversionRate || 0).toFixed(1)}%</p>
                        {stats.conversionRate !== comparisonStats.conversionRate && (
                          <p className={`text-xs mt-1 ${(stats.conversionRate || 0) > (comparisonStats.conversionRate || 0) ? 'text-green-600' : 'text-red-600'}`}>
                            {(stats.conversionRate || 0) > (comparisonStats.conversionRate || 0) ? '+' : ''}
                            {Math.abs(Math.round(((stats.conversionRate || 0) - (comparisonStats.conversionRate || 0)) * 10) / 10).toFixed(1)}%
                          </p>
                        )}
                      </div>
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Tiempo de contacto dentro de horario laboral</p>
                        <p className="text-xl font-bold">{displayedAvgTimeToFirstContact.toFixed(1)} min</p>
                        {stats.averageTimeToFirstContact !== comparisonStats.averageTimeToFirstContact && (
                          <p className={`text-xs mt-1 ${(stats.averageTimeToFirstContact || 0) < (comparisonStats.averageTimeToFirstContact || 0) ? 'text-green-600' : 'text-red-600'}`}>
                            {(stats.averageTimeToFirstContact || 0) < (comparisonStats.averageTimeToFirstContact || 0) ? '-' : '+'}
                            {Math.abs(Math.round((stats.averageTimeToFirstContact || 0) - (comparisonStats.averageTimeToFirstContact || 0)))} min
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  No se pudieron cargar los datos para la vista ejecutiva
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Estadísticas */}
        <TabsContent value="stats" className="flex-1 overflow-auto">
          {loading ? (
            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <p className="text-muted-foreground">Cargando estadísticas...</p>
                </div>
              </CardContent>
            </Card>
          ) : displayedStats ? (
            <div className="mt-4 space-y-4">
              {/* Resumen Informativo */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 mb-1">
                        Periodo: {selectedPeriod === 'week' ? 'Semanal' : selectedPeriod === 'month' ? 'Mensual' : selectedPeriod === 'quarter' ? 'Trimestral' : 'Anual'}
                        {selectedDesarrollo !== 'all' && ` | Desarrollo: ${selectedDesarrollo}`}
                        {selectedSource.length > 0 && ` | Fuente: ${selectedSource.join(', ')}`}
                        {selectedOwner.length > 0 && ` | Asesor: ${selectedOwner.join(', ')}`}
                        {selectedStatus.length > 0 && ` | Estado: ${selectedStatus.join(', ')}`}
                      </p>
                      <p className="text-xs text-blue-700">
                        Mostrando {showLastMonth ? 'datos del periodo anterior' : 'datos del periodo actual'}
                        {displayedStats && ` - Total: ${displayedStats.totalLeads} leads, ${displayedStats.totalDeals} deals`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tarjetas KPI Principales */}
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {/* Total Leads */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Leads Totales</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{displayedStats?.totalLeads || 0}</div>
                    {stats && lastMonthStats && !showLastMonth && lastMonthStats.totalLeads > 0 && (
                      <p className={`text-xs flex items-center gap-1 mt-1 ${stats.totalLeads >= lastMonthStats.totalLeads ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {stats.totalLeads >= lastMonthStats.totalLeads ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {stats.totalLeads > lastMonthStats.totalLeads ? '+' : ''}
                        {Math.round(((stats.totalLeads - lastMonthStats.totalLeads) / lastMonthStats.totalLeads) * 100)}% vs periodo anterior
                      </p>
                    )}
                    {stats && lastMonthStats && !showLastMonth && lastMonthStats.totalLeads === 0 && stats.totalLeads > 0 && (
                      <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                        <TrendingUp className="h-3 w-3" />
                        Nuevo (sin datos previos)
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {showLastMonth ? 'Leads del periodo anterior' : 'Leads registrados'}
                    </p>
                  </CardContent>
                </Card>

                {/* Total Deals */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Deals Creados</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{displayedStats?.totalDeals || 0}</div>
                    {stats && lastMonthStats && !showLastMonth && lastMonthStats.totalDeals > 0 && (
                      <p className={`text-xs flex items-center gap-1 mt-1 ${stats.totalDeals >= lastMonthStats.totalDeals ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {stats.totalDeals >= lastMonthStats.totalDeals ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {stats.totalDeals > lastMonthStats.totalDeals ? '+' : ''}
                        {Math.round(((stats.totalDeals - lastMonthStats.totalDeals) / lastMonthStats.totalDeals) * 100)}% vs periodo anterior
                      </p>
                    )}
                    {stats && lastMonthStats && !showLastMonth && lastMonthStats.totalDeals === 0 && stats.totalDeals > 0 && (
                      <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                        <TrendingUp className="h-3 w-3" />
                        Nuevo (sin datos previos)
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {showLastMonth ? 'Deals del periodo anterior' : 'Oportunidades activas'}
                    </p>
                  </CardContent>
                </Card>

                {/* % Conversión */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">% Conversión</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {((displayedStats?.conversionRate || 0)).toFixed(1)}%
                    </div>
                    {stats && lastMonthStats && !showLastMonth && lastMonthStats.conversionRate !== undefined && (
                      <p className={`text-xs flex items-center gap-1 mt-1 ${(stats.conversionRate || 0) >= (lastMonthStats.conversionRate || 0) ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {((stats.conversionRate || 0) >= (lastMonthStats.conversionRate || 0)) ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {((stats.conversionRate || 0) >= (lastMonthStats.conversionRate || 0)) ? '+' : ''}
                        {Math.abs(Math.round(((stats.conversionRate || 0) - (lastMonthStats.conversionRate || 0)) * 10) / 10).toFixed(1)}% vs periodo anterior
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Meta: 15%
                    </p>
                  </CardContent>
                </Card>

                {/* Tiempo de contacto dentro de horario laboral (tiempo promedio a primer contacto) */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tiempo de contacto dentro de horario laboral</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {displayedAvgTimeToFirstContact.toFixed(1)} min
                    </div>
                    {stats && comparisonStats && !showLastMonth && comparisonStats.averageTimeToFirstContact !== undefined && (
                      <p className={`text-xs flex items-center gap-1 mt-1 ${(stats.averageTimeToFirstContact || 0) <= (comparisonStats.averageTimeToFirstContact || 0) ? 'text-green-600' : 'text-red-600'}`}>
                        {(stats.averageTimeToFirstContact || 0) <= (comparisonStats.averageTimeToFirstContact || 0) ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {(stats.averageTimeToFirstContact || 0) <= (comparisonStats.averageTimeToFirstContact || 0) ? '-' : '+'}
                        {Math.abs(Math.round((stats.averageTimeToFirstContact || 0) - (comparisonStats.averageTimeToFirstContact || 0)))} min vs periodo anterior
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Meta: 30 min (dentro de horario laboral)
                    </p>
                  </CardContent>
                </Card>

                {/* % Leads Fuera de Horario Laboral */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">% Fuera Horario</CardTitle>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {((displayedStats?.leadsOutsideBusinessHoursPercentage || 0)).toFixed(1)}%
                    </div>
                    {stats && comparisonStats && !showLastMonth && comparisonStats.leadsOutsideBusinessHoursPercentage !== undefined && (
                      <p className={`text-xs flex items-center gap-1 mt-1 ${(stats.leadsOutsideBusinessHoursPercentage || 0) <= (comparisonStats.leadsOutsideBusinessHoursPercentage || 0) ? 'text-green-600' : 'text-red-600'}`}>
                        {(stats.leadsOutsideBusinessHoursPercentage || 0) <= (comparisonStats.leadsOutsideBusinessHoursPercentage || 0) ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {(stats.leadsOutsideBusinessHoursPercentage || 0) <= (comparisonStats.leadsOutsideBusinessHoursPercentage || 0) ? '-' : '+'}
                        {Math.abs(Math.round(((stats.leadsOutsideBusinessHoursPercentage || 0) - (comparisonStats.leadsOutsideBusinessHoursPercentage || 0)) * 10) / 10).toFixed(1)}% vs periodo anterior
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Horario: 08:00-20:30
                    </p>
                  </CardContent>
                </Card>

                {/* % Leads Descartados */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">% Descartados</CardTitle>
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {((displayedStats?.discardedLeadsPercentage || 0)).toFixed(1)}%
                    </div>
                    {stats && comparisonStats && !showLastMonth && comparisonStats.discardedLeadsPercentage !== undefined && (
                      <p className={`text-xs flex items-center gap-1 mt-1 ${(stats.discardedLeadsPercentage || 0) <= (comparisonStats.discardedLeadsPercentage || 0) ? 'text-green-600' : 'text-red-600'}`}>
                        {(stats.discardedLeadsPercentage || 0) <= (comparisonStats.discardedLeadsPercentage || 0) ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {(stats.discardedLeadsPercentage || 0) <= (comparisonStats.discardedLeadsPercentage || 0) ? '-' : '+'}
                        {Math.abs(Math.round(((stats.discardedLeadsPercentage || 0) - (comparisonStats.discardedLeadsPercentage || 0)) * 10) / 10).toFixed(1)}% vs periodo anterior
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {displayedStats?.discardedLeads || 0} leads descartados
                    </p>
                  </CardContent>
                </Card>

                {/* % Leads de Calidad */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">% Leales/Calidad</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">
                      {((displayedStats?.qualityLeadsPercentage || 0)).toFixed(1)}%
                    </div>
                    {stats && comparisonStats && !showLastMonth && comparisonStats.qualityLeadsPercentage !== undefined && (
                      <p className={`text-xs flex items-center gap-1 mt-1 ${(stats.qualityLeadsPercentage || 0) >= (comparisonStats.qualityLeadsPercentage || 0) ? 'text-green-600' : 'text-red-600'}`}>
                        {(stats.qualityLeadsPercentage || 0) >= (comparisonStats.qualityLeadsPercentage || 0) ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {(stats.qualityLeadsPercentage || 0) >= (comparisonStats.qualityLeadsPercentage || 0) ? '+' : ''}
                        {Math.abs(Math.round(((stats.qualityLeadsPercentage || 0) - (comparisonStats.qualityLeadsPercentage || 0)) * 10) / 10).toFixed(1)}% vs periodo anterior
                      </p>
                    )}
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Por fuente:</p>
                      {Object.entries((displayedStats?.qualityLeadsBySource || {}) as Record<string, number>)
                        .sort(([, a], [, b]) => b - a) // Sort by count desc
                        .map(([source, count]) => (
                          <div key={source} className="flex justify-between text-xs">
                            <span className="truncate max-w-[80px]" title={source}>{source}</span>
                            <span className="font-medium">{count}</span>
                          </div>
                        ))}
                      {Object.keys(displayedStats?.qualityLeadsBySource || {}).length === 0 && (
                        <p className="text-xs text-muted-foreground italic">Sin datos</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* SECCIÓN: EMBUDO DE VENTAS INMOBILIARIO - DISEÑO EJECUTIVO */}
              {displayedStats && displayedLifecycleFunnel && (
                <Card className="border border-gray-200 bg-white shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-gray-900">Embudo de Ventas</CardTitle>
                    <CardDescription className="text-sm text-gray-600">Análisis del ciclo completo de conversión</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {/* Función helper para determinar estado de salud */}
                    {(() => {
                      const leadsToDealsRate = displayedLifecycleFunnel.leads > 0
                        ? (displayedLifecycleFunnel.dealsWithAppointment / displayedLifecycleFunnel.leads) * 100
                        : 0;
                      const dealsToWonRate = displayedLifecycleFunnel.dealsWithAppointment > 0
                        ? (displayedLifecycleFunnel.closedWon / displayedLifecycleFunnel.dealsWithAppointment) * 100
                        : 0;

                      const getHealthStatus = (rate: number, thresholds: { optimal: number; attention: number }) => {
                        if (rate >= thresholds.optimal) return { color: 'green', label: 'Óptimo' };
                        if (rate >= thresholds.attention) return { color: 'yellow', label: 'Atención' };
                        return { color: 'red', label: 'Crítico' };
                      };

                      const leadsToDealsHealth = getHealthStatus(leadsToDealsRate, { optimal: 15, attention: 10 });
                      const dealsToWonHealth = getHealthStatus(dealsToWonRate, { optimal: 20, attention: 10 });

                      // Usar colores del desarrollo seleccionado
                      // - Si hay un desarrollo específico, usamos su paleta.
                      // - Si es "all", usamos colores semánticos (azul/verde/morado) para máxima claridad ejecutiva.
                      const palette = selectedDesarrollo === 'all'
                        ? { leadsColor: '#2563EB', dealsColor: '#16A34A', wonColor: '#7C3AED' }
                        : { leadsColor: colors.primary, dealsColor: colors.success, wonColor: colors.secondary };

                      const leadsColor = palette.leadsColor;
                      const dealsColor = palette.dealsColor;
                      const wonColor = palette.wonColor;

                      return (
                        <div className="space-y-4">
                          {/* EMBUDO VERTICAL */}
                          <div className="flex flex-col items-center space-y-3">
                            {/* Etapa 1: Leads */}
                            <div className="w-full max-w-3xl">
                              <div className="rounded-lg shadow-md p-5 text-white" style={{ backgroundColor: leadsColor }}>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-medium opacity-90 mb-1">Leads</p>
                                    <p className="text-4xl font-bold tracking-tight">{displayedLifecycleFunnel.leads}</p>
                                  </div>
                                  <div className="text-right">
                                    <Badge variant="outline" className="bg-white/20 text-white border-white/30 text-xs px-2 py-0.5">
                                      100%
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Conector 1: Leads → Deals */}
                            <div className="relative w-full max-w-3xl flex justify-center">
                              <div className="w-px h-8 bg-gray-300"></div>
                              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-gray-700">
                                    {leadsToDealsRate.toFixed(1)}%
                                  </span>
                                  <div className={`w-1.5 h-1.5 rounded-full ${leadsToDealsHealth.color === 'green' ? 'bg-green-500' :
                                    leadsToDealsHealth.color === 'yellow' ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}></div>
                                </div>
                              </div>
                            </div>

                            {/* Etapa 2: Deals (Agendó cita) */}
                            <div
                              className="w-full max-w-3xl"
                              style={{
                                width: `${Math.max(35, Math.min(90, (displayedLifecycleFunnel.dealsWithAppointment / displayedLifecycleFunnel.leads) * 100))}%`
                              }}
                            >
                              <div className="rounded-lg shadow-md p-5 text-white" style={{ backgroundColor: dealsColor }}>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-medium opacity-90 mb-1">Deals (Agendó cita)</p>
                                    <p className="text-4xl font-bold tracking-tight">{displayedLifecycleFunnel.dealsWithAppointment}</p>
                                  </div>
                                  <div className="text-right">
                                    <Badge variant="outline" className="bg-white/20 text-white border-white/30 text-xs px-2 py-0.5">
                                      {leadsToDealsRate.toFixed(1)}%
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Conector 2: Deals → Cerrado Ganado */}
                            <div className="relative w-full max-w-3xl flex justify-center">
                              <div className="w-px h-8 bg-gray-300"></div>
                              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-gray-700">
                                    {dealsToWonRate.toFixed(1)}%
                                  </span>
                                  <div className={`w-1.5 h-1.5 rounded-full ${dealsToWonHealth.color === 'green' ? 'bg-green-500' :
                                    dealsToWonHealth.color === 'yellow' ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}></div>
                                </div>
                              </div>
                            </div>

                            {/* Etapa 3: Cerrado Ganado */}
                            <div
                              className="w-full max-w-3xl"
                              style={{
                                width: `${Math.max(25, Math.min(70, (displayedLifecycleFunnel.closedWon / displayedLifecycleFunnel.leads) * 100))}%`
                              }}
                            >
                              <div className="rounded-lg shadow-md p-5 text-white" style={{ backgroundColor: wonColor }}>
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-medium opacity-90 mb-1">Cerrado Ganado</p>
                                    <p className="text-4xl font-bold tracking-tight">{displayedLifecycleFunnel.closedWon}</p>
                                  </div>
                                  <div className="text-right">
                                    <Badge variant="outline" className="bg-white/20 text-white border-white/30 text-xs px-2 py-0.5">
                                      {dealsToWonRate.toFixed(1)}%
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* SECCIÓN: RESUMEN ANALÍTICO */}
                          <div className="mt-6 pt-6 border-t border-gray-200">
                            <h4 className="text-xs font-semibold text-gray-700 mb-4 text-center uppercase tracking-wide">
                              Tasas de Conversión
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Card 1: Leads → Deals */}
                              <div className="rounded-lg border p-4" style={{ backgroundColor: `${leadsColor}15`, borderColor: `${leadsColor}40` }}>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Leads → Deals</p>
                                  <div className={`w-2 h-2 rounded-full ${leadsToDealsHealth.color === 'green' ? 'bg-green-500' :
                                    leadsToDealsHealth.color === 'yellow' ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}></div>
                                </div>
                                <p className="text-xl font-bold text-gray-900 mb-1">
                                  {leadsToDealsRate.toFixed(1)}%
                                </p>
                                <p className="text-xs text-gray-500">
                                  {displayedLifecycleFunnel.dealsWithAppointment} de {displayedLifecycleFunnel.leads} leads
                                </p>
                                <p className="text-xs text-gray-400 mt-1 italic">
                                  {leadsToDealsHealth.label}
                                </p>
                              </div>

                              {/* Card 2: Deals → Cerrado Ganado */}
                              <div className="rounded-lg border p-4" style={{ backgroundColor: `${dealsColor}15`, borderColor: `${dealsColor}40` }}>
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Deals → Cerrado Ganado</p>
                                  <div className={`w-2 h-2 rounded-full ${dealsToWonHealth.color === 'green' ? 'bg-green-500' :
                                    dealsToWonHealth.color === 'yellow' ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}></div>
                                </div>
                                <p className="text-xl font-bold text-gray-900 mb-1">
                                  {dealsToWonRate.toFixed(1)}%
                                </p>
                                <p className="text-xs text-gray-500">
                                  {displayedLifecycleFunnel.closedWon} de {displayedLifecycleFunnel.dealsWithAppointment} deals
                                </p>
                                <p className="text-xs text-gray-400 mt-1 italic">
                                  {dealsToWonHealth.label}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* SECCIÓN: INSIGHTS (NOTAS + LLAMADAS) */}
              {displayedStats && (
                <Card>
                  <CardHeader>
                    <CardTitle>Insights (Notas y Llamadas)</CardTitle>
                    <CardDescription>
                      Tendencias a partir de notas en Leads/Deals y conteo de llamadas registradas en Zoho
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Insights con IA (más significado, medible) */}
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">Insights</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Usa las notas (limpias) para detectar temas, objeciones, siguientes pasos y señales de fricción.
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Notas disponibles: <span className="font-medium">{notesInsights.notesForAI.length}</span>
                          </p>
                        </div>
                        <Button
                          variant="default"
                          onClick={handleGenerateAINotesInsights}
                          disabled={aiNotesInsightsLoading || notesInsights.notesForAI.length === 0}
                        >
                          {aiNotesInsightsLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Generando...
                            </>
                          ) : (
                            'Generar insights '
                          )}
                        </Button>
                      </div>

                      {aiNotesInsights && (
                        <div className="mt-4 space-y-4">
                          <div className="p-4 bg-white rounded-lg border">
                            <p className="text-xs text-muted-foreground mb-1">Resumen ejecutivo</p>
                            <p className="text-sm">{aiNotesInsights.summary}</p>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="p-4 bg-white rounded-lg border">
                              <p className="text-sm font-medium mb-2">Temas principales</p>
                              <div className="space-y-2">
                                {aiNotesInsights.topThemes?.slice(0, 3).map((t) => (
                                  <div key={t.label} className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm truncate">{t.label}</p>
                                      {t.examples?.[0] && (
                                        <p className="text-xs text-muted-foreground truncate">Ej: {t.examples[0]}</p>
                                      )}
                                    </div>
                                    <Badge variant="outline">{t.count}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="p-4 bg-white rounded-lg border">
                              <p className="text-sm font-medium mb-2">Objeciones / Bloqueos</p>
                              <div className="space-y-2">
                                {aiNotesInsights.topObjections?.slice(0, 3).map((t) => (
                                  <div key={t.label} className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm truncate">{t.label}</p>
                                      {t.examples?.[0] && (
                                        <p className="text-xs text-muted-foreground truncate">Ej: {t.examples[0]}</p>
                                      )}
                                    </div>
                                    <Badge variant="outline">{t.count}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="p-4 bg-white rounded-lg border">
                              <p className="text-sm font-medium mb-2">Siguientes pasos sugeridos</p>
                              <div className="space-y-2">
                                {aiNotesInsights.nextActions?.slice(0, 3).map((t) => (
                                  <div key={t.label} className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm truncate">{t.label}</p>
                                      {t.examples?.[0] && (
                                        <p className="text-xs text-muted-foreground truncate">Ej: {t.examples[0]}</p>
                                      )}
                                    </div>
                                    <Badge variant="outline">{t.count}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="p-4 bg-white rounded-lg border">
                              <p className="text-sm font-medium mb-2">Señales de fricción</p>
                              <div className="space-y-2">
                                {aiNotesInsights.frictionSignals?.slice(0, 3).map((t) => (
                                  <div key={t.label} className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm truncate">{t.label}</p>
                                      {t.examples?.[0] && (
                                        <p className="text-xs text-muted-foreground truncate">Ej: {t.examples[0]}</p>
                                      )}
                                    </div>
                                    <Badge variant="outline">{t.count}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
                            <div className="p-3 bg-white rounded-lg border">
                              <p className="text-[11px] text-muted-foreground">No contesta / sin contacto</p>
                              <p className="text-xl font-bold">{aiNotesInsights.metrics?.noAnswerOrNoContact ?? 0}</p>
                            </div>
                            <div className="p-3 bg-white rounded-lg border">
                              <p className="text-[11px] text-muted-foreground">Precio / presupuesto</p>
                              <p className="text-xl font-bold">{aiNotesInsights.metrics?.priceOrBudget ?? 0}</p>
                            </div>
                            <div className="p-3 bg-white rounded-lg border">
                              <p className="text-[11px] text-muted-foreground">Financiamiento / crédito</p>
                              <p className="text-xl font-bold">{aiNotesInsights.metrics?.financingOrCredit ?? 0}</p>
                            </div>
                            <div className="p-3 bg-white rounded-lg border">
                              <p className="text-[11px] text-muted-foreground">Ubicación / zona</p>
                              <p className="text-xl font-bold">{aiNotesInsights.metrics?.locationOrArea ?? 0}</p>
                            </div>
                            <div className="p-3 bg-white rounded-lg border">
                              <p className="text-[11px] text-muted-foreground">Timing / urgencia</p>
                              <p className="text-xl font-bold">{aiNotesInsights.metrics?.timingOrUrgency ?? 0}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                      <div className="p-4 border rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Llamadas registradas</p>
                        <p className="text-xl font-bold">
                          {activityStatsLoading ? '...' : (
                            (activityStats?.activitiesByType?.Call ??
                              activityStats?.activitiesByType?.Calls ??
                              activityStats?.activitiesByType?.Llamada ??
                              0)
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Filtrado por periodo y desarrollo (Zoho Activities)
                        </p>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Notas (Leads)</p>
                        <p className="text-xl font-bold">{notesInsights.totalLeadNotes}</p>
                        <p className="text-xs text-muted-foreground mt-1">Notas encontradas en el periodo</p>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Notas (Deals)</p>
                        <p className="text-xl font-bold">{notesInsights.totalDealNotes}</p>
                        <p className="text-xs text-muted-foreground mt-1">Notas encontradas en el periodo</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
                      {/* IA: Top temas/objeciones/fricción/acciones */}
                      <Card className="border">
                        <CardHeader>
                          <CardTitle className="text-sm">Qué está pasando </CardTitle>
                          <CardDescription className="text-xs">
                            Conteo de los insights más relevantes (no son “palabras sueltas”)
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2 mb-3">
                            <Button
                              type="button"
                              variant={aiChartsMode === 'themes' ? 'default' : 'outline'}
                              onClick={() => setAiChartsMode('themes')}
                              size="sm"
                            >
                              Temas
                            </Button>
                            <Button
                              type="button"
                              variant={aiChartsMode === 'objections' ? 'default' : 'outline'}
                              onClick={() => setAiChartsMode('objections')}
                              size="sm"
                            >
                              Objeciones
                            </Button>
                            <Button
                              type="button"
                              variant={aiChartsMode === 'friction' ? 'default' : 'outline'}
                              onClick={() => setAiChartsMode('friction')}
                              size="sm"
                            >
                              Fricción
                            </Button>
                            <Button
                              type="button"
                              variant={aiChartsMode === 'actions' ? 'default' : 'outline'}
                              onClick={() => setAiChartsMode('actions')}
                              size="sm"
                            >
                              Siguientes pasos
                            </Button>
                          </div>

                          {storedNotesInsightsLoading ? (
                            <p className="text-sm text-muted-foreground">Cargando insight guardado...</p>
                          ) : !storedNotesInsights ? (
                            <p className="text-sm text-muted-foreground">
                              Aún no hay un insight guardado para estos filtros. Genera el insights para ver las gráficas.
                            </p>
                          ) : aiBarChartData.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              El insight guardado no trae datos suficientes para esta gráfica. Regenera el insight.
                            </p>
                          ) : (
                            <ResponsiveContainer width="100%" height={280}>
                              <BarChart data={aiBarChartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" interval={0} angle={-25} textAnchor="end" height={70} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill={colors.primary} name="Menciones" />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </CardContent>
                      </Card>

                      {/* Tendencia: métricas ejecutivas */}
                      <Card className="border">
                        <CardHeader>
                          <CardTitle className="text-sm">Tendencia de fricción (en el tiempo)</CardTitle>
                          <CardDescription className="text-xs">
                            Por semana/mes: No contacto, Precio, Crédito, Ubicación, Timing
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {storedNotesInsightsLoading ? (
                            <p className="text-sm text-muted-foreground">Cargando insight guardado...</p>
                          ) : !storedNotesInsights || !Array.isArray((storedNotesInsights as any).metricsTrend) || (storedNotesInsights as any).metricsTrend.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Aún no hay datos guardados para tendencia. Genera (o regenera) el insight.
                            </p>
                          ) : (
                            <ResponsiveContainer width="100%" height={280}>
                              <LineChart data={(storedNotesInsights as any).metricsTrend}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="bucket"
                                  tickFormatter={(value) => formatBucketLabel(selectedPeriod, String(value))}
                                />
                                <YAxis />
                                <Tooltip labelFormatter={(label) => formatBucketLabel(selectedPeriod, String(label))} />
                                <Legend />
                                <Line type="monotone" dataKey="noAnswerOrNoContact" name="No contacto" stroke={getChartColor(selectedDesarrollo, 0)} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="priceOrBudget" name="Precio" stroke={getChartColor(selectedDesarrollo, 1)} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="financingOrCredit" name="Crédito" stroke={getChartColor(selectedDesarrollo, 2)} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="locationOrArea" name="Ubicación" stroke={getChartColor(selectedDesarrollo, 3)} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="timingOrUrgency" name="Timing" stroke={getChartColor(selectedDesarrollo, 4)} strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SECCIÓN: EVOLUCIÓN TEMPORAL */}
              <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
                {displayedStats &&
                  ((displayedStats.leadsByDate && Object.keys(displayedStats.leadsByDate).length > 0) ||
                    (displayedStats.dealsByDate && Object.keys(displayedStats.dealsByDate).length > 0)) && (
                    <Card className="md:col-span-2">
                      <CardHeader>
                        <CardTitle>Leads y Deals en el Tiempo</CardTitle>
                        <CardDescription>
                          Evolución por periodo (2 días / semana / mes)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          {(() => {
                            const chartData = Object.keys({
                              ...(displayedStats.leadsByDate || {}),
                              ...(displayedStats.dealsByDate || {}),
                            })
                              .sort((a, b) => a.localeCompare(b))
                              .map((bucket) => ({
                                bucket,
                                leads: displayedStats.leadsByDate?.[bucket] ?? 0,
                                deals: displayedStats.dealsByDate?.[bucket] ?? 0,
                              }));

                            // Calculate averages
                            const totalLeads = chartData.reduce((sum, d) => sum + d.leads, 0);
                            const totalDeals = chartData.reduce((sum, d) => sum + d.deals, 0);
                            const avgLeads = chartData.length > 0 ? totalLeads / chartData.length : 0;
                            const avgDeals = chartData.length > 0 ? totalDeals / chartData.length : 0;

                            return (
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey="bucket"
                                  tickFormatter={(value) =>
                                    formatBucketLabel(selectedPeriod, String(value))
                                  }
                                />
                                <YAxis />
                                <Tooltip
                                  labelFormatter={(label) =>
                                    formatBucketLabel(selectedPeriod, String(label))
                                  }
                                />
                                <Legend />
                                <Line
                                  type="monotone"
                                  dataKey="leads"
                                  stroke={colors.primary}
                                  name="Leads"
                                  strokeWidth={2}
                                  dot={false}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="deals"
                                  stroke={colors.secondary}
                                  name="Deals"
                                  strokeWidth={2}
                                  dot={false}
                                />
                                {/* Average reference lines */}
                                <ReferenceLine
                                  y={avgLeads}
                                  stroke={colors.primary}
                                  strokeDasharray="5 5"
                                  strokeWidth={2}
                                  label={{
                                    value: `Promedio: ${avgLeads.toFixed(1)}`,
                                    position: 'insideTopRight',
                                    fill: colors.primary,
                                    fontSize: 12,
                                  }}
                                />
                                <ReferenceLine
                                  y={avgDeals}
                                  stroke={colors.secondary}
                                  strokeDasharray="5 5"
                                  strokeWidth={2}
                                  label={{
                                    value: `Promedio: ${avgDeals.toFixed(1)}`,
                                    position: 'insideBottomRight',
                                    fill: colors.secondary,
                                    fontSize: 12,
                                  }}
                                />
                              </LineChart>
                            );
                          })()}
                        </ResponsiveContainer>

                        {/* Average values display below chart */}
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-blue-600 font-medium mb-1">
                              Promedio de Leads (diario)
                            </p>
                            <p className="text-2xl font-bold text-blue-700">
                              {(() => {
                                const chartData = Object.keys({
                                  ...(displayedStats.leadsByDate || {}),
                                  ...(displayedStats.dealsByDate || {}),
                                })
                                  .sort((a, b) => a.localeCompare(b))
                                  .map((bucket) => ({
                                    bucket,
                                    leads: displayedStats.leadsByDate?.[bucket] ?? 0,
                                  }));
                                const totalLeads = chartData.reduce((sum, d) => sum + d.leads, 0);
                                const avgLeads = chartData.length > 0 ? totalLeads / chartData.length : 0;
                                return avgLeads.toFixed(1);
                              })()}
                            </p>
                          </div>
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-xs text-green-600 font-medium mb-1">
                              Promedio de Deals (diario)
                            </p>
                            <p className="text-2xl font-bold text-green-700">
                              {(() => {
                                const chartData = Object.keys({
                                  ...(displayedStats.leadsByDate || {}),
                                  ...(displayedStats.dealsByDate || {}),
                                })
                                  .sort((a, b) => a.localeCompare(b))
                                  .map((bucket) => ({
                                    bucket,
                                    deals: displayedStats.dealsByDate?.[bucket] ?? 0,
                                  }));
                                const totalDeals = chartData.reduce((sum, d) => sum + d.deals, 0);
                                const avgDeals = chartData.length > 0 ? totalDeals / chartData.length : 0;
                                return avgDeals.toFixed(1);
                              })()}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                {displayedStats && displayedStats.conversionByDate && Object.keys(displayedStats.conversionByDate).length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Conversión en el Tiempo</CardTitle>
                      <CardDescription>Evolución por periodo (2 días / semana / mes)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart
                          data={Object.entries(displayedStats.conversionByDate)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([bucket, rate]) => ({ bucket, conversion: rate }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="bucket"
                            tickFormatter={(value) => formatBucketLabel(selectedPeriod, String(value))}
                          />
                          <YAxis />
                          <Tooltip
                            labelFormatter={(label) => formatBucketLabel(selectedPeriod, String(label))}
                            formatter={(value: number) => [`${value}%`, 'Conversión']}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="conversion" stroke={colors.accent} name="% Conversión" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* SECCIÓN: MARKETING & CALIDAD DE LEADS */}
              <div className="grid gap-4 md:grid-cols-2">
                {displayedStats && displayedStats.leadsBySource && Object.entries(displayedStats.leadsBySource).some(([_source, count]) => count > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Leads por Fuente</CardTitle>
                      <CardDescription>Distribución de leads según su fuente de captación</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={Object.entries(displayedStats.leadsBySource)
                              .filter(([_source, count]) => count > 0) // Filtrar fuentes con valor 0
                              .map(([source, count]) => ({
                                name: source,
                                value: count
                              }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                            outerRadius={80}
                            fill={colors.primary}
                            dataKey="value"
                          >
                            {Object.entries(displayedStats.leadsBySource)
                              .filter(([_source, count]) => count > 0) // Filtrar fuentes con valor 0 para los colores
                              .map((entry, index) => {
                                return <Cell key={`cell-${index}`} fill={getChartColor(selectedDesarrollo, index)} />;
                              })}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {displayedStats && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Calidad de Leads</CardTitle>
                      <CardDescription>Leads de calidad vs leads totales</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Leads de Calidad</span>
                          <Badge variant="default" className="text-xs px-3 py-1">
                            {displayedStats.qualityLeads || 0}
                          </Badge>
                        </div>
                        <div className="w-full bg-muted rounded-full h-4">
                          <div
                            className="bg-primary h-4 rounded-full transition-all"
                            style={{
                              width: `${displayedStats.qualityLeadsPercentage || 0}%`,
                            }}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {(displayedStats.qualityLeadsPercentage || 0).toFixed(1)}% del total de leads
                        </p>
                        <div className="pt-4 border-t">
                          <p className="text-xs text-muted-foreground mb-4">
                            Un lead de calidad es aquel que ha sido contactado exitosamente y tiene solicitud de cotización o visita.
                          </p>

                          <h4 className="text-sm font-medium mb-3">Calidad por Fuente</h4>
                          <div className="space-y-3">
                            {Object.entries((displayedStats.qualityLeadsBySource || {}) as Record<string, number>)
                              .sort(([, a], [, b]) => b - a)
                              .map(([source, count]) => {
                                const total = displayedStats.qualityLeads || 1;
                                const percentage = Math.round((count / total) * 100);
                                return (
                                  <div key={source} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="truncate max-w-[150px]">{source}</span>
                                      <span className="font-medium">{count} ({percentage}%)</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2">
                                      <div
                                        className="bg-green-600 h-2 rounded-full"
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            {Object.keys(displayedStats.qualityLeadsBySource || {}).length === 0 && (
                              <p className="text-xs text-muted-foreground italic">Sin datos de fuentes</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {displayedStats && displayedStats.conversionBySource && Object.keys(displayedStats.conversionBySource).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Conversión por Fuente</CardTitle>
                      <CardDescription>Porcentaje de conversión según la fuente de captación</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Fuente</th>
                              <th className="text-right p-2">Conversión</th>
                              <th className="text-left p-2">Visual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(displayedStats.conversionBySource)
                              .map(([source, rate]) => ({ source, rate }))
                              .sort((a, b) => b.rate - a.rate)
                              .map(({ source, rate }) => {
                                // Clamp por si llega un valor fuera de rango (buena práctica para UI)
                                const safeRate = Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 0;

                                return (
                                  <tr key={source} className="border-b">
                                    <td className="p-2">{source}</td>
                                    <td className="text-right p-2 font-medium">
                                      {safeRate.toFixed(1)}%
                                    </td>
                                    <td className="p-2">
                                      <div className="w-full bg-muted rounded-full h-2">
                                        <div
                                          className="h-2 rounded-full"
                                          style={{
                                            width: `${safeRate}%`,
                                            backgroundColor: colors.secondary,
                                          }}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {displayedStats && displayedStats.channelConcentration && Object.keys(displayedStats.channelConcentration).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Dependencia de Canal</CardTitle>
                      <CardDescription>Porcentaje de concentración por canal de captación</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {Object.entries(displayedStats.channelConcentration)
                          .sort(([, a], [, b]) => b - a)
                          .map(([channel, percentage]) => (
                            <div key={channel} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span>{channel}</span>
                                <span className="font-medium">{percentage.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2">
                                <div
                                  className="h-2 rounded-full"
                                  style={{
                                    width: `${percentage}%`,
                                    backgroundColor: percentage > 50 ? colors.danger : percentage > 30 ? colors.warning : colors.success
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-4">
                        {Object.entries(displayedStats.channelConcentration).some(([, p]) => p > 50) && (
                          <span className="text-red-600">⚠️ Alta dependencia de un solo canal detectada</span>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* SECCIÓN: DESCARTES */}
              {displayedStats && displayedStats.leadsDiscardReasons && Object.keys(displayedStats.leadsDiscardReasons).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Análisis de Descartes</CardTitle>
                    <CardDescription>Motivos de descarte de leads y su impacto en la conversión</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div>
                      <h4 className="text-sm font-medium mb-4">Tabla de Descartes</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Motivo</th>
                              <th className="text-right p-2">Cantidad</th>
                              <th className="text-right p-2">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(displayedStats.leadsDiscardReasons)
                              .sort(([, a], [, b]) => b - a)
                              .map(([motivo, count]) => {
                                const porcentaje = displayedStats.totalLeads > 0
                                  ? Math.round((count / displayedStats.totalLeads) * 10000) / 100
                                  : 0;
                                return (
                                  <tr key={motivo} className="border-b">
                                    <td className="p-2">{motivo}</td>
                                    <td className="text-right p-2">{count}</td>
                                    <td className="text-right p-2">{porcentaje.toFixed(1)}%</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 p-3 bg-muted rounded-lg">
                        <p className="text-xs font-medium mb-1">Principales Causas:</p>
                        <ul className="text-xs text-muted-foreground list-disc list-inside">
                          {Object.entries(displayedStats.leadsDiscardReasons)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 3)
                            .map(([motivo, count]) => (
                              <li key={motivo}>{motivo}: {count} leads</li>
                            ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SECCIÓN: TIEMPOS DE CONTACTO */}
              {displayedStats && displayedStats.averageTimeToFirstContactByOwner && Object.keys(displayedStats.averageTimeToFirstContactByOwner).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Tiempos de contacto dentro de horario laboral</CardTitle>
                    <CardDescription>Tiempo promedio a primer contacto dentro de horario laboral por asesor</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Object.entries(displayedStats.averageTimeToFirstContactByOwner).map(([owner, time]) => ({
                        asesor: owner,
                        tiempo: time
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="asesor" angle={-45} textAnchor="end" height={100} />
                        <YAxis label={{ value: 'Minutos', angle: -90, position: 'insideLeft' }} />
                        <Tooltip formatter={(value: number) => [`${value} min`, 'Tiempo promedio (dentro de horario laboral)']} />
                        <Legend />
                        <Bar dataKey="tiempo" fill={colors.secondary} name="Tiempo (min)">
                          {Object.entries(displayedStats.averageTimeToFirstContactByOwner).map((entry, index) => {
                            const time = entry[1];
                            const color = time <= 30 ? colors.success : time <= 60 ? colors.warning : colors.danger;
                            return <Cell key={`cell-${index}`} fill={color} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: colors.success }}></div>
                        <span>≤ 30 min (Meta)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: colors.warning }}></div>
                        <span>31-60 min</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: colors.danger }}></div>
                        <span>&gt; 60 min</span>
                      </div>
                    </div>
                    {displayedAvgTimeToFirstContact > 0 && (
                      <div className="mt-4 p-3 bg-muted rounded-lg">
                        <p className="text-sm">
                          <span className="font-medium">Tiempo promedio general (dentro de horario laboral):</span>{' '}
                          {displayedAvgTimeToFirstContact.toFixed(1)} minutos
                          {displayedAvgTimeToFirstContact <= 30 ? (
                            <Badge variant="default" className="ml-2">✓ Meta alcanzada</Badge>
                          ) : (
                            <Badge variant="destructive" className="ml-2">Meta: 30 min</Badge>
                          )}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Nota:
                  El botón "Ver periodo anterior" ahora cambia TODO el dashboard.
                  Por eso ya no mostramos una sección extra separada para evitar duplicados. */}

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
                      {Object.entries(displayedStats?.leadsByStatus || {}).map(([status, count]) => {
                        const total = displayedStats?.totalLeads || 1;
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
                      {Object.entries(displayedStats?.dealsByStage || {}).map(([stage, count]) => {
                        const total = displayedStats?.totalDeals || 1;
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

        {/* Analytics */}
        <TabsContent value="analytics" className="flex-1 overflow-auto">
          {analyticsLoading ? (
            <div className="mt-6 flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Cargando analíticas avanzadas...</p>
            </div>
          ) : analyticsData ? (() => {
            // KPIs derivados del scorecard
            const sc = analyticsData.scorecard ?? [];
            const kpiLeads = sc.reduce((s: number, r: any) => s + (r.total_leads ?? 0), 0);
            const kpiDeals = sc.reduce((s: number, r: any) => s + (r.total_deals ?? 0), 0);
            const kpiCalls = sc.reduce((s: number, r: any) => s + (r.total_calls ?? 0), 0);
            const kpiConv = sc.length > 0 ? (sc.reduce((s: number, r: any) => s + (r.conversion_rate ?? 0), 0) / sc.length).toFixed(1) : '—';
            // Forecast total esperado
            const fc = analyticsData.forecast ?? [];
            const kpiForecast = fc.reduce((s: number, r: any) => s + (Number(r.expected_value) || 0), 0);
            // stageTime separado por tipo
            const st: any[] = analyticsData.stageTime ?? [];
            const stLeads = st.filter((r: any) => r.record_type === 'lead');
            const stDeals = st.filter((r: any) => r.record_type === 'deal');

            // Helper: funnel visual (CSS, no recharts)
            const FunnelViz = ({ items, colorFn }: { items: { stage: string; count: number; pct: number }[], colorFn: (i: number) => string }) => {
              if (items.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">Sin datos.</p>;
              const maxCount = Math.max(...items.map(r => r.count), 1);
              return (
                <div className="space-y-1.5">
                  {items.map((r, i) => {
                    const barW = Math.max(15, Math.round((r.count / maxCount) * 100));
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-32 text-right text-xs text-muted-foreground truncate shrink-0" title={r.stage}>{r.stage}</div>
                        <div className="flex-1 h-8 flex items-center">
                          <div
                            className="h-full rounded-md flex items-center justify-center text-xs font-bold text-white shadow-sm transition-all duration-300"
                            style={{ width: `${barW}%`, background: colorFn(i) }}
                          >
                            {r.count > 0 ? r.count : ''}
                          </div>
                        </div>
                        <div className="w-9 text-xs text-muted-foreground text-right shrink-0">{r.pct}%</div>
                      </div>
                    );
                  })}
                </div>
              );
            };

            // Helper: stage velocity cards
            const StageTimeCards = ({ stages, stuckThreshold }: { stages: any[], stuckThreshold: number }) => {
              if (stages.length === 0) return (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Clock className="h-7 w-7 opacity-30" />
                  <p className="text-xs">Sin datos de tiempo en etapa.</p>
                </div>
              );
              return (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {stages.map((s: any, i: number) => {
                    const isRed = s.avg_days > stuckThreshold * 2;
                    const isYellow = s.avg_days > stuckThreshold;
                    const borderColor = isRed ? '#ef4444' : isYellow ? '#f59e0b' : '#22c55e';
                    const bgGrad = isRed
                      ? 'linear-gradient(135deg,#fef2f2,#fff)'
                      : isYellow
                        ? 'linear-gradient(135deg,#fffbeb,#fff)'
                        : 'linear-gradient(135deg,#f0fdf4,#fff)';
                    const dayColor = isRed ? '#dc2626' : isYellow ? '#d97706' : '#16a34a';
                    return (
                      <div
                        key={i}
                        className="flex-shrink-0 w-40 rounded-xl p-3 border-l-4"
                        style={{ borderLeftColor: borderColor, background: bgGrad, borderTop: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}
                      >
                        <p className="text-xs text-muted-foreground truncate font-medium" title={s.stage}>{s.stage}</p>
                        <p className="text-2xl font-black mt-0.5" style={{ color: dayColor }}>
                          {s.avg_days > 0 ? `${s.avg_days}d` : '—'}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.count} registros</p>
                        {s.stuck_count > 0 && (
                          <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                            ⚠ {s.stuck_count} estancados
                          </span>
                        )}
                        <div className="mt-2 h-1 rounded-full bg-gray-200 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (s.avg_days / (stuckThreshold * 3)) * 100)}%`, backgroundColor: dayColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            };

            return (
              <div className="mt-4 space-y-5">

                {/* ── KPI row ────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {[
                    {
                      label: 'Total Leads', value: kpiLeads, sub: 'en el período',
                      grad: 'linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%)',
                    },
                    {
                      label: 'Total Deals', value: kpiDeals, sub: 'oportunidades',
                      grad: 'linear-gradient(135deg,#5b21b6 0%,#8b5cf6 100%)',
                    },
                    {
                      label: 'Conv. Prom.', value: `${kpiConv}%`, sub: 'leads → deals',
                      grad: 'linear-gradient(135deg,#065f46 0%,#10b981 100%)',
                    },
                    {
                      label: 'Llamadas', value: kpiCalls, sub: 'registradas',
                      grad: 'linear-gradient(135deg,#78350f 0%,#f59e0b 100%)',
                    },
                    {
                      label: 'Pronóstico', value: kpiForecast > 0 ? `$${(kpiForecast / 1_000_000).toFixed(1)}M` : '—', sub: 'ingreso esperado',
                      grad: 'linear-gradient(135deg,#881337 0%,#f43f5e 100%)',
                    },
                  ].map(k => (
                    <div
                      key={k.label}
                      className="rounded-xl p-4 text-white shadow-sm"
                      style={{ background: k.grad }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-widest text-white/80">{k.label}</p>
                      <p className="text-3xl font-black mt-1 leading-none text-white">{k.value}</p>
                      <p className="text-xs text-white/70 mt-1">{k.sub}</p>
                    </div>
                  ))}
                </div>

                {/* ── Funnel ─────────────────────────────────── */}
                {analyticsData.funnel && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Funnel de Leads</CardTitle>
                          <Badge variant="outline" className="text-xs font-semibold">
                            {(analyticsData.funnel.leads ?? []).reduce((s: number, r: any) => s + r.count, 0)} leads
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <FunnelViz
                          items={analyticsData.funnel.leads ?? []}
                          colorFn={i => {
                            const blues = ['#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#bfdbfe'];
                            return blues[i] || '#dbeafe';
                          }}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">Funnel de Deals</CardTitle>
                          <Badge variant="outline" className="text-xs font-semibold">
                            {(analyticsData.funnel.deals ?? []).reduce((s: number, r: any) => s + r.count, 0)} deals
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <FunnelViz
                          items={analyticsData.funnel.deals ?? []}
                          colorFn={i => {
                            const purples = ['#5b21b6','#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd'];
                            return purples[i] || '#ddd6fe';
                          }}
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ── Pipeline Actual ─────────────────────────── */}
                {analyticsData.stageTime && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-base">Tiempo Actual en Etapa</CardTitle>
                          <CardDescription className="text-xs">
                            Días promedio que los registros activos llevan en cada etapa — color: <span className="text-emerald-600 font-medium">rápido</span> / <span className="text-amber-600 font-medium">medio</span> / <span className="text-red-600 font-medium">estancado</span>
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {stLeads.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Leads</p>
                          <StageTimeCards stages={stLeads} stuckThreshold={7} />
                        </div>
                      )}
                      {stDeals.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deals</p>
                          <StageTimeCards stages={stDeals} stuckThreshold={14} />
                        </div>
                      )}
                      {stLeads.length === 0 && stDeals.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                          <Clock className="h-7 w-7 opacity-30" />
                          <p className="text-sm">Sin datos de tiempo en etapa. Verifica que el campo <code className="text-xs bg-muted px-1 rounded">Tiempo_En_Fase</code> se esté sincronizando desde Zoho.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ── Aging + Heatmap ─────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analyticsData.aging && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Antigüedad de Leads Activos</CardTitle>
                        <CardDescription className="text-xs">Tiempo desde creación — excluye descartados y convertidos</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {analyticsData.aging.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                            <Users className="h-7 w-7 opacity-30" />
                            <p className="text-sm">Sin leads activos.</p>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-5 gap-2 mb-4">
                              {analyticsData.aging.map((r: any, i: number) => {
                                const colors = ['#16a34a','#84cc16','#d97706','#ea580c','#dc2626'];
                                const bgs = ['#f0fdf4','#f7fee7','#fffbeb','#fff7ed','#fef2f2'];
                                return (
                                  <div key={i} className="rounded-lg p-2 text-center" style={{ background: bgs[i] || '#f9fafb' }}>
                                    <div className="text-xl font-black" style={{ color: colors[i] || '#6b7280' }}>{r.count}</div>
                                    <div className="text-xs text-muted-foreground font-medium">{r.bucket}</div>
                                  </div>
                                );
                              })}
                            </div>
                            <ResponsiveContainer width="100%" height={120}>
                              <BarChart data={analyticsData.aging} margin={{ right: 5, left: -15 }}>
                                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}`, 'Leads']} />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                  {analyticsData.aging.map((_: any, i: number) => (
                                    <Cell key={i} fill={['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'][i] || '#6b7280'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {analyticsData.heatmap && (
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <CardTitle className="text-base">Heatmap de Llamadas</CardTitle>
                            <CardDescription className="text-xs">Intensidad por día y hora — zona Mérida</CardDescription>
                          </div>
                          {analyticsData.heatmap.length > 0 && (
                            <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <span className="mr-1">Bajo</span>
                              {['#f1f5f9','#bfdbfe','#93c5fd','#3b82f6','#1d4ed8','#1e3a8a'].map((c, i) => (
                                <span key={i} className="inline-block w-4 h-4 rounded-sm" style={{ backgroundColor: c }} />
                              ))}
                              <span className="ml-1">Alto</span>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {analyticsData.heatmap.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                            <Calendar className="h-7 w-7 opacity-30" />
                            <p className="text-sm text-center">Sin llamadas. Ejecuta un sync completo.</p>
                          </div>
                        ) : (() => {
                          const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
                          const HOURS = Array.from({ length: 24 }, (_, i) => i);
                          const heatmapMap = new Map<string, number>();
                          let maxVal = 1;
                          analyticsData.heatmap.forEach((r: any) => {
                            heatmapMap.set(`${r.day_of_week}-${r.hour_of_day}`, r.count);
                            if (r.count > maxVal) maxVal = r.count;
                          });
                          const cellColor = (v: number): string => {
                            const pct = v / maxVal;
                            if (pct === 0) return '#f1f5f9';
                            if (pct < 0.2) return '#bfdbfe';
                            if (pct < 0.4) return '#93c5fd';
                            if (pct < 0.65) return '#3b82f6';
                            if (pct < 0.85) return '#1d4ed8';
                            return '#1e3a8a';
                          };
                          return (
                            <div className="overflow-x-auto">
                              <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `44px repeat(24, 22px)` }}>
                                <div />
                                {HOURS.map(h => <div key={h} className="text-center text-[10px] text-muted-foreground">{h}</div>)}
                                {DAYS.map((day, d) => (
                                  <>
                                    <div key={`l-${d}`} className="text-[11px] font-medium text-muted-foreground flex items-center">{day}</div>
                                    {HOURS.map(h => {
                                      const val = heatmapMap.get(`${d}-${h}`) || 0;
                                      return (
                                        <div
                                          key={`${d}-${h}`}
                                          title={`${day} ${h}:00 — ${val} llamadas`}
                                          className="h-6 rounded-sm cursor-default hover:opacity-75 transition-opacity"
                                          style={{ backgroundColor: cellColor(val) }}
                                        />
                                      );
                                    })}
                                  </>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* ── Forecast ────────────────────────────────── */}
                {analyticsData.forecast && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-base">Pronóstico de Ingresos</CardTitle>
                          <CardDescription className="text-xs">Escenarios por mes de cierre — pesimista / esperado / optimista</CardDescription>
                        </div>
                        {analyticsData.forecast.length > 0 && (
                          <div className="flex gap-3 text-xs">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#fca5a5' }} />Pesimista</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-blue-500" />Esperado</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#86efac' }} />Optimista</span>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.forecast.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                          <TrendingUp className="h-8 w-8 opacity-30" />
                          <p className="text-sm">Sin deals con fecha de cierre en el período.</p>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={280}>
                          <ComposedChart data={analyticsData.forecast} margin={{ right: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={(v: number) => `$${(v / 1_000).toFixed(0)}k`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip
                              contentStyle={{ borderRadius: 8, fontSize: 12 }}
                              formatter={(v: any, name: string) => [`$${Number(v).toLocaleString('es-MX')}`, name]}
                            />
                            <Bar dataKey="worst_case" name="Pesimista" fill="#fca5a5" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="expected_value" name="Esperado" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="best_case" name="Optimista" fill="#86efac" radius={[3, 3, 0, 0]} />
                            <Line type="monotone" dataKey="expected_value" name="Tendencia" stroke="#1e40af" dot={{ r: 3, fill: '#1e40af' }} strokeWidth={2} legendType="none" />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* ── Scorecard ────────────────────────────────── */}
                {analyticsData.scorecard && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-base">Scorecard de Asesores</CardTitle>
                          <CardDescription className="text-xs">Métricas consolidadas — clic en encabezado para ordenar</CardDescription>
                        </div>
                        {analyticsData.scorecard.length > 0 && (
                          <Badge variant="outline" className="text-xs">{analyticsData.scorecard.length} asesores</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {analyticsData.scorecard.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                          <Users className="h-8 w-8 opacity-30" />
                          <p className="text-sm">Sin datos de asesores.</p>
                        </div>
                      ) : (() => {
                        const cols: { key: string; label: string; align?: string }[] = [
                          { key: 'owner_name', label: 'Asesor' },
                          { key: 'total_leads', label: 'Leads', align: 'right' },
                          { key: 'total_deals', label: 'Deals', align: 'right' },
                          { key: 'closed_won', label: 'Cerrados', align: 'right' },
                          { key: 'conversion_rate', label: 'Conv.', align: 'center' },
                          { key: 'total_calls', label: 'Llamadas', align: 'right' },
                          { key: 'avg_deal_value', label: 'Val. Prom.', align: 'right' },
                        ];
                        const maxLeads = Math.max(...analyticsData.scorecard.map((r: any) => r.total_leads ?? 0), 1);
                        const sorted = [...analyticsData.scorecard].sort((a: any, b: any) => {
                          const av = a[analyticsSortKey] ?? 0;
                          const bv = b[analyticsSortKey] ?? 0;
                          if (typeof av === 'string') return analyticsSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                          return analyticsSortAsc ? av - bv : bv - av;
                        });
                        const toggleSort = (key: string) => {
                          if (analyticsSortKey === key) setAnalyticsSortAsc(prev => !prev);
                          else { setAnalyticsSortKey(key); setAnalyticsSortAsc(false); }
                        };
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-muted/30">
                                  {cols.map(col => (
                                    <th
                                      key={col.key}
                                      className={`py-2 px-3 cursor-pointer select-none hover:bg-muted/60 font-semibold text-xs text-muted-foreground uppercase tracking-wide transition-colors text-${col.align ?? 'left'}`}
                                      onClick={() => toggleSort(col.key)}
                                    >
                                      {col.label}{analyticsSortKey === col.key ? (analyticsSortAsc ? ' ↑' : ' ↓') : ''}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {sorted.map((row: any, i: number) => {
                                  const convRate = row.conversion_rate ?? 0;
                                  const convColor = convRate >= 30 ? 'text-emerald-700 bg-emerald-100' : convRate >= 15 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';
                                  const leadsWidth = Math.round(((row.total_leads ?? 0) / maxLeads) * 100);
                                  return (
                                    <tr key={i} className={`border-b transition-colors hover:bg-muted/20 ${i === 0 && !analyticsSortAsc ? 'bg-primary/5' : ''}`}>
                                      <td className="py-2.5 px-3">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm w-5 text-center">{['🥇','🥈','🥉'][i] ?? ''}</span>
                                          <div>
                                            <div className="font-semibold text-sm">{row.owner_name || '—'}</div>
                                            <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden w-24">
                                              <div className="h-full rounded-full bg-primary/70" style={{ width: `${leadsWidth}%` }} />
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-semibold">{row.total_leads ?? 0}</td>
                                      <td className="py-2.5 px-3 text-right">{row.total_deals ?? 0}</td>
                                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">{row.closed_won ?? 0}</td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${convColor}`}>
                                          {convRate}%
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-right">{row.total_calls ?? 0}</td>
                                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                                        {row.avg_deal_value > 0 ? `$${Number(row.avg_deal_value).toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}

              </div>
            );
          })() : (
            <div className="mt-6 flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
              <TrendingUp className="h-10 w-10 opacity-20" />
              <p className="text-sm">Selecciona el tab Analytics para cargar las métricas avanzadas.</p>
            </div>
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
}


