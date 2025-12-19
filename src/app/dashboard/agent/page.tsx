'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { MessageSquare, Copy, Loader2, Send, User, Bot, Trash2, X, ChevronLeft, ChevronRight, Star, RefreshCw } from 'lucide-react';
import { queryAgent, getChatHistory, deleteChatHistory, getUser, getUserDevelopments, sendFeedback, getAgentConfig } from '@/lib/api';
import { ZONES, DEVELOPMENTS, DOCUMENT_TYPES } from '@/lib/constants';
import { copyToClipboard } from '@/lib/utils';
import { decodeAccessToken } from '@/lib/auth';
import type { UserRole } from '@/types/documents';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { logger } from '@/lib/logger';

// Tipo para representar un mensaje en el chat
interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Array<{
    filename: string;
    page: number;
    chunk: number;
    relevance_score: number;
    text_preview: string;
  }>;
  query_log_id?: number;
  rating?: number; // Calificación del usuario (1-5)
}

// Tipo para identificar un chat único
type ChatId = string; // Formato: "zone-development"

// Tipo para almacenar información de un chat
interface ChatData {
  id: ChatId;
  zone: string;
  development: string;
  messages: ChatMessage[];
  type?: string;
}

export default function AgentPage() {
  // Estados para el formulario
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('');
  const [development, setDevelopment] = useState('');
  const [type, setType] = useState('');
  
  // Estados para múltiples chats
  const [chats, setChats] = useState<Record<ChatId, ChatData>>({});
  const [activeChatId, setActiveChatId] = useState<ChatId | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState<Record<ChatId, boolean>>({});
  const [historyLoadAttempted, setHistoryLoadAttempted] = useState<Record<ChatId, boolean>>({}); // Nuevo estado para evitar loops
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userAssignments, setUserAssignments] = useState<Array<{ zone: string; development: string; can_query: boolean }>>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true); // Estado para controlar si el sidebar está abierto
  const [ratingMessages, setRatingMessages] = useState<Record<number, number>>({}); // query_log_id -> rating
  const [submittingRating, setSubmittingRating] = useState<Record<number, boolean>>({}); // query_log_id -> isSubmitting
  const [regeneratingMessages, setRegeneratingMessages] = useState<Record<number, boolean>>({}); // message.id -> isRegenerating
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [topK, setTopK] = useState<number>(5); // Número de fuentes configurado
  const [expandedSources, setExpandedSources] = useState<Record<number, string | undefined>>({}); // message.id -> accordion value
  
  // Referencia para hacer scroll automático
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();

  // Obtener ID del usuario desde el token
  const getUserId = (): number => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      return 0; // Retornar 0 en lugar de 1 para indicar error
    }
    const payload = decodeAccessToken(token);
    if (!payload || !payload.userId) {
      return 0;
    }
    return payload.userId;
  };

  const userId = getUserId();
  
  // Validar que userId sea válido
  useEffect(() => {
    if (userId === 0) {
      // No redirigir automáticamente aquí, el layout ya lo hace
    }
  }, [userId]);

  // Función para hacer scroll al final del chat
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Generar ID único para un chat
  const getChatId = useCallback((zone: string, development: string): ChatId => {
    return `${zone}-${development}`;
  }, []);

  // Crear o activar un chat
  const createOrActivateChat = useCallback((zoneValue: string, devValue: string) => {
    if (!zoneValue || !devValue) return;

    const chatId = getChatId(zoneValue, devValue);
    
    // Si el chat no existe, crearlo
    setChats((prev) => {
      if (!prev[chatId]) {
        return {
          ...prev,
          [chatId]: {
            id: chatId,
            zone: zoneValue,
            development: devValue,
            messages: [],
            type: type || undefined,
          },
        };
      }
      return prev;
    });

    // Activar el chat
    setActiveChatId(chatId);
  }, [getChatId, type]);

  // Cargar historial de chat desde la base de datos
  const loadChatHistory = useCallback(async (chatId: ChatId, zoneValue: string, devValue: string) => {
    // Validar parámetros requeridos
    if (!zoneValue || !devValue || !userId) {
      logger.error('[loadChatHistory] Missing parameters');
      setHistoryLoadAttempted((prev) => ({ ...prev, [chatId]: true })); // Marcar como intentado aunque falle
      return;
    }

    setLoadingHistory((prev) => ({ ...prev, [chatId]: true }));
    setHistoryLoadAttempted((prev) => ({ ...prev, [chatId]: true })); // Marcar que se intentó cargar
    
    try {
      // Crear una promesa con timeout de 10 segundos
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout al cargar historial')), 10000);
      });

      const historyPromise = getChatHistory({
        userId,
        zone: zoneValue,
        development: devValue,
        limit: 50,
      });

      // Ejecutar la petición con timeout
      const history = await Promise.race([historyPromise, timeoutPromise]);
      
      // Validar que todos los mensajes pertenezcan al usuario actual
      if (history.length > 0) {
        const foreignMessages = history.filter(h => h.user_id !== userId);
        if (foreignMessages.length > 0) {
          logger.error('[SECURITY] Received messages from other users');
        }
      }

      // Filtrar solo los mensajes del usuario actual (medida de seguridad adicional)
      // Esto es una capa adicional de seguridad en caso de que el backend no filtre correctamente
      const userHistory = history.filter(log => {
        if (log.user_id !== userId) {
          logger.error('[SECURITY] Message from other user detected and filtered');
          return false;
        }
        return true;
      });
      
      if (userHistory.length !== history.length) {
        const filteredCount = history.length - userHistory.length;
        logger.error(`[SECURITY] Filtered ${filteredCount} message(s) from other users in history`);
        toast({
          title: 'Mensajes filtrados',
          description: `Se detectaron ${filteredCount} mensaje(s) que no pertenecen a tu cuenta y fueron filtrados por seguridad.`,
          variant: 'destructive',
        });
      }
      
      // Ordenar por fecha (más antiguo primero para mostrar cronológicamente)
      userHistory.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateA - dateB;
      });

      // Convertir logs a mensajes de chat
      const chatMessages: ChatMessage[] = [];

      userHistory.forEach((log, _index) => {
        chatMessages.push({
          id: log.id * 2,
          role: 'user',
          content: log.query,
          timestamp: new Date(log.created_at),
        });

        const sources = log.sources_used?.map((source) => ({
          filename: source,
          page: 0,
          chunk: 0,
          relevance_score: 0,
          text_preview: '',
        })) || [];

        chatMessages.push({
          id: log.id * 2 + 1,
          role: 'assistant',
          content: log.response || '',
          timestamp: new Date(log.created_at),
          sources: sources.length > 0 ? sources : undefined,
          query_log_id: log.id,
          rating: log.feedback_rating, // Incluir calificación si existe
        });
      });
      

      setChats((prev) => ({
        ...prev,
        [chatId]: {
          ...prev[chatId],
          messages: chatMessages,
        },
      }));
    } catch (error) {
      logger.error('[loadChatHistory] Error loading history:', error);
      
      // Solo mostrar toast si el error no es por timeout (para no alarmar al usuario)
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      if (!errorMessage.includes('Timeout')) {
        toast({
          title: 'Error al cargar historial',
          description: 'No se pudo cargar el historial. Puedes empezar a chatear normalmente.',
          variant: 'destructive',
        });
      }
      
      // Incluso si falla, permitir que el usuario use el chat normalmente
      // No hacer nada aquí, el chat ya está inicializado vacío
    } finally {
      setLoadingHistory((prev) => ({ ...prev, [chatId]: false }));
    }
  }, [userId, toast]);

  // Función para cargar información del usuario
  const loadUserInfo = useCallback(async () => {
    try {
      const user = await getUser(userId);
      setUserRole(user.role || null);
    } catch (error) {
      logger.error('Error loading user information:', error);
    }
  }, [userId]);

  // Función para cargar asignaciones del usuario y seleccionar automáticamente
  const loadUserAssignments = useCallback(async () => {
    try {
      // Roles con acceso a TODOS los desarrollos y TODAS las zonas
      const rolesWithFullAccess = ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'];
      
      // Si el usuario tiene uno de estos roles, no necesita cargar asignaciones
      // porque tiene acceso a todas las zonas y desarrollos
      if (userRole && rolesWithFullAccess.includes(userRole)) {
        setUserAssignments([]); // Array vacío indica acceso total
        return;
      }

      const userDevs = await getUserDevelopments(userId);
      setUserAssignments(userDevs);
      
      // Filtrar solo los que tienen permiso de query
      const queryableDevs = userDevs.filter(dev => dev.can_query);
      
      if (queryableDevs.length > 0) {
        // Si solo tiene una asignación, seleccionarla automáticamente
        if (queryableDevs.length === 1) {
          setZone(queryableDevs[0].zone);
          setDevelopment(queryableDevs[0].development);
          // Crear el chat automáticamente
          createOrActivateChat(queryableDevs[0].zone, queryableDevs[0].development);
        } else {
          // Si tiene múltiples, seleccionar la primera
          setZone(queryableDevs[0].zone);
          setDevelopment(queryableDevs[0].development);
          // Crear el chat automáticamente
          createOrActivateChat(queryableDevs[0].zone, queryableDevs[0].development);
        }
      }
    } catch (error) {
      logger.error('Error loading user assignments:', error);
    }
  }, [userRole, userId, createOrActivateChat]);

  // Cargar configuración del agente (topK)
  const loadConfig = useCallback(async () => {
    try {
      const config = await getAgentConfig();
      setTopK(config.top_k || 5);
    } catch (error) {
      logger.error('Error loading configuration:', error);
    }
  }, []);

  // Cargar información del usuario al montar
  useEffect(() => {
    loadUserInfo();
    loadConfig();
  }, [loadUserInfo, loadConfig]);

  // Cargar asignaciones cuando se obtiene el rol del usuario
  useEffect(() => {
    if (userRole !== null) {
      loadUserAssignments();
    }
  }, [userRole, loadUserAssignments]);

  // Cargar historial cuando se crea un nuevo chat
  useEffect(() => {
    if (activeChatId && chats[activeChatId]) {
      const chat = chats[activeChatId];
      // Solo intentar cargar si:
      // 1. No hay mensajes en el chat
      // 2. No se está cargando actualmente
      // 3. NO se ha intentado cargar antes (esto previene el loop infinito)
      if (chat.messages.length === 0 && 
          !loadingHistory[activeChatId] && 
          !historyLoadAttempted[activeChatId]) {
        loadChatHistory(activeChatId, chat.zone, chat.development);
      }
    }
  }, [activeChatId, chats, loadingHistory, historyLoadAttempted, loadChatHistory]);

  // Scroll automático cuando hay nuevos mensajes
  useEffect(() => {
    scrollToBottom();
  }, [chats, activeChatId, scrollToBottom]);


  // Manejar cambio de zona/desarrollo
  const handleZoneChange = (value: string) => {
    setZone(value);
    setDevelopment('');
    setActiveChatId(null);
  };

  const handleDevelopmentChange = (value: string) => {
    setDevelopment(value);
    if (zone && value) {
      createOrActivateChat(zone, value);
    }
  };

  // Manejar envío de nueva consulta
  const handleQuery = async () => {
    if (!query.trim() || !activeChatId || !chats[activeChatId]) {
      toast({
        title: 'Error',
        description: 'Por favor selecciona zona y desarrollo',
        variant: 'destructive',
      });
      return;
    }

    const chat = chats[activeChatId];

    // Agregar mensaje del usuario inmediatamente
    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: query.trim(),
      timestamp: new Date(),
    };

    setChats((prev) => ({
      ...prev,
      [activeChatId]: {
        ...prev[activeChatId],
        messages: [...prev[activeChatId].messages, userMessage],
      },
    }));

    const currentQuery = query.trim();
    setQuery('');
    setLoading(true);

    try {
      const result = await queryAgent({
        query: currentQuery,
        zone: chat.zone as any,
        development: chat.development,
        type: (chat.type as any) || undefined,
        userId,
      });

      if (result.success && result.answer) {
        const assistantMessage: ChatMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: result.answer,
          timestamp: new Date(),
          sources: result.sources,
          query_log_id: result.query_log_id,
        };

        setChats((prev) => ({
          ...prev,
          [activeChatId]: {
            ...prev[activeChatId],
            messages: [...prev[activeChatId].messages, assistantMessage],
          },
        }));

        toast({
          title: 'Consulta procesada',
          description: 'El agente ha generado una respuesta',
        });
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        timestamp: new Date(),
      };

      setChats((prev) => ({
        ...prev,
        [activeChatId]: {
          ...prev[activeChatId],
          messages: [...prev[activeChatId].messages, errorMessage],
        },
      }));

      toast({
        title: 'Error en consulta',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Manejar copiar respuesta
  const handleCopyAnswer = async (content: string) => {
    const success = await copyToClipboard(content);
    if (success) {
      toast({
        title: 'Copiado',
        description: 'Respuesta copiada al portapapeles',
      });
    }
  };

  // Manejar regenerar respuesta
  const handleRegenerateResponse = async (messageId: number, originalQuery: string) => {
    if (!activeChatId || !chats[activeChatId]) {
      return;
    }

    const chat = chats[activeChatId];
    
    // IMPORTANTE: Guardar la calificación anterior antes de regenerar
    // Esto permite detectar respuestas incorrectas incluso después de regenerar
    const oldMessage = chat.messages.find((msg) => msg.id === messageId);
    const previousRating = oldMessage?.rating;
    
    setRegeneratingMessages((prev) => ({ ...prev, [messageId]: true }));

    try {
      // IMPORTANTE: skipCache = true para forzar regeneración sin usar caché
      const result = await queryAgent({
        query: originalQuery,
        zone: chat.zone as any,
        development: chat.development,
        type: (chat.type as any) || undefined,
        userId,
        skipCache: true, // Forzar regeneración ignorando el caché
      });

      if (result.success && result.answer) {
        const newAnswer = result.answer;
        const newQueryLogId = result.query_log_id;
        
        // Reemplazar el mensaje del asistente con la nueva respuesta
        // MANTENER la calificación anterior para detectar respuestas incorrectas
        setChats((prev) => {
          const currentChat = prev[activeChatId];
          if (!currentChat) return prev;
          
          return {
            ...prev,
            [activeChatId]: {
              ...currentChat,
              messages: currentChat.messages.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      content: newAnswer,
                      sources: result.sources,
                      query_log_id: newQueryLogId,
                      rating: previousRating, // MANTENER calificación anterior
                    }
                  : msg
              ),
            },
          };
        });

        // Si había una calificación anterior, mantenerla también en el estado de rating
        // y guardarla en el nuevo query_log_id para detectar respuestas incorrectas
        if (previousRating && newQueryLogId) {
          setRatingMessages((prev) => ({
            ...prev,
            [newQueryLogId]: previousRating,
          }));

          // IMPORTANTE: Guardar la calificación en el nuevo query_log_id
          // Esto permite detectar que esta consulta generó una respuesta incorrecta
          try {
            const token = localStorage.getItem('accessToken');
            if (token) {
              await sendFeedback(
                {
                  query_log_id: newQueryLogId,
                  rating: previousRating,
                  comment: `Calificación transferida de respuesta regenerada (anteriormente ${previousRating}⭐)`,
                },
                token
              );
            }
          } catch (error) {
            logger.error('Error saving rating in new query_log_id:', error);
            // No mostrar error al usuario, solo log
          }
        }

        toast({
          title: 'Respuesta regenerada',
          description: previousRating 
            ? `Nueva respuesta generada. Calificación anterior mantenida para detectar respuestas incorrectas.`
            : 'El agente ha generado una nueva respuesta',
        });
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (error) {
      toast({
        title: 'Error al regenerar',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setRegeneratingMessages((prev) => {
        const updated = { ...prev };
        delete updated[messageId];
        return updated;
      });
    }
  };

  // Manejar calificación de respuesta
  const handleRateResponse = async (queryLogId: number, rating: number) => {
    if (!queryLogId) {
      toast({
        title: 'Error',
        description: 'No se puede calificar esta respuesta',
        variant: 'destructive',
      });
      return;
    }

    // Actualizar estado local inmediatamente para feedback visual
    setRatingMessages((prev) => ({ ...prev, [queryLogId]: rating }));
    setSubmittingRating((prev) => ({ ...prev, [queryLogId]: true }));

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No hay token de autenticación');
      }

      await sendFeedback(
        {
          query_log_id: queryLogId,
          rating,
          comment: null,
        },
        token
      );

      // Actualizar el mensaje en el chat con la calificación
      setChats((prev) => {
        const newChats = { ...prev };
        Object.keys(newChats).forEach((chatId) => {
          newChats[chatId] = {
            ...newChats[chatId],
            messages: newChats[chatId].messages.map((msg) =>
              msg.query_log_id === queryLogId
                ? { ...msg, rating }
                : msg
            ),
          };
        });
        return newChats;
      });

      toast({
        title: 'Calificación guardada',
        description: `Has calificado esta respuesta con ${rating} estrella${rating > 1 ? 's' : ''}`,
      });
    } catch (error) {
      // Revertir el estado local si falla
      setRatingMessages((prev) => {
        const updated = { ...prev };
        delete updated[queryLogId];
        return updated;
      });
      
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo guardar la calificación',
        variant: 'destructive',
      });
    } finally {
      setSubmittingRating((prev) => {
        const updated = { ...prev };
        delete updated[queryLogId];
        return updated;
      });
    }
  };

  // Limpiar chat (eliminar de BD si no es admin)
  const handleClearChat = async (chatId: ChatId) => {
    const chat = chats[chatId];
    if (!chat) return;

    // Si es admin o ceo, no permitir eliminar
    if (userRole === 'admin' || userRole === 'ceo') {
      toast({
        title: 'Acción no permitida',
        description: 'Los administradores no pueden eliminar el historial de chat',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Eliminar de la base de datos
      await deleteChatHistory({
        userId,
        zone: chat.zone,
        development: chat.development,
      });

      // Eliminar el chat completamente del estado
      setChats((prev) => {
        const newChats = { ...prev };
        delete newChats[chatId];
        return newChats;
      });

      // Limpiar estado de historial
      setLoadingHistory((prev) => {
        const newState = { ...prev };
        delete newState[chatId];
        return newState;
      });
      
      setHistoryLoadAttempted((prev) => {
        const newState = { ...prev };
        delete newState[chatId];
        return newState;
      });

      // Si el chat eliminado era el activo, desactivarlo y limpiar formulario
      if (activeChatId === chatId) {
        setActiveChatId(null);
        // Limpiar los campos del formulario para empezar uno nuevo
        setZone('');
        setDevelopment('');
        setType('');
        setQuery('');
      }

      toast({
        title: 'Chat eliminado',
        description: 'El historial ha sido eliminado permanentemente. Puedes empezar un nuevo chat.',
      });
    } catch (error) {
      logger.error('Error deleting chat:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el historial',
        variant: 'destructive',
      });
    }
  };

  // Cerrar un chat (solo de la UI, no elimina de BD)
  const handleCloseChat = (chatId: ChatId) => {
    setChats((prev) => {
      const newChats = { ...prev };
      delete newChats[chatId];
      return newChats;
    });

    // Limpiar estado de historial
    setLoadingHistory((prev) => {
      const newState = { ...prev };
      delete newState[chatId];
      return newState;
    });
    
    setHistoryLoadAttempted((prev) => {
      const newState = { ...prev };
      delete newState[chatId];
      return newState;
    });

    // Si el chat cerrado era el activo, cambiar a otro o null
    if (activeChatId === chatId) {
      const remainingChatIds = Object.keys(chats).filter(id => id !== chatId);
      setActiveChatId(remainingChatIds.length > 0 ? remainingChatIds[0] : null);
    }
  };

  // Manejar Enter para enviar
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && query.trim() && activeChatId) {
        handleQuery();
      }
    }
  };

  // Filtrar zonas y desarrollos según las asignaciones del usuario
  // Roles con acceso completo ven todas las zonas y desarrollos
  // Otros roles solo ven lo que tienen asignado
  const hasFullAccess = userRole && ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'].includes(userRole);
  const availableZones = hasFullAccess
    ? ZONES // Acceso completo = todas las zonas
    : (userAssignments.length > 0
        ? ZONES.filter(z => userAssignments.some(dev => dev.zone === z.value && dev.can_query))
        : ZONES);
  
  const developments = zone 
    ? (DEVELOPMENTS[zone] || []).filter(dev => 
        hasFullAccess || // Acceso completo = todos los desarrollos
        userAssignments.some(assignment => 
          assignment.zone === zone && 
          assignment.development === dev.value && 
          assignment.can_query
        )
      )
    : [];
  const chatList = Object.values(chats);

  return (
    <div className="w-full h-full flex flex-col" style={{ minHeight: 0, maxHeight: '100%' }}>
      {/* Header - Más compacto */}
      <div className="flex-shrink-0 mb-2 px-2 md:px-0">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold navy-text">Consultar Agente</h1>
          {!sidebarOpen && (
            <Badge variant="outline" className="text-[10px] md:text-xs animate-in fade-in duration-300">
              Panel colapsado
            </Badge>
          )}
        </div>
        <p className="text-[10px] md:text-xs text-muted-foreground hidden lg:block">
          Realiza consultas al agente de IA con contexto RAG
        </p>
      </div>

      <div className="flex gap-2 md:gap-4 lg:gap-6 relative overflow-hidden px-2 md:px-0" style={{ flex: 1, minHeight: 0 }}>
        {/* Panel de configuración - Sidebar */}
        {/* En móviles (<md), el sidebar es un overlay absoluto */}
        {/* En desktop (>=md), está al lado del chat */}
        <div 
          className={`
            transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden relative z-20
            ${sidebarOpen 
              ? 'md:w-72 lg:w-80 opacity-100' 
              : 'md:w-0 opacity-0'
            }
            ${sidebarOpen 
              ? 'fixed md:relative inset-0 md:inset-auto w-full md:w-72 lg:w-80' 
              : 'hidden md:block'
            }
          `}
        >
          {/* Backdrop para móviles */}
          {sidebarOpen && (
            <div 
              className="absolute inset-0 bg-background/80 backdrop-blur-sm md:hidden z-0"
              onClick={() => setSidebarOpen(false)}
              aria-label="Cerrar sidebar"
            />
          )}
          
          <Card className="relative z-10 mx-2 my-2 md:mx-0 md:my-0 max-w-md md:max-w-none flex flex-col" style={{ height: '100%' }}>
            <CardHeader className="relative pr-10 pb-2 pt-3 md:pt-4">
              <CardTitle className="text-sm md:text-base">Nuevo Chat</CardTitle>
              <CardDescription className="text-xs">
                Selecciona zona y desarrollo
              </CardDescription>
              {/* Botón para plegar sidebar (solo visible cuando está abierto) */}
              {sidebarOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 md:top-4 right-3 md:right-4 h-7 w-7 md:h-8 md:w-8"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Ocultar sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-3 px-4 md:px-6 pb-3 md:pb-4 flex-1 overflow-y-auto">
            {/* Zone Selection */}
            <div className="space-y-1.5">
              <Label htmlFor="zone" className="text-xs">Zona *</Label>
              <Select value={zone} onValueChange={handleZoneChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona zona" />
                </SelectTrigger>
                <SelectContent>
                  {availableZones.map((z) => (
                    <SelectItem key={z.value} value={z.value}>
                      {z.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Development Selection */}
            <div className="space-y-1.5">
              <Label htmlFor="development" className="text-xs">Desarrollo *</Label>
              <Select value={development} onValueChange={handleDevelopmentChange} disabled={!zone}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona desarrollo" />
                </SelectTrigger>
                <SelectContent>
                  {developments.map((dev) => (
                    <SelectItem key={dev.value} value={dev.value}>
                      {dev.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Document Type (optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="type" className="text-xs">Tipo de Documento (opcional)</Label>
              <Select value={type || undefined} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((docType) => (
                    <SelectItem key={docType.value} value={docType.value}>
                      {docType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info - Oculto en móviles y reducido */}
            <div className="pt-2 border-t space-y-1.5 text-xs hidden lg:block">
              <div>
                <h4 className="font-semibold mb-0.5 text-xs">RAG Activo</h4>
                <Badge variant="default" className="text-[10px]">✓ Búsqueda semántica</Badge>
              </div>
              {userRole === 'admin' && (
                <div className="pt-1">
                  <Badge variant="outline" className="text-[10px]">
                    ⚠️ Admin: No puedes eliminar historial
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </div>

        {/* Botón flotante mejorado para mostrar sidebar cuando está oculto */}
        {!sidebarOpen && (
          <div className="fixed md:absolute left-0 top-16 md:top-20 z-10 animate-in slide-in-from-left duration-300 group">
            <Button
              variant="default"
              size="icon"
              className="h-10 w-10 md:h-12 md:w-12 rounded-r-lg border-l-0 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200 hover:scale-105 hover:shadow-xl"
              onClick={() => setSidebarOpen(true)}
              aria-label="Mostrar panel de configuración"
              title="Mostrar panel de configuración"
            >
              <ChevronRight className="h-4 w-4 md:h-5 md:w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
            {/* Tooltip visual mejorado - solo visible en desktop */}
            <div className="hidden md:block absolute left-14 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-md shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              Configurar chat
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-primary rotate-45"></div>
            </div>
          </div>
        )}

        {/* Área de chats */}
        <Card className="flex flex-col min-w-0 overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
          {chatList.length === 0 ? (
            <CardContent className="flex-1 flex items-center justify-center min-h-0 p-4 md:p-6">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 md:h-16 md:w-16 mx-auto mb-2 md:mb-4 opacity-50" />
                <p className="text-sm md:text-lg font-medium mb-1 md:mb-2">No hay chats activos</p>
                <p className="text-xs md:text-sm">Selecciona zona y desarrollo para comenzar una conversación</p>
              </div>
            </CardContent>
          ) : (
            <Tabs value={activeChatId || undefined} onValueChange={setActiveChatId} className="flex flex-col overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
              <CardHeader className="flex-shrink-0 pb-2 px-3 md:px-4 lg:px-6 pt-3 md:pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm md:text-base lg:text-lg">Chats Activos</CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                      {chatList.length} conversación(es) activa(s)
                    </CardDescription>
                  </div>
                </div>
                <TabsList className="flex w-full gap-1 md:gap-2 mt-2 overflow-x-auto pb-1">
                  {chatList.map((chat) => (
                    <TabsTrigger
                      key={chat.id}
                      value={chat.id}
                      className="flex items-center gap-1 md:gap-2 min-w-0 flex-shrink-0 text-xs md:text-sm px-2 md:px-3"
                    >
                      <span className="truncate max-w-[120px] md:max-w-[150px] lg:max-w-[200px]">
                        {ZONES.find(z => z.value === chat.zone)?.label || chat.zone} - {(DEVELOPMENTS[chat.zone] || []).find(d => d.value === chat.development)?.label || chat.development}
                      </span>
                      <div
                        className="h-3 w-3 md:h-4 md:w-4 p-0 hover:bg-destructive hover:text-destructive-foreground flex-shrink-0 flex items-center justify-center rounded cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseChat(chat.id);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            handleCloseChat(chat.id);
                          }
                        }}
                      >
                        <X className="h-2 w-2 md:h-3 md:w-3" />
                      </div>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </CardHeader>

              {chatList.map((chat) => (
                <TabsContent key={chat.id} value={chat.id} className="flex flex-col m-0 p-0 overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
                  <CardContent className="flex flex-col px-3 md:px-4 lg:px-6 pb-3 md:pb-4 pt-2 overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
                    {/* Área de mensajes */}
                    <div className="chat-messages-container overflow-y-auto space-y-3 mb-3 pr-1 md:pr-2" style={{ flex: 1, minHeight: 0 }}>
                      {chat.messages.length === 0 && !loadingHistory[chat.id] && (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                          <div className="text-center">
                            <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No hay mensajes aún. Comienza una conversación.</p>
                          </div>
                        </div>
                      )}

                      {loadingHistory[chat.id] && (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-5 w-5 md:h-6 md:w-6 animate-spin text-muted-foreground" />
                        </div>
                      )}

                      {chat.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex gap-2 md:gap-3 w-full ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {message.role === 'assistant' && (
                            <div className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Bot className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                            </div>
                          )}
                          
                          <div
                            className={`max-w-[85%] sm:max-w-[80%] md:max-w-[75%] lg:max-w-[70%] rounded-lg p-3 md:p-4 ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1 md:gap-2 mb-1.5 md:mb-2">
                              <div className="flex items-center gap-1 md:gap-2">
                                {message.role === 'user' ? (
                                  <User className="h-3 w-3 md:h-4 md:w-4" />
                                ) : (
                                  <Bot className="h-3 w-3 md:h-4 md:w-4" />
                                )}
                                <span className="text-[10px] md:text-xs opacity-70">
                                  {message.timestamp.toLocaleTimeString('es-MX', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {message.role === 'assistant' && (
                                <div className="flex items-center gap-0.5 md:gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 md:h-6 md:w-6 p-0"
                                    onClick={() => handleCopyAnswer(message.content)}
                                    title="Copiar respuesta"
                                  >
                                    <Copy className="h-2.5 w-2.5 md:h-3 md:w-3" />
                                  </Button>
                                  {/* Botón de regenerar - solo si hay un mensaje de usuario anterior */}
                                  {(() => {
                                    const chat = chats[activeChatId!];
                                    if (!chat) return null;
                                    const messageIndex = chat.messages.findIndex(m => m.id === message.id);
                                    if (messageIndex > 0 && chat.messages[messageIndex - 1].role === 'user') {
                                      const originalQuery = chat.messages[messageIndex - 1].content;
                                      const isRegenerating = regeneratingMessages[message.id] || false;
                                      return (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 w-5 md:h-6 md:w-6 p-0"
                                          onClick={() => handleRegenerateResponse(message.id, originalQuery)}
                                          disabled={isRegenerating}
                                          title="Regenerar respuesta"
                                        >
                                          {isRegenerating ? (
                                            <Loader2 className="h-2.5 w-2.5 md:h-3 md:w-3 animate-spin" />
                                          ) : (
                                            <RefreshCw className="h-2.5 w-2.5 md:h-3 md:w-3" />
                                          )}
                                        </Button>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
                            
                            <MarkdownRenderer 
                              content={message.content} 
                              sources={message.sources}
                              onCitationClick={(sourceIndex) => {
                                // Expandir el accordion de fuentes cuando se hace click en una cita
                                setExpandedSources((prev) => ({
                                  ...prev,
                                  [message.id]: `sources-${message.id}`,
                                }));
                                // Scroll suave hacia las fuentes después de un pequeño delay
                                setTimeout(() => {
                                  const sourcesElement = document.querySelector(`[data-sources-id="${message.id}"]`);
                                  if (sourcesElement) {
                                    sourcesElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    // Resaltar la fuente específica
                                    const sourceElement = sourcesElement.querySelector(`[data-source-index="${sourceIndex}"]`);
                                    if (sourceElement) {
                                      sourceElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
                                      setTimeout(() => {
                                        sourceElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
                                      }, 2000);
                                    }
                                  }
                                }, 100);
                              }}
                            />

                            {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                              <div 
                                className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-border/50"
                                data-sources-id={message.id}
                              >
                                <Accordion 
                                  type="single" 
                                  collapsible 
                                  className="w-full"
                                  value={expandedSources[message.id]}
                                  onValueChange={(value) => {
                                    setExpandedSources((prev) => ({
                                      ...prev,
                                      [message.id]: value,
                                    }));
                                  }}
                                >
                                  <AccordionItem value={`sources-${message.id}`} className="border-none">
                                    <AccordionTrigger className="text-[10px] md:text-xs py-1.5 md:py-2">
                                      Fuentes ({message.sources.length})
                                    </AccordionTrigger>
                                    <AccordionContent>
                                      <div className="space-y-1.5 md:space-y-2">
                                        {message.sources.map((source, index) => (
                                          <div 
                                            key={index} 
                                            className="text-[10px] md:text-xs bg-background/50 p-1.5 md:p-2 rounded transition-all"
                                            data-source-index={index}
                                          >
                                            <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1 flex-wrap">
                                              {/* Número de referencia de la fuente */}
                                              <Badge 
                                                variant="default" 
                                                className="text-[9px] md:text-xs font-bold min-w-[20px] md:min-w-[24px] justify-center py-0 px-1"
                                                title={`Fuente ${index + 1}`}
                                              >
                                                [{index + 1}]
                                              </Badge>
                                              {/* Solo mostrar el badge de relevancia si el score es mayor a 0 */}
                                              {source.relevance_score > 0 && (
                                                <Badge variant="outline" className="text-[9px] md:text-xs py-0 px-1">
                                                  {Math.round(source.relevance_score * 100)}%
                                                </Badge>
                                              )}
                                              <span className="font-medium text-[10px] md:text-xs truncate">{source.filename}</span>
                                              {source.page > 0 && (
                                                <span className="text-muted-foreground text-[9px] md:text-xs">
                                                  P. {source.page}
                                                </span>
                                              )}
                                            </div>
                                            {source.text_preview && (
                                              <p className="text-muted-foreground text-[9px] md:text-xs mt-0.5 md:mt-1 line-clamp-2">
                                                {source.text_preview}
                                              </p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                </Accordion>
                              </div>
                            )}

                            {/* Calificación de respuesta */}
                            {message.role === 'assistant' && message.query_log_id && (
                              <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-border/50">
                                <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                                  <span className="text-[10px] md:text-xs text-muted-foreground">Califica:</span>
                                  <div className="flex items-center gap-0.5 md:gap-1">
                                    {[1, 2, 3, 4, 5].map((star) => {
                                      const currentRating = message.rating || ratingMessages[message.query_log_id!] || 0;
                                      const isSubmitting = submittingRating[message.query_log_id!] || false;
                                      const isFilled = star <= currentRating;
                                      
                                      return (
                                        <button
                                          key={star}
                                          type="button"
                                          onClick={() => !isSubmitting && handleRateResponse(message.query_log_id!, star)}
                                          disabled={isSubmitting}
                                          className={`transition-all ${
                                            isSubmitting
                                              ? 'opacity-50 cursor-not-allowed'
                                              : 'hover:scale-110 cursor-pointer'
                                          }`}
                                          title={`Calificar con ${star} estrella${star > 1 ? 's' : ''}`}
                                        >
                                          <Star
                                            className={`h-3 w-3 md:h-4 md:w-4 ${
                                              isFilled
                                                ? 'fill-yellow-400 text-yellow-400'
                                                : 'text-muted-foreground hover:text-yellow-400'
                                            }`}
                                          />
                                        </button>
                                      );
                                    })}
                                    {message.rating && (
                                      <span className="text-[9px] md:text-xs text-muted-foreground ml-1 md:ml-2">
                                        ✓
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {message.role === 'user' && (
                            <div className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                            </div>
                          )}
                        </div>
                      ))}

                      {loading && activeChatId === chat.id && (
                        <div className="flex gap-2 md:gap-3 justify-start">
                          <div className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="h-3 w-3 md:h-4 md:w-4 text-primary" />
                          </div>
                          <div className="bg-muted rounded-lg p-3 md:p-4">
                            <div className="flex items-center gap-1.5 md:gap-2">
                              <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                              <span className="text-xs md:text-sm text-muted-foreground">Pensando...</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input de mensaje y acciones */}
                    <div className="space-y-1.5 border-t pt-2 flex-shrink-0">
                      <div className="flex gap-1.5 md:gap-2">
                        <div className="relative flex-1">
                          <Textarea
                            placeholder="Escribe tu pregunta... (Enter para enviar)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={2}
                            disabled={loading || activeChatId !== chat.id}
                            className="pr-10 md:pr-12 text-xs md:text-sm resize-none"
                          />
                          <Button
                            onClick={handleQuery}
                            disabled={!query.trim() || activeChatId !== chat.id || loading}
                            className="absolute bottom-1.5 md:bottom-2 right-1.5 md:right-2"
                            size="sm"
                          >
                            {loading ? (
                              <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3 md:h-4 md:w-4" />
                            )}
                          </Button>
                        </div>
                        {userRole !== 'admin' && (
                          <Button
                            variant="outline"
                            onClick={() => handleClearChat(chat.id)}
                            disabled={chat.messages.length === 0 || loadingHistory[chat.id]}
                            className="flex-shrink-0 px-2 md:px-4"
                            size="sm"
                          >
                            <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] md:text-xs text-muted-foreground px-1">
                        {query.length} caracteres
                      </p>
                    </div>
                  </CardContent>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </Card>
      </div>
    </div>
  );
}
