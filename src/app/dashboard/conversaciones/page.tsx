'use client';

/**
 * =====================================================
 * CONVERSACIONES WHATSAPP - Vista de estados (depuración)
 * =====================================================
 * Lista conversaciones recientes con estado actual para depurar el flujo.
 */

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
}

function maskPhone(phone: string): string {
    if (!phone || phone.length < 6) return '***';
    return phone.substring(0, 4) + '***' + phone.slice(-3);
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

export default function ConversacionesPage() {
    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [development, setDevelopment] = useState<string>('');
    const [debugPanel, setDebugPanel] = useState<unknown>(null);

    const fetchConversations = useCallback(async () => {
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const params = new URLSearchParams({ limit: '100' });
            if (development) params.set('development', development);
            const res = await fetch(`/api/whatsapp/conversations?${params}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
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
    }, [development]);

    useEffect(() => {
        setLoading(true);
        fetchConversations();
        const interval = setInterval(fetchConversations, 15000);
        return () => clearInterval(interval);
    }, [fetchConversations]);

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
                <h1 className="text-2xl font-bold text-gray-900">Estados de conversaciones WhatsApp</h1>
                <p className="text-gray-600 text-sm mt-1">
                    Vista de estados por conversación para depuración. Se actualiza cada 15 s.
                </p>
                <p className="text-gray-500 text-xs mt-1">
                    Cliq: el canal en Zoho Cliq se crea al calificar el lead. Para configurar el bot y probar comunicación bidireccional WA - Cliq, ve a <strong>Dashboard de WhatsApp</strong> (sección Bridge WhatsApp - Cliq).
                </p>
            </div>

            <div className="flex gap-2 items-center">
                <label className="text-sm text-gray-600">Desarrollo:</label>
                <select
                    value={development}
                    onChange={(e) => setDevelopment(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-1.5 text-sm"
                >
                    <option value="">Todos</option>
                    <option value="FUEGO">FUEGO</option>
                    <option value="AMURA">AMURA</option>
                    <option value="PUNTO_TIERRA">PUNTO TIERRA</option>
                </select>
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
                    <pre className="text-xs overflow-auto max-h-64 p-2 bg-white border border-gray-100 rounded">
                        {JSON.stringify(debugPanel, null, 2)}
                    </pre>
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
                                            <DebugCliqButton
                                                userPhone={c.user_phone}
                                                development={c.development}
                                                onShowDebug={(data) => setDebugPanel(data)}
                                            />
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
