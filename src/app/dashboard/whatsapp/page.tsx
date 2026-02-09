'use client';

/**
 * =====================================================
 * WHATSAPP DASHBOARD PAGE
 * =====================================================
 * Dashboard para visualizar métricas y logs de WhatsApp
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Tipos
interface WhatsAppLog {
    id: number;
    user_phone_masked: string;
    development: string;
    message_preview: string;
    response_preview: string;
    created_at: string;
}

interface WhatsAppMetrics {
    total_messages: number;
    unique_users: number;
    by_development: Record<string, number>;
    last_24h: number;
    avg_response_length: number;
}

export default function WhatsAppDashboard() {
    const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
    const [logs, setLogs] = useState<WhatsAppLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDevelopment, setSelectedDevelopment] = useState<string>('all');

    // Cargar métricas
    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const response = await fetch('/api/whatsapp/metrics');
                if (!response.ok) throw new Error('Error al cargar métricas');
                const data = await response.json();
                setMetrics(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error desconocido');
            }
        };

        fetchMetrics();
    }, []);

    // Cargar logs
    useEffect(() => {
        const fetchLogs = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    limit: '50',
                    offset: '0',
                });

                if (selectedDevelopment !== 'all') {
                    params.append('development', selectedDevelopment);
                }

                const response = await fetch(`/api/whatsapp/logs?${params}`);
                if (!response.ok) throw new Error('Error al cargar logs');
                const data = await response.json();
                setLogs(data.logs);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error desconocido');
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [selectedDevelopment]);

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

    // Obtener desarrollo más activo
    const mostActiveDevelopment = metrics?.by_development
        ? Object.entries(metrics.by_development).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'
        : 'N/A';

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">Dashboard de WhatsApp</h1>
                <p className="text-gray-600 mt-1">Métricas y actividad de WhatsApp Business</p>
            </div>

            {/* Cards de métricas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total de mensajes */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Total Mensajes</p>
                            <p className="text-3xl font-bold text-gray-900 mt-1">
                                {metrics?.total_messages.toLocaleString() || '0'}
                            </p>
                        </div>
                        <div className="bg-blue-100 p-3 rounded-full">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Usuarios únicos */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Usuarios Únicos</p>
                            <p className="text-3xl font-bold text-gray-900 mt-1">
                                {metrics?.unique_users.toLocaleString() || '0'}
                            </p>
                        </div>
                        <div className="bg-green-100 p-3 rounded-full">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Últimas 24h */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Últimas 24h</p>
                            <p className="text-3xl font-bold text-gray-900 mt-1">
                                {metrics?.last_24h.toLocaleString() || '0'}
                            </p>
                        </div>
                        <div className="bg-yellow-100 p-3 rounded-full">
                            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Desarrollo más activo */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Más Activo</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {mostActiveDevelopment}
                            </p>
                        </div>
                        <div className="bg-purple-100 p-3 rounded-full">
                            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Gráfico de mensajes por desarrollo */}
            {metrics?.by_development && Object.keys(metrics.by_development).length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Mensajes por Desarrollo</h2>
                    <div className="space-y-3">
                        {Object.entries(metrics.by_development)
                            .sort(([, a], [, b]) => b - a)
                            .map(([development, count]) => {
                                const percentage = (count / metrics.total_messages) * 100;
                                return (
                                    <div key={development}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-medium text-gray-700">{development}</span>
                                            <span className="text-sm text-gray-600">{count} mensajes ({percentage.toFixed(1)}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full transition-all"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Tabla de actividad reciente */}
            <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">Actividad Reciente</h2>
                        <select
                            value={selectedDevelopment}
                            onChange={(e) => setSelectedDevelopment(e.target.value)}
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">Todos los desarrollos</option>
                            {metrics?.by_development && Object.keys(metrics.by_development).map((dev) => (
                                <option key={dev} value={dev}>{dev}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                            <p className="mt-2 text-gray-600">Cargando logs...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No hay logs para mostrar
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Número
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Desarrollo
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Mensaje
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Fecha
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {log.user_phone_masked}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                                {log.development}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700">
                                            <div className="max-w-md truncate" title={log.message_preview}>
                                                {log.message_preview}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {format(new Date(log.created_at), 'dd MMM yyyy, HH:mm', { locale: es })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
