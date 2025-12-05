'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  Building2, 
  X,
  Check,
  Key,
  Copy,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { 
  getAllUsers, 
  createUser, 
  updateUser, 
  deleteUser,
  getUserDevelopments,
  assignUserDevelopment,
  updateUserDevelopment,
  removeUserDevelopment
} from '@/lib/api';
import { ZONES, DEVELOPMENTS, ROLES } from '@/lib/constants';
import { formatDate, snakeToTitle } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import type { User, UserDevelopment, Role, Zone } from '@/types/documents';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [dbRoles, setDbRoles] = useState<Role[]>([]); // Roles de la BD para obtener IDs
  const [loading, setLoading] = useState(true);
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [showDevelopmentsDialog, setShowDevelopmentsDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showTempPasswordDialog, setShowTempPasswordDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userDevelopments, setUserDevelopments] = useState<UserDevelopment[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [tempPasswordUser, setTempPasswordUser] = useState('');
  const [copiedPassword, setCopiedPassword] = useState(false);
  
  // Form states
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formRoleValue, setFormRoleValue] = useState<string>(''); // Valor del rol de constants.ts
  const [formIsActive, setFormIsActive] = useState(true);
  const [formNewUserPassword, setFormNewUserPassword] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPasswordConfirm, setFormPasswordConfirm] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Development form states
  const [devZone, setDevZone] = useState<Zone | ''>('');
  const [devDevelopment, setDevDevelopment] = useState('');
  const [devCanUpload, setDevCanUpload] = useState(false);
  const [devCanQuery, setDevCanQuery] = useState(true);
  
  const { toast } = useToast();

  const loadDbRoles = useCallback(async () => {
    try {
      const { getRoles } = await import('@/lib/api');
      const data = await getRoles();
      setDbRoles(data);
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: '❌ Error',
        description: 'No se pudieron cargar los usuarios',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadUsers();
    loadDbRoles(); // Cargar roles de BD para mapear IDs
  }, [loadUsers, loadDbRoles]);

  // Función helper para obtener el ID del rol desde su nombre
  const getRoleIdByName = (roleName: string): number | null => {
    const role = dbRoles.find(r => r.name === roleName);
    return role ? role.id : null;
  };

  const loadUserDevelopments = async (userId: number) => {
    try {
      const devs = await getUserDevelopments(userId);
      setUserDevelopments(devs);
    } catch (error) {
      console.error('Error loading user developments:', error);
      toast({
        title: '❌ Error',
        description: 'No se pudieron cargar los desarrollos del usuario',
        variant: 'destructive',
      });
    }
  };

  // Generar contraseña temporal segura
  const generateTempPassword = (): string => {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%&*';
    const allChars = uppercase + lowercase + numbers + symbols;
    
    let password = '';
    // Asegurar al menos un carácter de cada tipo
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // Completar el resto de la contraseña
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Mezclar los caracteres
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setFormEmail('');
    setFormName('');
    setFormRoleValue('');
    setFormIsActive(true);
    // Generar contraseña temporal automáticamente
    const generatedPassword = generateTempPassword();
    setFormNewUserPassword(generatedPassword);
    setShowUserDialog(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormName(user.name);
    // Mapear el role_id al valor del rol en constants.ts
    const dbRole = dbRoles.find(r => r.id === user.role_id);
    setFormRoleValue(dbRole?.name || '');
    setFormIsActive(user.is_active);
    setShowUserDialog(true);
  };

  const handleSaveUser = async () => {
    if (!formEmail || !formName || !formRoleValue) {
      toast({
        title: 'Error',
        description: 'Por favor completa todos los campos requeridos',
        variant: 'destructive',
      });
      return;
    }

    // Obtener el ID del rol desde la base de datos
    const roleId = getRoleIdByName(formRoleValue);
    if (!roleId) {
      toast({
        title: 'Error',
        description: 'El rol seleccionado no existe en la base de datos',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Actualizar usuario
        await updateUser(editingUser.id, {
          email: formEmail,
          name: formName,
          role_id: roleId,
          is_active: formIsActive,
        });
        toast({
          title: '✅ Usuario actualizado',
          description: `"${formName}" ha sido actualizado exitosamente`,
        });
      } else {
        // Crear usuario con contraseña temporal
        await createUser({
          email: formEmail,
          name: formName,
          role_id: roleId,
          password: formNewUserPassword, // Siempre hay contraseña temporal
        });
        
        // Guardar contraseña temporal y nombre de usuario para mostrar
        setTempPassword(formNewUserPassword);
        setTempPasswordUser(formName);
        setCopiedPassword(false);
        
        // Cerrar diálogo de creación y mostrar diálogo de contraseña temporal
        setShowUserDialog(false);
        setShowTempPasswordDialog(true);
      }
      
      loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'Error al guardar el usuario',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    setIsDeleting(true);
    try {
      await deleteUser(userToDelete.id);
      toast({
        title: '✅ Usuario desactivado',
        description: `"${userToDelete.name}" ha sido desactivado exitosamente`,
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: '❌ Error al desactivar',
        description: error instanceof Error ? error.message : 'No se pudo desactivar el usuario',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleChangePassword = (user: User) => {
    setPasswordUser(user);
    setFormPassword('');
    setFormPasswordConfirm('');
    setShowPasswordDialog(true);
  };

  const handleSavePassword = async () => {
    if (!passwordUser) return;

    if (!formPassword || !formPasswordConfirm) {
      toast({
        title: 'Error',
        description: 'Por favor completa ambos campos de contraseña',
        variant: 'destructive',
      });
      return;
    }

    if (formPassword !== formPasswordConfirm) {
      toast({
        title: 'Error',
        description: 'Las contraseñas no coinciden',
        variant: 'destructive',
      });
      return;
    }

    setChangingPassword(true);
    try {
      // Obtener token de autenticación del localStorage
      const token = localStorage.getItem('accessToken');
      
      if (!token) {
        toast({
          title: 'Error',
          description: 'No estás autenticado. Por favor inicia sesión nuevamente.',
          variant: 'destructive',
        });
        setChangingPassword(false);
        return;
      }
      
      const response = await fetch(`/api/users/${passwordUser.id}/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password: formPassword }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Error al cambiar contraseña');
      }

      toast({
        title: '✅ Contraseña actualizada',
        description: `La contraseña de "${passwordUser.name}" ha sido actualizada exitosamente. El usuario debe usar la nueva contraseña para iniciar sesión.`,
      });

      setShowPasswordDialog(false);
      setFormPassword('');
      setFormPasswordConfirm('');
    } catch (error) {
      console.error('Error changing password:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'Error al cambiar contraseña',
        variant: 'destructive',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleManageDevelopments = async (user: User) => {
    setSelectedUser(user);
    await loadUserDevelopments(user.id);
    setDevZone('');
    setDevDevelopment('');
    setDevCanUpload(false);
    setDevCanQuery(true);
    setShowDevelopmentsDialog(true);
  };

  const handleAddDevelopment = async () => {
    if (!selectedUser || !devZone || !devDevelopment) {
      toast({
        title: 'Error',
        description: 'Por favor selecciona zona y desarrollo',
        variant: 'destructive',
      });
      return;
    }

    try {
      await assignUserDevelopment(selectedUser.id, {
        zone: devZone as Zone,
        development: devDevelopment,
        can_upload: devCanUpload,
        can_query: devCanQuery,
      });
      toast({
        title: '✅ Desarrollo asignado',
        description: 'El desarrollo ha sido asignado al usuario',
      });
      await loadUserDevelopments(selectedUser.id);
      setDevZone('');
      setDevDevelopment('');
      setDevCanUpload(false);
      setDevCanQuery(true);
    } catch (error) {
      console.error('Error assigning development:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'Error al asignar desarrollo',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveDevelopment = async (zone: Zone, development: string) => {
    if (!selectedUser) return;

    try {
      await removeUserDevelopment(selectedUser.id, zone, development);
      toast({
        title: '✅ Desarrollo removido',
        description: 'El desarrollo ha sido removido del usuario',
      });
      await loadUserDevelopments(selectedUser.id);
    } catch (error) {
      console.error('Error removing development:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'Error al remover desarrollo',
        variant: 'destructive',
      });
    }
  };

  const handleToggleDevelopmentPermission = async (
    zone: Zone,
    development: string,
    permission: 'can_upload' | 'can_query',
    currentValue: boolean
  ) => {
    if (!selectedUser) return;

    try {
      const dev = userDevelopments.find(
        d => d.zone === zone && d.development === development
      );
      if (!dev) return;

      await updateUserDevelopment(selectedUser.id, {
        zone,
        development,
        can_upload: permission === 'can_upload' ? !currentValue : dev.can_upload,
        can_query: permission === 'can_query' ? !currentValue : dev.can_query,
      });
      await loadUserDevelopments(selectedUser.id);
    } catch (error) {
      console.error('Error updating development permission:', error);
      toast({
        title: '❌ Error',
        description: 'Error al actualizar permisos',
        variant: 'destructive',
      });
    }
  };

  // Función helper para obtener el label del rol desde constants.ts
  const getRoleLabel = (roleName?: string): string => {
    if (!roleName) return 'Sin rol';
    const role = ROLES.find(r => r.value === roleName);
    return role ? role.label : snakeToTitle(roleName);
  };

  const getRoleBadgeVariant = (role?: string) => {
    if (!role) return 'outline';
    const roleConfig = ROLES.find(r => r.value === role);
    if (!roleConfig) return 'outline';
    
    // Mapear colores de constants.ts a variantes de Badge
    switch (roleConfig.color) {
      case 'blue':
        return 'default';
      case 'purple':
        return 'destructive';
      case 'green':
        return 'secondary';
      case 'yellow':
        return 'outline';
      case 'pink':
        return 'secondary';
      case 'orange':
        return 'default';
      case 'brown':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const developments = devZone ? DEVELOPMENTS[devZone] || [] : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="pl-4">
          <h1 className="text-3xl font-bold navy-text">Usuarios</h1>
          <p className="text-muted-foreground">
            Gestiona usuarios y sus permisos
          </p>
        </div>
        <Button onClick={handleCreateUser}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Usuario
        </Button>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Usuarios ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Cargando usuarios...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <Users className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No hay usuarios registrados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha de creación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {getRoleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>
                        {user.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(new Date(user.created_at))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleManageDevelopments(user)}
                        >
                          <Building2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleChangePassword(user)}
                          title="Cambiar contraseña"
                        >
                          <Key className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {user.email !== 'admin@capitalplus.com' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(user)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* User Dialog */}
      {showUserDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUserDialog(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nombre completo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Rol *</Label>
                <Select
                  value={formRoleValue}
                  onValueChange={setFormRoleValue}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="new-user-password" className="flex items-center justify-between">
                    <span>Contraseña Temporal</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormNewUserPassword(generateTempPassword())}
                      className="h-7 text-xs"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Regenerar
                    </Button>
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-user-password"
                      type="text"
                      value={formNewUserPassword}
                      onChange={(e) => setFormNewUserPassword(e.target.value)}
                      placeholder="Contraseña generada automáticamente"
                      className="font-mono"
                      readOnly
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ⚠️ Esta contraseña se mostrará una sola vez después de crear el usuario
                  </p>
                </div>
              )}

              {editingUser && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="active">Usuario activo</Label>
                  <Switch
                    id="active"
                    checked={formIsActive}
                    onCheckedChange={setFormIsActive}
                  />
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowUserDialog(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveUser}
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Guardar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Developments Dialog */}
      {showDevelopmentsDialog && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Gestionar Desarrollos</h2>
                <p className="text-sm text-muted-foreground">{selectedUser.name}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDevelopmentsDialog(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Add Development Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asignar Nuevo Desarrollo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Zona</Label>
                    <Select value={devZone} onValueChange={(value) => { setDevZone(value as Zone); setDevDevelopment(''); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona zona" />
                      </SelectTrigger>
                      <SelectContent>
                        {ZONES.map((z) => (
                          <SelectItem key={z.value} value={z.value}>
                            {z.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Desarrollo</Label>
                    <Select value={devDevelopment} onValueChange={setDevDevelopment} disabled={!devZone}>
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
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={devCanQuery}
                      onCheckedChange={setDevCanQuery}
                    />
                    <Label>Puede consultar</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={devCanUpload}
                      onCheckedChange={setDevCanUpload}
                    />
                    <Label>Puede subir documentos</Label>
                  </div>
                </div>

                <Button onClick={handleAddDevelopment} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Asignar Desarrollo
                </Button>
              </CardContent>
            </Card>

            {/* User Developments List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Desarrollos Asignados</CardTitle>
              </CardHeader>
              <CardContent>
                {userDevelopments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay desarrollos asignados
                  </p>
                ) : (
                  <div className="space-y-2">
                    {userDevelopments.map((dev) => (
                      <div
                        key={`${dev.zone}-${dev.development}`}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {snakeToTitle(dev.zone)} - {snakeToTitle(dev.development)}
                          </p>
                          <div className="flex gap-4 mt-1">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={dev.can_query}
                                onCheckedChange={() =>
                                  handleToggleDevelopmentPermission(
                                    dev.zone,
                                    dev.development,
                                    'can_query',
                                    dev.can_query
                                  )
                                }
                              />
                              <span className="text-xs text-muted-foreground">Consultar</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={dev.can_upload}
                                onCheckedChange={() =>
                                  handleToggleDevelopmentPermission(
                                    dev.zone,
                                    dev.development,
                                    'can_upload',
                                    dev.can_upload
                                  )
                                }
                              />
                              <span className="text-xs text-muted-foreground">Subir</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDevelopment(dev.zone, dev.development)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Password Change Dialog */}
      {showPasswordDialog && passwordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Cambiar Contraseña
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswordDialog(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Cambiando contraseña para: <strong>{passwordUser.name}</strong> ({passwordUser.email})
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nueva Contraseña *</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
                <p className="text-xs text-muted-foreground">
                  Debe contener: mayúsculas, minúsculas, números y caracteres especiales
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Contraseña *</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={formPasswordConfirm}
                  onChange={(e) => setFormPasswordConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordDialog(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSavePassword}
                  disabled={changingPassword}
                  className="flex-1"
                >
                  {changingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cambiando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Cambiar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Temporary Password Dialog - Shown after creating user */}
      {showTempPasswordDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold">
                  Usuario Creado
                </h2>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-900 mb-2">
                  ⚠️ Contraseña Temporal Generada
                </p>
                <p className="text-xs text-amber-700">
                  Esta contraseña solo se mostrará una vez. Asegúrate de copiarla y compartirla con el usuario de forma segura.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Usuario</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={tempPasswordUser}
                    readOnly
                    className="font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Contraseña Temporal</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={tempPassword}
                    readOnly
                    className="font-mono text-lg font-semibold"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(tempPassword);
                      setCopiedPassword(true);
                      toast({
                        title: '✅ Copiado',
                        description: 'Contraseña copiada al portapapeles',
                      });
                      setTimeout(() => setCopiedPassword(false), 3000);
                    }}
                    title="Copiar contraseña"
                  >
                    {copiedPassword ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Haz clic en el botón para copiar la contraseña
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-900">
                  <strong>Instrucciones para el usuario:</strong>
                  <br />
                  1. Use esta contraseña para iniciar sesión por primera vez
                  <br />
                  2. Se recomienda cambiar la contraseña después del primer inicio de sesión
                  <br />
                  3. La contraseña debe contener mayúsculas, minúsculas, números y símbolos
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => {
                    setShowTempPasswordDialog(false);
                    setTempPassword('');
                    setTempPasswordUser('');
                    toast({
                      title: '✅ Usuario creado',
                      description: 'El usuario ha sido creado exitosamente',
                    });
                  }}
                  className="flex-1"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Entendido
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Desactivar Usuario"
        description={`¿Estás seguro de que deseas desactivar a "${userToDelete?.name}"? El usuario no podrá acceder al sistema.`}
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        variant="destructive"
        loading={isDeleting}
      />
    </div>
  );
}
