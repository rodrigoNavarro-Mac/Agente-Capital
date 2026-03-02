'use client';

/**
 * =====================================================
 * CONVERSACIONES WHATSAPP - Vista por rol y depuración
 * =====================================================
 * Admin/CEO: ven todas las conversaciones (debug). Sales manager: solo desarrollos asignados
 * y opción "Solo mis leads". Incluye estado de handover al asesor e historial.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getUserDevelopments } from '@/lib/api';

interface UserDataPreview {
    name?: string;
    nombre?: string;
    horario_preferido?: string;
    intencion?: string;
    [key: string]: unknown;
}

interface ConversationRow {
    id: number;
    user_phone: string;
    development: string;
    state: string;
    last_interaction: string;
    is_qualified: boolean;
    zoho_lead_id: string | null;
    user_data: UserDataPreview;
    created_at: string;
    updated_at: string;
    cliq_channel_id?: string | null;
    cliq_channel_unique_name?: string | null;
    assigned_agent_email?: string | null;
    context_sent_at?: string | null;
    last_cliq_wa_sent_at?: string | null;
    last_cliq_wa_error?: string | null;
}

function maskPhone(phone: string): string {
    if (!phone || phone.length < 6) return '***';
    return phone.substring(0, 4) + '***' + phone.slice(-3);
}

/** Handover status for display: Enviado | Sin asignar | Error */
function getHandoverStatus(c: ConversationRow): { label: string; className: string } {
    if (c.last_cliq_wa_error) {
        return { label: 'Error', className: 'text-red-700 font-medium' };
    }
    if (c.cliq_channel_id && c.context_sent_at) {
        return { label: 'Enviado', className: 'text-green-700 font-medium' };
    }
    if (c.is_qualified && !c.assigned_agent_email) {
        return { label: 'Sin asignar', className: 'text-amber-600' };
    }
    if (!c.is_qualified) {
        return { label: '-', className: 'text-gray-400' };
    }
    return { label: 'Pendiente', className: 'text-gray-600' };
}

const retryButtonClass = 'text-xs px-2 py-1 rounded disabled:opacity-50 transition-colors';

/** Badge pill for status */
function Badge({ children, variant }: { children: React.ReactNode; variant: 'success' | 'warning' | 'error' | 'neutral' | 'info' }) {
    const base = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium';
    const variants = {
        success: 'bg-green-100 text-green-800',
        warning: 'bg-amber-100 text-amber-800',
        error: 'bg-red-100 text-red-800',
        neutral: 'bg-gray-100 text-gray-700',
        info: 'bg-sky-100 text-sky-800',
    };
    return <span className={`${base} ${variants[variant]}`}>{children}</span>;
}

function RetryLeadCrmButton({
    userPhone,
    development,
    onDone,
    onError,
}: {
    userPhone: string;
    development: string;
    onDone: () => void;
    onError: (message: string) => void;
}) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const res = await fetch('/api/whatsapp/conversations/retry-handover', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ user_phone: userPhone, development }),
            });
            const data = await res.json();
            if (!res.ok) {
                onError(data.error || 'Error al reintentar lead CRM');
                return;
            }
            onDone();
        } catch {
            onError('Error de red al reintentar lead CRM');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className={`${retryButtonClass} bg-blue-100 text-blue-800 hover:bg-blue-200`}
        >
            {loading ? '...' : 'Reintentar lead CRM'}
        </button>
    );
}

function RetryCliqButton({
    userPhone,
    development,
    onDone,
    onError,
}: {
    userPhone: string;
    development: string;
    onDone: () => void;
    onError: (message: string) => void;
}) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const res = await fetch('/api/whatsapp/conversations/retry-cliq', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ user_phone: userPhone, development }),
            });
            const data = await res.json();
            if (!res.ok) {
                onError(data.error || 'Error al reintentar Cliq');
                return;
            }
            onDone();
        } catch {
            onError('Error de red al reintentar Cliq');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className={`${retryButtonClass} bg-amber-100 text-amber-800 hover:bg-amber-200`}
        >
            {loading ? '...' : 'Reintentar Cliq'}
        </button>
    );
}

function ResendContextButton({
    userPhone,
    development,
    onDone,
    onError,
}: {
    userPhone: string;
    development: string;
    onDone: () => void;
    onError: (message: string) => void;
}) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const res = await fetch('/api/whatsapp/conversations/resend-cliq-context', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ user_phone: userPhone, development }),
            });
            const data = await res.json();
            if (!res.ok) {
                onError(data.error || 'Error al reenviar contexto');
                return;
            }
            onDone();
        } catch {
            onError('Error de red al reenviar contexto');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className={`${retryButtonClass} bg-green-100 text-green-800 hover:bg-green-200`}
        >
            {loading ? '...' : 'Reenviar contexto'}
        </button>
    );
}

function DebugCliqButton({
    userPhone,
    development,
    onShowDebug,
}: {
    userPhone: string;
    development: string;
    onShowDebug: (data: unknown) => void;
}) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const res = await fetch(
                `/api/debug/cliq-conversation?user_phone=${encodeURIComponent(userPhone)}&development=${encodeURIComponent(development)}`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            const data = await res.json();
            onShowDebug(data);
        } catch (e) {
            onShowDebug({ ok: false, error: String(e) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className={`${retryButtonClass} bg-gray-100 text-gray-700 hover:bg-gray-200`}
        >
            {loading ? '...' : 'Debug'}
        </button>
    );
}

/** Unified history entry: bot exchange or bridge WA-Cliq / Cliq-WA */
type HistoryEntry =
    | { type: 'bot'; id: number; message: string; response: string; created_at: string; received_at?: string | null; response_at?: string | null }
    | { type: 'wa_cliq'; id: number; content: string; created_at: string }
    | { type: 'cliqq_wa'; id: number; content: string; created_at: string };

function HistoryWAButton({
    userPhone,
    development,
    maskedPhone,
    onShowHistory,
}: {
    userPhone: string;
    development: string;
    maskedPhone: string;
    onShowHistory: (data: { userPhone: string; development: string; logs: HistoryEntry[]; maskedPhone: string }) => void;
}) {
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        setLoading(true);
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const res = await fetch(
                `/api/whatsapp/logs/conversation?user_phone=${encodeURIComponent(userPhone)}&development=${encodeURIComponent(development)}`,
                { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            const data = await res.json();
            if (!res.ok) {
                onShowHistory({ userPhone, development, logs: [], maskedPhone });
                return;
            }
            const raw = data.entries ?? data.logs ?? [];
            const logs = raw.map((l: HistoryEntry) => ({
                ...l,
                created_at: typeof l.created_at === 'string' ? l.created_at : (l as unknown as { created_at?: Date }).created_at?.toISOString?.() ?? '',
            }));
            onShowHistory({ userPhone, development, logs, maskedPhone });
        } catch {
            onShowHistory({ userPhone, development, logs: [], maskedPhone });
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className={`${retryButtonClass} bg-sky-100 text-sky-800 hover:bg-sky-200`}
        >
            {loading ? '...' : 'Historial WA'}
        </button>
    );
}

const FULL_ACCESS_ROLES = ['admin', 'ceo'];
const DEFAULT_DEVELOPMENTS = ['FUEGO', 'AMURA', 'PUNTO_TIERRA'];

interface ConversationKPIs {
    total: number;
    active: number;
    handover: number;
    noResponse15m: number;
    withError: number;
    conversionPct: number;
    slaAvgMs: number | null;
    firstResponseAvgMs: number | null;
}

function formatSlaMs(ms: number | null): string {
    if (ms == null) return '-';
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    if (min > 0) return `${min}m ${sec % 60}s`;
    return `${sec}s`;
}

/** Minutes since last_interaction; null if closed */
function minsSinceLastInteraction(lastInteraction: string | null, state: string): number | null {
    if (state === 'SALIDA_ELEGANTE') return null;
    if (!lastInteraction) return null;
    const diff = Date.now() - new Date(lastInteraction).getTime();
    return Math.floor(diff / 60000);
}

type PriorityLevel = 'red' | 'orange' | 'green' | 'black';

function getPriority(state: string, mins: number | null): PriorityLevel {
    if (state === 'SALIDA_ELEGANTE') return 'black';
    if (mins == null) return 'green';
    if (mins >= 15) return 'red';
    if (mins >= 5) return 'orange';
    return 'green';
}

function formatMinsAgo(mins: number | null): string {
    if (mins == null) return '-';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export default function ConversacionesPage() {
    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [development, setDevelopment] = useState<string>('');
    const [scope, setScope] = useState<'all' | 'my_leads'>('my_leads');
    const [userRole, setUserRole] = useState<string | null>(null);
    const [userId, setUserId] = useState<number | null>(null);
    const [developmentOptions, setDevelopmentOptions] = useState<string[]>([]);
    const [debugPanel, setDebugPanel] = useState<unknown>(null);
    const [historyPanel, setHistoryPanel] = useState<{
        userPhone: string;
        development: string;
        logs: HistoryEntry[];
        maskedPhone: string;
    } | null>(null);
    const [openActionsRowId, setOpenActionsRowId] = useState<number | null>(null);
    const [kpis, setKpis] = useState<ConversationKPIs | null>(null);
    const [detailRow, setDetailRow] = useState<ConversationRow | null>(null);
    const [detailLogs, setDetailLogs] = useState<HistoryEntry[]>([]);
    const [detailLogsLoading, setDetailLogsLoading] = useState(false);
    const [filterEstado, setFilterEstado] = useState<string>('');
    const [showAlertas, setShowAlertas] = useState(false);
    const [showDebugDrawer, setShowDebugDrawer] = useState(false);
    const actionsMenuRef = useRef<HTMLDivElement>(null);
    const detailDrawerScrollRef = useRef<HTMLDivElement>(null);
    const historyPanelScrollRef = useRef<HTMLDivElement>(null);

    const fullAccess = userRole !== null && FULL_ACCESS_ROLES.includes(userRole);

    const filteredConversations = React.useMemo(() => {
        if (!filterEstado) return conversations;
        return conversations.filter((c) => {
            const mins = minsSinceLastInteraction(c.last_interaction, c.state);
            if (filterEstado === 'handover') return c.state === 'CLIENT_ACCEPTA' && c.cliq_channel_id;
            if (filterEstado === 'sin_respuesta_15') return mins != null && mins >= 15 && c.state !== 'SALIDA_ELEGANTE';
            if (filterEstado === 'errores') return !!c.last_cliq_wa_error;
            if (filterEstado === 'activas') return c.state !== 'SALIDA_ELEGANTE' && (mins == null || mins < 15);
            if (filterEstado === 'filtro_intencion') return c.state === 'FILTRO_INTENCION';
            return true;
        });
    }, [conversations, filterEstado]);

    const alertasCount = (kpis?.noResponse15m ?? 0) + (kpis?.withError ?? 0);

    useEffect(() => {
        if (openActionsRowId === null) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
                setOpenActionsRowId(null);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [openActionsRowId]);

    useEffect(() => {
        if (!detailRow) {
            setDetailLogs([]);
            return;
        }
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        if (!token) return;
        setDetailLogsLoading(true);
        fetch(
            `/api/whatsapp/logs/conversation?user_phone=${encodeURIComponent(detailRow.user_phone)}&development=${encodeURIComponent(detailRow.development)}&limit=100`,
            { headers: { Authorization: `Bearer ${token}` } }
        )
            .then((res) => (res.ok ? res.json() : { entries: [] }))
            .then((data) => {
                const raw = data.entries ?? data.logs ?? [];
                const normalized = raw.map((l: HistoryEntry) => ({
                    ...l,
                    created_at: typeof l.created_at === 'string' ? l.created_at : (l as unknown as { created_at?: Date }).created_at?.toISOString?.() ?? '',
                }));
                setDetailLogs(normalized);
            })
            .catch(() => setDetailLogs([]))
            .finally(() => setDetailLogsLoading(false));
    }, [detailRow]);

    // Scroll drawer to bottom when messages load so user sees latest first
    useEffect(() => {
        if (detailLogsLoading || detailLogs.length === 0) return;
        const el = detailDrawerScrollRef.current;
        if (el) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
            });
        }
    }, [detailLogsLoading, detailLogs.length]);

    // Scroll history panel to bottom when opened so user sees latest messages
    useEffect(() => {
        if (!historyPanel?.logs?.length) return;
        const el = historyPanelScrollRef.current;
        if (el) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
            });
        }
    }, [historyPanel]);

    // Load user from token and allowed developments for non-admin
    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        if (!token) {
            setUserRole(null);
            setUserId(null);
            setDevelopmentOptions(DEFAULT_DEVELOPMENTS);
            return;
        }
        try {
            const payload = JSON.parse(atob(token.split('.')[1])) as { userId?: number; role?: string };
            const uid = payload.userId;
            const role = payload.role;
            setUserId(uid ?? null);
            setUserRole(role ?? null);
            if (role && FULL_ACCESS_ROLES.includes(role)) {
                setDevelopmentOptions(DEFAULT_DEVELOPMENTS);
            } else if (role && typeof uid === 'number') {
                getUserDevelopments(uid)
                    .then((devs) => {
                        const withQuery = devs.filter((d) => d.can_query);
                        const names = Array.from(new Set(withQuery.map((d) => d.development)));
                        setDevelopmentOptions(names.length > 0 ? names : []);
                        if (names.length > 0) {
                            setDevelopment((prev) => (prev ? prev : names[0]));
                        }
                    })
                    .catch(() => setDevelopmentOptions([]));
            }
        } catch {
            setUserRole(null);
            setUserId(null);
            setDevelopmentOptions([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to load user and developments
    }, []);

    const fetchConversations = useCallback(async () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        if (!token) {
            setError('No autorizado. Inicia sesión de nuevo.');
            setConversations([]);
            setLoading(false);
            return;
        }
        const params = new URLSearchParams({ limit: '100' });
        if (development) params.set('development', development);
        if (!fullAccess && userRole === 'sales_manager') params.set('scope', scope);
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [convRes, kpiRes] = await Promise.all([
                fetch(`/api/whatsapp/conversations?${params}`, { headers }),
                fetch(`/api/whatsapp/conversations/kpis?${params}`, { headers }),
            ]);
            if (convRes.status === 401 || kpiRes.status === 401) {
                setError('No autorizado. Inicia sesión de nuevo.');
                setConversations([]);
                return;
            }
            if (convRes.status === 403) {
                const data = await convRes.json().catch(() => ({}));
                setError(data.error || 'Sin permiso para ver estas conversaciones.');
                setConversations([]);
                return;
            }
            if (!convRes.ok) throw new Error('Error al cargar conversaciones');
            const data = await convRes.json();
            setConversations(data.conversations || []);
            setError(null);
            if (kpiRes.ok) {
                const kpiData = await kpiRes.json();
                setKpis(kpiData);
            } else {
                setKpis(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido');
            setConversations([]);
            setKpis(null);
        } finally {
            setLoading(false);
        }
    }, [development, scope, fullAccess, userRole]);

    useEffect(() => {
        if (userRole === null && userId === null) {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            if (!token) {
                setLoading(false);
                setError('No autorizado. Inicia sesión de nuevo.');
                return;
            }
        }
        setLoading(true);
        fetchConversations();
        const interval = setInterval(fetchConversations, 15000);
        return () => clearInterval(interval);
    }, [fetchConversations, userRole, userId]);

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50/80 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
                    <h2 className="text-sm font-semibold text-red-800">Error</h2>
                    <p className="mt-2 text-sm text-red-700">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/80">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {/* KPI strip - vision ejecutiva */}
                {kpis && (
                    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Activas</p>
                            <p className="mt-0.5 text-lg font-semibold text-gray-900">{kpis.active}</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Handover</p>
                            <p className="mt-0.5 text-lg font-semibold text-sky-700">{kpis.handover}</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Sin respuesta 15m+</p>
                            <p className="mt-0.5 text-lg font-semibold text-amber-700">{kpis.noResponse15m}</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Con error WA</p>
                            <p className="mt-0.5 text-lg font-semibold text-red-700">{kpis.withError}</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">SLA prom.</p>
                            <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatSlaMs(kpis.slaAvgMs)}</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Conversión</p>
                            <p className="mt-0.5 text-lg font-semibold text-green-700">{kpis.conversionPct}%</p>
                        </div>
                    </div>
                )}

                {/* Header card */}
                <div className="mb-6 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-lg font-semibold text-gray-900">Conversaciones WhatsApp</h1>
                            <p className="mt-0.5 text-sm text-gray-500">
                                {fullAccess
                                    ? 'Vista completa para depuración. Actualización cada 15 s.'
                                    : 'Solo tus desarrollos. Actualización cada 15 s.'}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-500">Desarrollo</label>
                                <select
                                    value={development}
                                    onChange={(e) => setDevelopment(e.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                >
                                    <option value="">{fullAccess ? 'Todos' : 'Todos (mis desarrollos)'}</option>
                                    {developmentOptions.map((dev) => (
                                        <option key={dev} value={dev}>{dev}</option>
                                    ))}
                                </select>
                            </div>
                            {!fullAccess && userRole === 'sales_manager' && (
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-medium text-gray-500">Ver</label>
                                    <select
                                        value={scope}
                                        onChange={(e) => setScope(e.target.value as 'all' | 'my_leads')}
                                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                    >
                                        <option value="my_leads">Solo mis leads</option>
                                        <option value="all">Todas (mis desarrollos)</option>
                                    </select>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-500">Filtro</label>
                                <select
                                    value={filterEstado}
                                    onChange={(e) => setFilterEstado(e.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                >
                                    <option value="">Todas</option>
                                    <option value="activas">Activas recientes</option>
                                    <option value="handover">En handover</option>
                                    <option value="sin_respuesta_15">Sin respuesta 15m+</option>
                                    <option value="errores">Solo errores</option>
                                    <option value="filtro_intencion">Filtro intención</option>
                                </select>
                            </div>
                            {alertasCount > 0 && (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowAlertas(!showAlertas)}
                                        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
                                    >
                                        Alertas ({alertasCount})
                                    </button>
                                    {showAlertas && (
                                        <>
                                            <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                                                {kpis && kpis.noResponse15m > 0 && (
                                                    <div className="px-3 py-1.5 text-xs text-amber-700">
                                                        Sin respuesta 15m+: {kpis.noResponse15m}
                                                    </div>
                                                )}
                                                {kpis && kpis.withError > 0 && (
                                                    <div className="px-3 py-1.5 text-xs text-red-700">
                                                        Error envío WA: {kpis.withError}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="fixed inset-0 z-20" onClick={() => setShowAlertas(false)} aria-hidden />
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Debug panel modal */}
                {debugPanel !== null && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                                <h2 className="text-sm font-semibold text-gray-800">Debug Cliq</h2>
                                <button
                                    type="button"
                                    onClick={() => setDebugPanel(null)}
                                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
                                >
                                    Cerrar
                                </button>
                            </div>
                            <div className="max-h-[70vh] overflow-auto p-4">
                                {typeof debugPanel === 'object' && debugPanel !== null && 'thread' in debugPanel && (debugPanel as { thread?: { cliq_channel_unique_name?: string } }).thread?.cliq_channel_unique_name && (
                                    <p className="mb-3">
                                        <a
                                            href="https://cliq.zoho.com"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-violet-600 hover:underline"
                                        >
                                            Abrir canal en Cliq (#{(debugPanel as { thread: { cliq_channel_unique_name: string } }).thread.cliq_channel_unique_name})
                                        </a>
                                    </p>
                                )}
                                <pre className="rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100 overflow-x-auto">
                                    {JSON.stringify(debugPanel, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}

                {/* Detail drawer - panel lateral */}
                {detailRow && (
                    <>
                        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setDetailRow(null)} aria-hidden />
                        <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl">
                            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
                                <h2 className="text-sm font-semibold text-gray-800">
                                    Detalle – {maskPhone(detailRow.user_phone)} / {detailRow.development}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setDetailRow(null)}
                                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
                                >
                                    Cerrar
                                </button>
                            </div>
                            <div ref={detailDrawerScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                                <div>
                                    <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">Estado</h3>
                                    <p className="text-sm text-gray-800">{detailRow.state}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">Handover: {getHandoverStatus(detailRow).label}</p>
                                </div>
                                <div>
                                    <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">Últimos mensajes</h3>
                                    {detailLogsLoading ? (
                                        <p className="text-sm text-gray-500">Cargando...</p>
                                    ) : detailLogs.length === 0 ? (
                                        <p className="text-sm text-gray-500">Sin mensajes</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {detailLogs.map((entry) => {
                                                const key = `${entry.type}-${entry.id}`;
                                                if (entry.type === 'bot') {
                                                    return (
                                                        <div key={key} className="space-y-1">
                                                            <div className="rounded bg-gray-100 px-2 py-1.5 text-xs text-gray-700">
                                                                <span className="text-gray-400">{format(new Date(entry.created_at), 'dd/MM HH:mm', { locale: es })} Cliente</span>
                                                                <p className="mt-0.5 break-words">{entry.message}</p>
                                                            </div>
                                                            <div className="rounded bg-sky-50 px-2 py-1.5 text-xs text-gray-700 ml-2">
                                                                <p className="break-words">{entry.response}</p>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                if (entry.type === 'wa_cliq') {
                                                    return (
                                                        <div key={key} className="rounded border border-amber-200 bg-amber-50/80 px-2 py-1.5 text-xs text-amber-900">
                                                            <span className="text-amber-600">{format(new Date(entry.created_at), 'dd/MM HH:mm', { locale: es })} Enviado a Cliq</span>
                                                            <p className="mt-0.5 break-words">{entry.content}</p>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div key={key} className="rounded bg-emerald-50 px-2 py-1.5 text-xs text-gray-700 ml-2">
                                                        <span className="text-emerald-700">{format(new Date(entry.created_at), 'dd/MM HH:mm', { locale: es })} Asesor (Cliq)</span>
                                                        <p className="mt-0.5 break-words">{entry.content}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                {detailRow.user_data && Object.keys(detailRow.user_data).length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">Contexto</h3>
                                        <pre className="rounded bg-gray-50 p-2 text-xs text-gray-700 overflow-auto max-h-32">
                                            {JSON.stringify(detailRow.user_data, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                <div className="border-t border-gray-100 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowDebugDrawer(!showDebugDrawer)}
                                        className="text-xs font-medium text-gray-500 hover:text-gray-700"
                                    >
                                        {showDebugDrawer ? 'Ocultar' : 'Modo Debug'} técnico
                                    </button>
                                    {showDebugDrawer && (
                                        <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-gray-100">
                                            {JSON.stringify(
                                                {
                                                    user_phone: detailRow.user_phone,
                                                    development: detailRow.development,
                                                    state: detailRow.state,
                                                    cliq_channel_id: detailRow.cliq_channel_id,
                                                    cliq_channel_unique_name: detailRow.cliq_channel_unique_name,
                                                    assigned_agent_email: detailRow.assigned_agent_email,
                                                    last_cliq_wa_error: detailRow.last_cliq_wa_error,
                                                    last_interaction: detailRow.last_interaction,
                                                },
                                                null,
                                                2
                                            )}
                                        </pre>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                                    <HistoryWAButton
                                        userPhone={detailRow.user_phone}
                                        development={detailRow.development}
                                        maskedPhone={maskPhone(detailRow.user_phone)}
                                        onShowHistory={(data) => {
                                            setHistoryPanel(data);
                                            setDetailRow(null);
                                        }}
                                    />
                                    {detailRow.state === 'CLIENT_ACCEPTA' && detailRow.is_qualified && (
                                        <>
                                            <RetryLeadCrmButton userPhone={detailRow.user_phone} development={detailRow.development} onDone={() => { fetchConversations(); setDetailRow(null); }} onError={(msg) => setError(msg)} />
                                            <RetryCliqButton userPhone={detailRow.user_phone} development={detailRow.development} onDone={() => { fetchConversations(); setDetailRow(null); }} onError={(msg) => setError(msg)} />
                                        </>
                                    )}
                                    {detailRow.cliq_channel_id && (
                                        <ResendContextButton userPhone={detailRow.user_phone} development={detailRow.development} onDone={() => { fetchConversations(); setDetailRow(null); }} onError={(msg) => setError(msg)} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* History panel modal */}
                {historyPanel !== null && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
                                <h2 className="text-sm font-semibold text-gray-800">
                                    Historial – {historyPanel.maskedPhone} / {historyPanel.development}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setHistoryPanel(null)}
                                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200"
                                >
                                    Cerrar
                                </button>
                            </div>
                            <div ref={historyPanelScrollRef} className="flex-1 overflow-y-auto p-4">
                                {historyPanel.logs.length === 0 ? (
                                    <p className="text-sm text-gray-500">Sin mensajes para esta conversación.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {historyPanel.logs.map((entry) => {
                                            const key = `${entry.type}-${entry.id}`;
                                            if (entry.type === 'bot') {
                                                return (
                                                    <div key={key} className="space-y-2">
                                                        <div className="flex justify-start">
                                                            <div className="max-w-[85%] rounded-lg rounded-bl-none bg-gray-200 px-3 py-2 text-sm text-gray-800">
                                                                <span className="text-xs text-gray-500">
                                                                    {format(new Date(entry.created_at), 'dd/MM/yy HH:mm', { locale: es })} – Cliente
                                                                </span>
                                                                <p className="mt-0.5 whitespace-pre-wrap break-words">{entry.message}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-end">
                                                            <div className="max-w-[85%] rounded-lg rounded-br-none bg-sky-100 px-3 py-2 text-sm text-gray-800">
                                                                <span className="text-xs text-sky-600">Bot</span>
                                                                <p className="mt-0.5 whitespace-pre-wrap break-words">{entry.response}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            if (entry.type === 'wa_cliq') {
                                                return (
                                                    <div key={key} className="flex justify-center">
                                                        <div className="max-w-[90%] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                            <span className="text-amber-600 font-medium">{format(new Date(entry.created_at), 'dd/MM/yy HH:mm', { locale: es })} – Enviado a Cliq</span>
                                                            <p className="mt-0.5 whitespace-pre-wrap break-words">{entry.content}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div key={key} className="flex justify-end">
                                                    <div className="max-w-[85%] rounded-lg rounded-br-none bg-emerald-100 px-3 py-2 text-sm text-gray-800">
                                                        <span className="text-xs text-emerald-700 font-medium">{format(new Date(entry.created_at), 'dd/MM/yy HH:mm', { locale: es })} – Asesor (Cliq)</span>
                                                        <p className="mt-0.5 whitespace-pre-wrap break-words">{entry.content}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Table card */}
                <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                    {loading && conversations.length === 0 ? (
                        <div className="flex items-center justify-center py-16">
                            <p className="text-sm text-gray-500">Cargando conversaciones...</p>
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="flex items-center justify-center py-16">
                            <p className="text-sm text-gray-500">No hay conversaciones.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/95 backdrop-blur">
                                    <tr>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap w-8" title="Prioridad">P</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Tel.</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Desarrollo</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Estado</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap" title="Tiempo sin respuesta">Sin resp.</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Calif.</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Lead</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Handover</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap" title="Canal y bridge">Canal / Bridge</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Asignado</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Última</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 whitespace-nowrap max-w-[120px]">Contacto</th>
                                        <th className="text-left py-2 px-2 font-medium text-gray-600 w-20">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredConversations.map((c, idx) => {
                                        const handover = getHandoverStatus(c);
                                        const handoverVariant = handover.label === 'Enviado' ? 'success' : handover.label === 'Error' ? 'error' : handover.label === 'Sin asignar' ? 'warning' : 'neutral';
                                        const mins = minsSinceLastInteraction(c.last_interaction, c.state);
                                        const priority = getPriority(c.state, mins);
                                        const rowBg = priority === 'red' ? 'bg-red-50/70' : priority === 'orange' ? 'bg-amber-50/60' : priority === 'black' ? 'bg-gray-100/50' : idx % 2 === 1 ? 'bg-gray-50/50' : '';
                                        return (
                                            <tr
                                                key={c.id}
                                                className={`cursor-pointer transition-colors hover:bg-sky-50/50 ${rowBg}`}
                                                onClick={() => setDetailRow(c)}
                                            >
                                                <td className="py-1.5 px-2" title={priority === 'red' ? 'Sin respuesta 15m+' : priority === 'orange' ? 'Sin respuesta 5m+' : priority === 'black' ? 'Cerrada' : 'Activa'}>
                                                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${priority === 'red' ? 'bg-red-500' : priority === 'orange' ? 'bg-amber-500' : priority === 'green' ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                </td>
                                                <td className="py-1.5 px-2 font-mono text-gray-700">{maskPhone(c.user_phone)}</td>
                                                <td className="py-1.5 px-2 text-gray-800">{c.development}</td>
                                                <td className="py-1.5 px-2">
                                                    {c.state === 'CLIENT_ACCEPTA' ? (
                                                        <Badge variant="success">Handover</Badge>
                                                    ) : c.state === 'SALIDA_ELEGANTE' ? (
                                                        <Badge variant="neutral">Cerrada</Badge>
                                                    ) : (
                                                        <span className="text-gray-700">{c.state}</span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2 text-xs text-gray-600">
                                                    {mins != null ? formatMinsAgo(mins) : '-'}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                    {c.is_qualified ? <Badge variant="success">Sí</Badge> : <span className="text-gray-400">No</span>}
                                                </td>
                                                <td className="py-1.5 px-2 font-mono text-gray-500 max-w-[80px] truncate" title={c.zoho_lead_id || ''}>
                                                    {c.zoho_lead_id ? c.zoho_lead_id.slice(0, 12) + (c.zoho_lead_id.length > 12 ? '…' : '') : '-'}
                                                </td>
                                                <td className="py-1.5 px-2">
                                                    <Badge variant={handoverVariant}>{handover.label}</Badge>
                                                </td>
                                                <td className="py-1.5 px-2 max-w-[140px]">
                                                    {c.cliq_channel_id ? (
                                                        <div className="truncate" title={c.cliq_channel_id}>
                                                            <span className="text-green-700 font-medium">{c.cliq_channel_unique_name || 'Canal'}</span>
                                                            <span className="ml-1 text-gray-400">
                                                                {c.last_cliq_wa_error ? (
                                                                    <span className="text-red-600" title={c.last_cliq_wa_error}>Error</span>
                                                                ) : c.context_sent_at && c.last_cliq_wa_sent_at ? (
                                                                    `${format(new Date(c.context_sent_at), 'dd/MM HH:mm', { locale: es })} · ${format(new Date(c.last_cliq_wa_sent_at), 'dd/MM HH:mm', { locale: es })}`
                                                                ) : c.context_sent_at ? (
                                                                    format(new Date(c.context_sent_at), 'dd/MM HH:mm', { locale: es })
                                                                ) : c.last_cliq_wa_sent_at ? (
                                                                    format(new Date(c.last_cliq_wa_sent_at), 'dd/MM HH:mm', { locale: es })
                                                                ) : null}
                                                            </span>
                                                        </div>
                                                    ) : c.is_qualified ? (
                                                        <span className="text-amber-600">Sin canal</span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="py-1.5 px-2 max-w-[120px] truncate text-gray-600" title={c.assigned_agent_email || ''}>
                                                    {c.assigned_agent_email ? c.assigned_agent_email.replace(/@.*/, '') : '-'}
                                                </td>
                                                <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                                                    {c.last_interaction ? format(new Date(c.last_interaction), 'dd/MM HH:mm', { locale: es }) : '-'}
                                                </td>
                                                <td className="py-1.5 px-2 max-w-[140px] truncate text-gray-600">
                                                    {c.user_data?.name || c.user_data?.nombre || '-'}
                                                    {c.user_data?.horario_preferido ? ` · ${String(c.user_data.horario_preferido).slice(0, 15)}` : ''}
                                                </td>
                                                <td className="py-1 px-2 w-12" onClick={(e) => e.stopPropagation()}>
                                                    <div
                                                        ref={openActionsRowId === c.id ? actionsMenuRef : undefined}
                                                        className="relative inline-block"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenActionsRowId(openActionsRowId === c.id ? null : c.id);
                                                            }}
                                                            className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                                            title="Acciones"
                                                        >
                                                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                                                                <circle cx="8" cy="3" r="1.2" />
                                                                <circle cx="8" cy="8" r="1.2" />
                                                                <circle cx="8" cy="13" r="1.2" />
                                                            </svg>
                                                        </button>
                                                        {openActionsRowId === c.id && (
                                                            <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                                                                <div className="border-b border-gray-100 px-2 py-1.5 last:border-0">
                                                                    <HistoryWAButton
                                                                        userPhone={c.user_phone}
                                                                        development={c.development}
                                                                        maskedPhone={maskPhone(c.user_phone)}
                                                                        onShowHistory={(data) => {
                                                                            setHistoryPanel(data);
                                                                            setOpenActionsRowId(null);
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div className="border-b border-gray-100 px-2 py-1.5 last:border-0">
                                                                    <DebugCliqButton
                                                                        userPhone={c.user_phone}
                                                                        development={c.development}
                                                                        onShowDebug={(data) => {
                                                                            setDebugPanel(data);
                                                                            setOpenActionsRowId(null);
                                                                        }}
                                                                    />
                                                                </div>
                                                                {c.cliq_channel_unique_name && (
                                                                    <div className="border-b border-gray-100 px-2 py-1.5 last:border-0">
                                                                        <a
                                                                            href="https://cliq.zoho.com"
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="inline-block rounded px-2 py-1 text-xs text-violet-700 hover:bg-violet-50"
                                                                            onClick={() => setOpenActionsRowId(null)}
                                                                        >
                                                                            Abrir Cliq
                                                                        </a>
                                                                    </div>
                                                                )}
                                                                {c.state === 'CLIENT_ACCEPTA' && c.is_qualified && (
                                                                    <>
                                                                        <div className="border-b border-gray-100 px-2 py-1.5 last:border-0">
                                                                            <RetryLeadCrmButton userPhone={c.user_phone} development={c.development} onDone={fetchConversations} onError={(msg) => setError(msg)} />
                                                                        </div>
                                                                        <div className="border-b border-gray-100 px-2 py-1.5 last:border-0">
                                                                            <RetryCliqButton userPhone={c.user_phone} development={c.development} onDone={fetchConversations} onError={(msg) => setError(msg)} />
                                                                        </div>
                                                                    </>
                                                                )}
                                                                {c.cliq_channel_id && (
                                                                    <div className="border-b border-gray-100 px-2 py-1.5 last:border-0">
                                                                        <ResendContextButton userPhone={c.user_phone} development={c.development} onDone={fetchConversations} onError={(msg) => setError(msg)} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                    Bridge: WA-&gt;C = contexto al canal; Cliq-&gt;WA = último mensaje asesor. Handover = estado de asignación al asesor.
                </p>
            </div>
        </div>
    );
}
