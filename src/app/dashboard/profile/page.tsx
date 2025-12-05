'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { changePassword, getUser, getUserDevelopments, getQueryLogs } from '@/lib/api';
import { decodeAccessToken } from '@/lib/auth';
import { Lock, Eye, EyeOff, Loader2, User, Mail, Shield, Building2, CheckCircle2, XCircle, MapPin, MessageSquare, Upload as UploadIcon, BarChart3, Star, TrendingUp, Clock } from 'lucide-react';
import type { User as UserType, UserDevelopment, UserRole, QueryLog } from '@/types/documents';

export default function ProfilePage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingUserInfo, setLoadingUserInfo] = useState(true);
  const [user, setUser] = useState<UserType | null>(null);
  const [userDevelopments, setUserDevelopments] = useState<UserDevelopment[]>([]);
  const [userStats, setUserStats] = useState<{
    totalQueries: number;
    totalRatings: number;
    averageRating: number;
    queriesThisMonth: number;
  } | null>(null);
  const [recentRatings, setRecentRatings] = useState<QueryLog[]>([]);
  const { toast } = useToast();

  // Cargar información del usuario
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        setLoadingUserInfo(true);
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const payload = decodeAccessToken(token);
        if (!payload || !payload.userId) return;

        // Cargar información del usuario
        const userData = await getUser(payload.userId);
        setUser(userData);

        // Roles con acceso completo a todos los desarrollos
        const rolesWithFullAccess: UserRole[] = ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'];
        
        // Si el usuario tiene acceso completo, no cargar desarrollos específicos
        if (userData.role && rolesWithFullAccess.includes(userData.role)) {
          setUserDevelopments([]);
        } else {
          // Cargar desarrollos asignados
          const developments = await getUserDevelopments(payload.userId);
          setUserDevelopments(developments);
        }

        // Cargar estadísticas personales
        const logsResponse = await getQueryLogs({ 
          userId: payload.userId,
          limit: 1000 // Obtener suficientes para calcular estadísticas
        });
        
        const userQueries = logsResponse.queries || [];
        
        // Calcular estadísticas
        const totalQueries = userQueries.length;
        const queriesWithRatings = userQueries.filter(q => q.feedback_rating);
        const totalRatings = queriesWithRatings.length;
        const averageRating = totalRatings > 0
          ? queriesWithRatings.reduce((sum, q) => sum + (q.feedback_rating || 0), 0) / totalRatings
          : 0;
        
        // Consultas del mes actual
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const queriesThisMonth = userQueries.filter(q => 
          new Date(q.created_at) >= firstDayOfMonth
        ).length;

        setUserStats({
          totalQueries,
          totalRatings,
          averageRating: Math.round(averageRating * 10) / 10, // Redondear a 1 decimal
          queriesThisMonth,
        });

        // Obtener últimas calificaciones (últimas 5 con rating)
        const ratingsWithFeedback = userQueries
          .filter(q => q.feedback_rating)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5);
        
        setRecentRatings(ratingsWithFeedback);

      } catch (error) {
        console.error('Error cargando información del usuario:', error);
        toast({
          title: 'Error',
          description: 'No se pudo cargar la información del usuario',
          variant: 'destructive',
        });
      } finally {
        setLoadingUserInfo(false);
      }
    };

    loadUserInfo();
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Error',
        description: 'Por favor completa todos los campos',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'Las contraseñas nuevas no coinciden',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: 'Error',
        description: 'La nueva contraseña debe tener al menos 8 caracteres',
        variant: 'destructive',
      });
      return;
    }

    if (currentPassword === newPassword) {
      toast({
        title: 'Error',
        description: 'La nueva contraseña debe ser diferente a la actual',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('accessToken');
      
      if (!token) {
        toast({
          title: 'Error',
          description: 'No estás autenticado. Por favor inicia sesión nuevamente.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      await changePassword(currentPassword, newPassword, token);

      toast({
        title: 'Contraseña actualizada',
        description: 'Tu contraseña ha sido actualizada exitosamente',
      });

      // Limpiar formulario
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

    } catch (error: any) {
      console.error('Error cambiando contraseña:', error);
      
      const errorMessage = error?.message || error?.error || 'Error al cambiar contraseña';
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Obtener nombre del rol en español
  const getRoleName = (role: UserRole | undefined): string => {
    const roleNames: Record<UserRole, string> = {
      'admin': 'Administrador',
      'ceo': 'CEO',
      'sales_manager': 'Gerente de Ventas',
      'sales_agent': 'Agente de Ventas',
      'post_sales': 'Post-Ventas',
      'legal_manager': 'Gerente Legal',
      'marketing_manager': 'Gerente de Marketing'
    };
    return role ? roleNames[role] : 'Usuario';
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

  // Verificar si el usuario tiene acceso completo
  const hasFullAccess = user?.role && ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'].includes(user.role);

  // Obtener permisos basados en el rol
  const getRolePermissions = (role: UserRole | undefined): string[] => {
    if (!role) return [];
    
    const permissions: Record<UserRole, string[]> = {
      'admin': ['Acceso total al sistema', 'Gestionar usuarios', 'Gestionar documentos', 'Consultar agente', 'Ver logs', 'Gestionar configuración'],
      'ceo': ['Acceso total al sistema', 'Gestionar usuarios', 'Gestionar documentos', 'Consultar agente', 'Ver logs'],
      'sales_manager': ['Gestionar documentos', 'Consultar agente', 'Gestionar desarrollos asignados'],
      'sales_agent': ['Consultar agente', 'Ver documentos asignados'],
      'post_sales': ['Acceso a todos los desarrollos', 'Consultar agente', 'Gestionar documentos'],
      'legal_manager': ['Acceso a todos los desarrollos', 'Consultar agente', 'Gestionar documentos legales'],
      'marketing_manager': ['Acceso a todos los desarrollos', 'Consultar agente', 'Gestionar documentos de marketing']
    };
    
    return permissions[role] || [];
  };

  if (loadingUserInfo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-capital-navy" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Mi Perfil</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Gestiona tu información personal y configuración de cuenta
        </p>
      </div>

      {/* Información del Usuario */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-capital-navy" />
            <CardTitle>Información Personal</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 min-w-[120px]">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Email:</span>
              </div>
              <span className="text-sm sm:text-base">{user?.email || 'N/A'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 min-w-[120px]">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Nombre:</span>
              </div>
              <span className="text-sm sm:text-base">{user?.name || 'N/A'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 min-w-[120px]">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Rol:</span>
              </div>
              <Badge variant="secondary" className="w-fit">
                {getRoleName(user?.role)}
              </Badge>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 min-w-[120px]">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Estado:</span>
              </div>
              <Badge variant={user?.is_active ? 'default' : 'destructive'} className="w-fit">
                {user?.is_active ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Permisos del Rol */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-capital-navy" />
            <CardTitle>Permisos del Rol</CardTitle>
          </div>
          <CardDescription>
            Permisos asociados a tu rol: <strong>{getRoleName(user?.role)}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {getRolePermissions(user?.role).map((permission, index) => (
              <div key={index} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                <span className="text-sm">{permission}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas Personales */}
      {userStats && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-capital-navy" />
              <CardTitle>Estadísticas Personales</CardTitle>
            </div>
            <CardDescription>
              Tu actividad y desempeño en el sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col items-center sm:items-start p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Total Consultas</span>
                </div>
                <span className="text-2xl font-bold text-blue-900">{userStats.totalQueries}</span>
              </div>
              
              <div className="flex flex-col items-center sm:items-start p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Este Mes</span>
                </div>
                <span className="text-2xl font-bold text-green-900">{userStats.queriesThisMonth}</span>
              </div>
              
              <div className="flex flex-col items-center sm:items-start p-3 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-4 w-4 text-yellow-600" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Calificaciones</span>
                </div>
                <span className="text-2xl font-bold text-yellow-900">{userStats.totalRatings}</span>
              </div>
              
              <div className="flex flex-col items-center sm:items-start p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-purple-600" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Promedio</span>
                </div>
                <span className="text-2xl font-bold text-purple-900">
                  {userStats.averageRating > 0 ? userStats.averageRating.toFixed(1) : 'N/A'}
                </span>
                {userStats.averageRating > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-3 w-3 ${
                          star <= Math.round(userStats.averageRating)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Últimas Calificaciones */}
      {recentRatings.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-capital-navy" />
              <CardTitle>Últimas Calificaciones</CardTitle>
            </div>
            <CardDescription>
              Tus calificaciones más recientes a las respuestas del agente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentRatings.map((rating) => (
                <div
                  key={rating.id}
                  className="border rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3">
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
                            <span className="ml-2 text-sm font-semibold">
                              {rating.feedback_rating}/5
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 line-clamp-2">
                            {rating.query}
                          </p>
                          {rating.feedback_comment && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              &quot;{rating.feedback_comment}&quot;
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
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(rating.created_at).toLocaleDateString('es-MX', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Desarrollos Asignados */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-capital-navy" />
            <CardTitle>Desarrollos Asignados</CardTitle>
          </div>
          <CardDescription>
            {hasFullAccess 
              ? 'Tienes acceso a todos los desarrollos y zonas'
              : `Tienes acceso a ${userDevelopments.length} desarrollo(s) específico(s)`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasFullAccess ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Acceso Completo</h4>
                  <p className="text-sm text-blue-800">
                    Como {getRoleName(user?.role)}, tienes acceso completo a todos los desarrollos 
                    en todas las zonas. Puedes consultar y gestionar documentos sin restricciones.
                  </p>
                </div>
              </div>
            </div>
          ) : userDevelopments.length > 0 ? (
            <div className="space-y-3">
              {userDevelopments.map((dev, index) => (
                <div 
                  key={index} 
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-capital-navy" />
                        <span className="font-semibold text-sm sm:text-base">
                          {getZoneName(dev.zone)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm sm:text-base">{dev.development}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge 
                          variant={dev.can_query ? 'default' : 'secondary'} 
                          className="flex items-center gap-1"
                        >
                          {dev.can_query ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          <MessageSquare className="h-3 w-3" />
                          <span className="text-xs">Consultar</span>
                        </Badge>
                        <Badge 
                          variant={dev.can_upload ? 'default' : 'secondary'} 
                          className="flex items-center gap-1"
                        >
                          {dev.can_upload ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          <UploadIcon className="h-3 w-3" />
                          <span className="text-xs">Subir</span>
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No tienes desarrollos asignados</p>
              <p className="text-xs mt-1">Contacta a tu administrador para obtener acceso</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cambiar Contraseña */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-capital-navy" />
            <CardTitle>Cambiar Contraseña</CardTitle>
          </div>
          <CardDescription>
            Actualiza tu contraseña para mantener tu cuenta segura. 
            Asegúrate de usar una contraseña fuerte con al menos 8 caracteres.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Contraseña actual */}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Contraseña Actual</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña actual"
                  disabled={loading}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  disabled={loading}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Nueva contraseña */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ingresa tu nueva contraseña (mínimo 8 caracteres)"
                  disabled={loading}
                  required
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={loading}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                La contraseña debe tener al menos 8 caracteres
              </p>
            </div>

            {/* Confirmar nueva contraseña */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirma tu nueva contraseña"
                  disabled={loading}
                  required
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {/* Botón de envío */}
            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  'Actualizar Contraseña'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recomendaciones de Seguridad */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-capital-navy" />
            <CardTitle>Recomendaciones de Seguridad</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>Usa una contraseña única que no uses en otros servicios</li>
            <li>Combina letras mayúsculas, minúsculas, números y símbolos</li>
            <li>No compartas tu contraseña con nadie</li>
            <li>Cambia tu contraseña periódicamente</li>
            <li>Si sospechas que tu cuenta ha sido comprometida, cambia tu contraseña inmediatamente</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

