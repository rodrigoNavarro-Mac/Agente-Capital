'use client';

/**
 * =====================================================
 * CONVERSACIONES WHATSAPP - Vista de estados (depuración)
 * =====================================================
 * Lista conversaciones recientes con estado actual para depurar el flujo.
 */

import { useState, useEffect } from 'react';
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
}

function maskPhone(phone: string): string {
    if (!phone || phone.length < 6) return '***';
    return phone.substring(0, 4) + '***' + phone.slice(-3);
}

function RetryHandoverButton({
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
                onError(data.error || 'Error al reintentar');
                return;
            }
            onDone();
        } catch {
            onError('Error de red al reintentar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
        >
            {loading ? '...' : 'Reintentar handover'}
        </button>
    );
}

export default function ConversacionesPage() {
    const [conversations, setConversations] = useState<ConversationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [development, setDevelopment] = useState<string>('');

    const fetchConversations = async () => {
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
    };

    useEffect(() => {
        setLoading(true);
        fetchConversations();
        const interval = setInterval(fetchConversations, 15000);
        return () => clearInterval(interval);
    }, [development]);

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
                                        {c.state === 'CLIENT_ACCEPTA' && c.is_qualified && (c.zoho_lead_id === 'pending' || !c.zoho_lead_id) ? (
                                            <RetryHandoverButton
                                                userPhone={c.user_phone}
                                                development={c.development}
                                                onDone={fetchConversations}
                                                onError={(msg) => setError(msg)}
                                            />
                                        ) : (
                                            '-'
                                        )}
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
