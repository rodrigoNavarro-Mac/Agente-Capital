'use client';

/**
 * =====================================================
 * CONVERSACIONES WHATSAPP - Vista por rol y depuración
 * =====================================================
 * Admin/CEO: ven todas las conversaciones (debug). Sales manager: solo desarrollos asignados
 * y opción "Solo mis leads". Incluye estado de handover al asesor e historial.
 */

import { useState, useEffect, useCallback } from 'react';
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

const retryButtonClass = 'text-xs px-2 py-1 rounded disabled:opacity-50';

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

/** One exchange: user message + bot response with timestamps */
interface ConversationLogEntry {
    id: number;
    message: string;
    response: string;
    created_at: string;
    received_at: string | null;
    response_at: string | null;
}

function HistoryWAButton({
    userPhone,
    development,
    maskedPhone,
    onShowHistory,
}: {
    userPhone: string;
    development: string;
    maskedPhone: string;
    onShowHistory: (data: { userPhone: string; development: string; logs: ConversationLogEntry[]; maskedPhone: string }) => void;
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
            const logs = (data.logs || []).map((l: { id: number; message: string; response: string; created_at: string; received_at: string | null; response_at: string | null }) => ({
                id: l.id,
                message: l.message ?? '',
                response: l.response ?? '',
                created_at: l.created_at,
                received_at: l.received_at ?? null,
                response_at: l.response_at ?? null,
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
        logs: ConversationLogEntry[];
        maskedPhone: string;
    } | null>(null);

    const fullAccess = userRole !== null && FULL_ACCESS_ROLES.includes(userRole);

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
        try {
            const params = new URLSearchParams({ limit: '100' });
            if (development) params.set('development', development);
            if (!fullAccess && userRole === 'sales_manager') {
                params.set('scope', scope);
            }
            const res = await fetch(`/api/whatsapp/conversations?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                setError('No autorizado. Inicia sesión de nuevo.');
                setConversations([]);
                return;
            }
            if (res.status === 403) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Sin permiso para ver estas conversaciones.');
                setConversations([]);
                return;
            }
            if (!res.ok) throw new Error('Error al cargar conversaciones');
            const data = await res.json();
            setConversations(data.conversations || []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error desconocido');
            setConversations([]);
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
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h2 className="text-red-800 font-semibold">Error</h2>
                    <p className="text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Conversaciones WhatsApp</h1>
                <p className="text-gray-600 text-sm mt-1">
                    {fullAccess
                        ? 'Vista completa para depuración. Se actualiza cada 15 s.'
                        : 'Solo ves conversaciones de tus desarrollos. Se actualiza cada 15 s.'}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                    Bridge: WA-&gt;C = contexto enviado al canal; Cliq-&gt;WA = ultimo mensaje asesor a WhatsApp. <strong>Handover</strong> = estado de asignación al asesor. <strong>Historial WA</strong> = mensajes del bot.
                </p>
            </div>

            <div className="flex gap-4 items-center flex-wrap">
                <div className="flex gap-2 items-center">
                    <label className="text-sm text-gray-600">Desarrollo:</label>
                    <select
                        value={development}
                        onChange={(e) => setDevelopment(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                    >
                        <option value="">{fullAccess ? 'Todos' : 'Todos (mis desarrollos)'}</option>
                        {developmentOptions.map((dev) => (
                            <option key={dev} value={dev}>{dev}</option>
                        ))}
                    </select>
                </div>
                {!fullAccess && userRole === 'sales_manager' && (
                    <div className="flex gap-2 items-center">
                        <label className="text-sm text-gray-600">Ver:</label>
                        <select
                            value={scope}
                            onChange={(e) => setScope(e.target.value as 'all' | 'my_leads')}
                            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                        >
                            <option value="my_leads">Solo mis leads</option>
                            <option value="all">Todas (mis desarrollos)</option>
                        </select>
                    </div>
                )}
                {conversations.some((c) => c.last_cliq_wa_error) && (
                    <span className="text-xs text-red-600 font-medium">
                        Bridge: {conversations.filter((c) => c.last_cliq_wa_error).length} canal(es) con error reciente (revisa columna Bridge)
                    </span>
                )}
            </div>

            {debugPanel !== null && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-sm font-semibold text-gray-800">Debug Cliq - Conversación</h2>
                        <button
                            type="button"
                            onClick={() => setDebugPanel(null)}
                            className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                        >
                            Cerrar
                        </button>
                    </div>
                    {typeof debugPanel === 'object' && debugPanel !== null && 'thread' in debugPanel && (debugPanel as { thread?: { cliq_channel_unique_name?: string } }).thread?.cliq_channel_unique_name && (
                        <p className="text-xs text-gray-600 mb-2">
                            <a
                                href="https://cliq.zoho.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-violet-600 hover:underline"
                            >
                                Abrir canal en Cliq (#{(debugPanel as { thread: { cliq_channel_unique_name: string } }).thread.cliq_channel_unique_name})
                            </a>
                        </p>
                    )}
                    <pre className="text-xs overflow-auto max-h-64 p-2 bg-white border border-gray-100 rounded">
                        {JSON.stringify(debugPanel, null, 2)}
                    </pre>
                </div>
            )}

            {historyPanel !== null && (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-2xl">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-sm font-semibold text-gray-800">
                            Historial WhatsApp – {historyPanel.maskedPhone} / {historyPanel.development}
                        </h2>
                        <button
                            type="button"
                            onClick={() => setHistoryPanel(null)}
                            className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                        >
                            Cerrar
                        </button>
                    </div>
                    <div className="border border-gray-100 rounded bg-gray-50 max-h-96 overflow-y-auto p-3 space-y-3">
                        {historyPanel.logs.length === 0 ? (
                            <p className="text-sm text-gray-500">No hay mensajes registrados para esta conversación.</p>
                        ) : (
                            historyPanel.logs.map((entry) => (
                                <div key={entry.id} className="space-y-2">
                                    <div className="flex justify-start">
                                        <div className="max-w-[85%] rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-800">
                                            <span className="text-xs text-gray-500 block mb-0.5">
                                                {format(new Date(entry.created_at), 'dd/MM/yy HH:mm', { locale: es })} – Cliente
                                            </span>
                                            <span className="whitespace-pre-wrap break-words">{entry.message}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <div className="max-w-[85%] rounded-lg bg-sky-100 px-3 py-2 text-sm text-gray-800">
                                            <span className="text-xs text-sky-600 block mb-0.5">Bot</span>
                                            <span className="whitespace-pre-wrap break-words">{entry.response}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {loading && conversations.length === 0 ? (
                <p className="text-gray-500">Cargando...</p>
            ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Teléfono</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Desarrollo</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Estado</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Calificado</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Lead Zoho</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Canal Cliq</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700" title="Estado handover al asesor">Handover</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Bridge (WA-Cliq)</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Asignado</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Última interacción</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Datos (nombre / horario)</th>
                                <th className="text-left py-2 px-3 font-medium text-gray-700">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {conversations.map((c) => (
                                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="py-2 px-3 font-mono text-gray-700">{maskPhone(c.user_phone)}</td>
                                    <td className="py-2 px-3">{c.development}</td>
                                    <td className="py-2 px-3">
                                        <span
                                            className={
                                                c.state === 'CLIENT_ACCEPTA'
                                                    ? 'text-green-700 font-medium'
                                                    : c.state === 'SALIDA_ELEGANTE'
                                                    ? 'text-gray-500'
                                                    : 'text-gray-800'
                                            }
                                        >
                                            {c.state}
                                        </span>
                                    </td>
                                    <td className="py-2 px-3">
                                        {c.is_qualified ? (
                                            <span className="text-green-600 font-medium">Sí</span>
                                        ) : (
                                            <span className="text-gray-400">No</span>
                                        )}
                                    </td>
                                    <td className="py-2 px-3 font-mono text-xs">
                                        {c.zoho_lead_id || '-'}
                                    </td>
                                    <td className="py-2 px-3 text-sm">
                                        {c.cliq_channel_id ? (
                                            <span className="text-green-700" title={c.cliq_channel_id}>
                                                Creado{c.cliq_channel_unique_name ? ` (${c.cliq_channel_unique_name})` : ''}
                                            </span>
                                        ) : c.is_qualified ? (
                                            <span className="text-amber-600">Sin canal</span>
                                        ) : (
                                            '-'
                                        )}
                                    </td>
                                    <td className="py-2 px-3">
                                        <span className={getHandoverStatus(c).className}>{getHandoverStatus(c).label}</span>
                                    </td>
                                    <td className="py-2 px-3 text-xs">
                                        {c.cliq_channel_id ? (
                                            <div className="space-y-0.5">
                                                <div title="Contexto enviado al canal">
                                                    WA-&gt;C: {c.context_sent_at ? format(new Date(c.context_sent_at), 'dd/MM HH:mm', { locale: es }) : 'No'}
                                                </div>
                                                <div title="Ultimo mensaje asesor Cliq -&gt; WA">
                                                    Cliq-&gt;WA: {c.last_cliq_wa_error ? (
                                                        <span className="text-red-600" title={c.last_cliq_wa_error}>Error</span>
                                                    ) : c.last_cliq_wa_sent_at ? (
                                                        format(new Date(c.last_cliq_wa_sent_at), 'dd/MM HH:mm', { locale: es })
                                                    ) : (
                                                        'Nunca'
                                                    )}
                                                </div>
                                            </div>
                                        ) : '-'}
                                    </td>
                                    <td className="py-2 px-3 text-gray-600 text-xs max-w-[180px] truncate" title={c.assigned_agent_email || ''}>
                                        {c.assigned_agent_email || '-'}
                                    </td>
                                    <td className="py-2 px-3 text-gray-600">
                                        {c.last_interaction
                                            ? format(new Date(c.last_interaction), 'dd/MM/yy HH:mm', { locale: es })
                                            : '-'}
                                    </td>
                                    <td className="py-2 px-3 text-gray-600 max-w-[200px] truncate">
                                        {c.user_data?.name || c.user_data?.nombre
                                            ? `Nombre: ${c.user_data.name || c.user_data.nombre}`
                                            : ''}
                                        {c.user_data?.horario_preferido
                                            ? ` | Horario: ${String(c.user_data.horario_preferido).slice(0, 30)}`
                                            : ''}
                                        {!c.user_data?.name && !c.user_data?.nombre && !c.user_data?.horario_preferido
                                            ? '-'
                                            : ''}
                                    </td>
                                    <td className="py-2 px-3">
                                        <span className="flex flex-wrap gap-1">
                                            {c.state === 'CLIENT_ACCEPTA' && c.is_qualified && (
                                                <>
                                                    <RetryLeadCrmButton
                                                        userPhone={c.user_phone}
                                                        development={c.development}
                                                        onDone={fetchConversations}
                                                        onError={(msg) => setError(msg)}
                                                    />
                                                    <RetryCliqButton
                                                        userPhone={c.user_phone}
                                                        development={c.development}
                                                        onDone={fetchConversations}
                                                        onError={(msg) => setError(msg)}
                                                    />
                                                </>
                                            )}
                                            {c.cliq_channel_id && (
                                                <ResendContextButton
                                                    userPhone={c.user_phone}
                                                    development={c.development}
                                                    onDone={fetchConversations}
                                                    onError={(msg) => setError(msg)}
                                                />
                                            )}
                                            <HistoryWAButton
                                                userPhone={c.user_phone}
                                                development={c.development}
                                                maskedPhone={maskPhone(c.user_phone)}
                                                onShowHistory={(data) => setHistoryPanel(data)}
                                            />
                                            <DebugCliqButton
                                                userPhone={c.user_phone}
                                                development={c.development}
                                                onShowDebug={(data) => setDebugPanel(data)}
                                            />
                                            {c.cliq_channel_unique_name && (
                                                <a
                                                    href="https://cliq.zoho.com"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`${retryButtonClass} inline-block bg-violet-100 text-violet-800 hover:bg-violet-200`}
                                                    title={`Abrir Cliq (canal: #${c.cliq_channel_unique_name})`}
                                                >
                                                    Abrir Cliq
                                                </a>
                                            )}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!loading && conversations.length === 0 && (
                <p className="text-gray-500">No hay conversaciones en la base de datos.</p>
            )}
        </div>
    );
}
