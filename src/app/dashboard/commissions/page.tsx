'use client';

/**
 * =====================================================
 * PÁGINA: Dashboard de Comisiones
 * =====================================================
 * Módulo completo de comisiones con 4 pestañas:
 * 1. Configuración
 * 2. Ventas comisionables
 * 3. Distribución
 * 4. Dashboard
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, Calculator, RefreshCw, Settings, ShoppingCart, PieChart, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { decodeAccessToken } from '@/lib/auth';
import { DEVELOPMENTS } from '@/lib/constants';
import type { UserRole } from '@/types/documents';
import type {
  CommissionConfig,
  CommissionConfigInput,
  CommissionSale,
  CommissionDistribution,
  CommissionDevelopmentDashboard,
  CommissionGeneralDashboard,
} from '@/types/commissions';

export default function CommissionsPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('config');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { toast } = useToast();

  // Datos
  const [configs, setConfigs] = useState<CommissionConfig[]>([]);
  const [globalConfigs, setGlobalConfigs] = useState<any[]>([]);
  const [sales, setSales] = useState<CommissionSale[]>([]);
  const [distributions, setDistributions] = useState<Record<number, CommissionDistribution[]>>({});
  const [developmentDashboard, setDevelopmentDashboard] = useState<CommissionDevelopmentDashboard | null>(null);
  const [generalDashboard, setGeneralDashboard] = useState<CommissionGeneralDashboard | null>(null);
  const [availableDevelopmentsForFilter, setAvailableDevelopmentsForFilter] = useState<string[]>([]);

  // Filtros
  const [selectedDesarrollo, setSelectedDesarrollo] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Verificar rol del usuario
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = decodeAccessToken(token);
      if (payload) {
        setUserRole(payload.role as UserRole);
        // Verificar permisos: solo admin y ceo pueden acceder
        if (payload.role !== 'admin' && payload.role !== 'ceo') {
          toast({
            title: 'Acceso denegado',
            description: 'Solo administradores y CEO pueden acceder al módulo de comisiones',
            variant: 'destructive',
          });
          // Redirigir al dashboard principal después de 2 segundos
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 2000);
        }
      }
    }
  }, [toast]);

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData();
  }, [activeTab, selectedDesarrollo, selectedYear]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      if (activeTab === 'config') {
        await loadConfigs();
      } else if (activeTab === 'sales') {
        await loadSales();
      } else if (activeTab === 'distribution') {
        await loadSales();
      } else if (activeTab === 'dashboard') {
        await loadDashboard();
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadConfigs = async () => {
    const token = localStorage.getItem('accessToken');
    const response = await fetch('/api/commissions/config', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (data.success) {
      setConfigs(data.data.configs || []);
      setGlobalConfigs(data.data.globalConfigs || []);
    }
  };

  const loadSales = async () => {
    const token = localStorage.getItem('accessToken');
    const params = new URLSearchParams();
    if (selectedDesarrollo !== 'all') {
      params.append('desarrollo', selectedDesarrollo);
    }
    const response = await fetch(`/api/commissions/sales?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (data.success) {
      const loadedSales = data.data.sales || [];
      setSales(loadedSales);
      
      // Obtener desarrollos únicos de las ventas para el filtro
      const devs = new Set<string>();
      loadedSales.forEach((sale: CommissionSale) => {
        if (sale.desarrollo) {
          devs.add(sale.desarrollo);
        }
      });
      setAvailableDevelopmentsForFilter(Array.from(devs).sort());
    }
  };

  const loadDashboard = async () => {
    const token = localStorage.getItem('accessToken');
    const params = new URLSearchParams();
    params.append('year', selectedYear.toString());
    if (selectedDesarrollo !== 'all') {
      params.append('desarrollo', selectedDesarrollo);
    }
    const response = await fetch(`/api/commissions/dashboard?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (data.success) {
      if (selectedDesarrollo !== 'all') {
        setDevelopmentDashboard(data.data);
      } else {
        setGeneralDashboard(data.data);
      }
    }
  };

  // Si el usuario no tiene permisos, mostrar mensaje
  if (userRole && userRole !== 'admin' && userRole !== 'ceo') {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Acceso Denegado</CardTitle>
            <CardDescription>
              Solo administradores y CEO pueden acceder al módulo de comisiones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Serás redirigido al dashboard principal...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Módulo de Comisiones</h1>
          <p className="text-muted-foreground mt-1">
            Sistema configurable, auditable y flexible para gestión de comisiones
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config">
            <Settings className="mr-2 h-4 w-4" />
            Configuración
          </TabsTrigger>
          <TabsTrigger value="sales">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Ventas Comisionables
          </TabsTrigger>
          <TabsTrigger value="distribution">
            <PieChart className="mr-2 h-4 w-4" />
            Distribución
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <BarChart3 className="mr-2 h-4 w-4" />
            Dashboard
          </TabsTrigger>
        </TabsList>

        {/* Pestaña: Configuración */}
        <TabsContent value="config" className="space-y-4">
          <ConfigTab
            configs={configs}
            globalConfigs={globalConfigs}
            onConfigSaved={loadConfigs}
            loading={loading}
          />
        </TabsContent>

        {/* Pestaña: Ventas Comisionables */}
        <TabsContent value="sales" className="space-y-4">
          <SalesTab
            sales={sales}
            selectedDesarrollo={selectedDesarrollo}
            onDesarrolloChange={setSelectedDesarrollo}
            onRefresh={loadSales}
            loading={loading}
            availableDevelopments={availableDevelopmentsForFilter}
          />
        </TabsContent>

        {/* Pestaña: Distribución */}
        <TabsContent value="distribution" className="space-y-4">
          <DistributionTab
            sales={sales}
            distributions={distributions}
            selectedDesarrollo={selectedDesarrollo}
            onDesarrolloChange={setSelectedDesarrollo}
            onRefresh={loadSales}
            loading={loading}
            availableDevelopments={availableDevelopmentsForFilter}
          />
        </TabsContent>

        {/* Pestaña: Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <DashboardTab
            developmentDashboard={developmentDashboard}
            generalDashboard={generalDashboard}
            selectedDesarrollo={selectedDesarrollo}
            selectedYear={selectedYear}
            onDesarrolloChange={setSelectedDesarrollo}
            onYearChange={setSelectedYear}
            loading={loading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================
// COMPONENTE: Pestaña de Configuración
// =====================================================

function ConfigTab({
  configs,
  globalConfigs,
  onConfigSaved,
  loading,
}: {
  configs: CommissionConfig[];
  globalConfigs: any[];
  onConfigSaved: () => void;
  loading: boolean;
}) {
  const [selectedConfig, setSelectedConfig] = useState<CommissionConfig | null>(null);
  const [formData, setFormData] = useState<Partial<CommissionConfigInput>>({});
  const [saving, setSaving] = useState(false);
  const [globalFormData, setGlobalFormData] = useState<{
    operations_coordinator_percent: number;
    marketing_percent: number;
  }>({
    operations_coordinator_percent: 0,
    marketing_percent: 0,
  });
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [availableDevelopments, setAvailableDevelopments] = useState<string[]>([]);
  const [loadingDevelopments, setLoadingDevelopments] = useState(false);
  const { toast } = useToast();

  // Cargar valores globales cuando se cargan los datos
  useEffect(() => {
    if (globalConfigs && globalConfigs.length > 0) {
      const operations = globalConfigs.find(c => c.config_key === 'operations_coordinator_percent');
      const marketing = globalConfigs.find(c => c.config_key === 'marketing_percent');
      setGlobalFormData({
        operations_coordinator_percent: operations?.config_value || 0,
        marketing_percent: marketing?.config_value || 0,
      });
    }
  }, [globalConfigs]);

  // Cargar lista de desarrollos disponibles (los mismos que usa el resto de la app)
  useEffect(() => {
    setLoadingDevelopments(true);
    try {
      // Obtener todos los desarrollos de todas las zonas (misma estructura que usa upload y agent)
      const allDevelopments = new Set<string>();
      Object.values(DEVELOPMENTS).forEach((zoneDevs) => {
        zoneDevs.forEach((dev) => {
          // DEVELOPMENTS tiene estructura { value: string, label: string }
          allDevelopments.add(dev.value);
        });
      });
      
      // También agregar desarrollos de configuraciones existentes (por si hay alguno nuevo)
      configs.forEach((config) => {
        allDevelopments.add(config.desarrollo);
      });

      // Ordenar alfabéticamente
      setAvailableDevelopments(Array.from(allDevelopments).sort());
    } catch (error) {
      console.error('Error cargando desarrollos:', error);
      // En caso de error, usar desarrollos de configuraciones existentes
      const existingDevs = configs.map(c => c.desarrollo);
      setAvailableDevelopments(existingDevs.sort());
    } finally {
      setLoadingDevelopments(false);
    }
  }, [configs]);

  // Cargar configuración existente cuando se selecciona un desarrollo
  useEffect(() => {
    if (formData.desarrollo) {
      // Buscar si existe configuración para este desarrollo
      const existingConfig = configs.find(
        (config) => config.desarrollo.toLowerCase().trim() === formData.desarrollo?.toLowerCase().trim()
      );
      
      if (existingConfig) {
        // Cargar todos los valores de la configuración existente
        setFormData({
          desarrollo: existingConfig.desarrollo,
          phase_sale_percent: existingConfig.phase_sale_percent,
          phase_post_sale_percent: existingConfig.phase_post_sale_percent,
          sale_pool_total_percent: existingConfig.sale_pool_total_percent,
          sale_manager_percent: existingConfig.sale_manager_percent,
          deal_owner_percent: existingConfig.deal_owner_percent,
          external_advisor_percent: existingConfig.external_advisor_percent,
          legal_manager_percent: existingConfig.legal_manager_percent,
          post_sale_coordinator_percent: existingConfig.post_sale_coordinator_percent,
          customer_service_enabled: existingConfig.customer_service_enabled,
          customer_service_percent: existingConfig.customer_service_percent,
          deliveries_enabled: existingConfig.deliveries_enabled,
          deliveries_percent: existingConfig.deliveries_percent,
          bonds_enabled: existingConfig.bonds_enabled,
          bonds_percent: existingConfig.bonds_percent,
        });
        setSelectedConfig(existingConfig);
      } else {
        // Si no existe configuración, limpiar el formulario pero mantener el desarrollo seleccionado
        setFormData({
          desarrollo: formData.desarrollo,
          phase_sale_percent: undefined,
          phase_post_sale_percent: undefined,
          sale_pool_total_percent: undefined,
          sale_manager_percent: undefined,
          deal_owner_percent: undefined,
          external_advisor_percent: undefined,
          legal_manager_percent: undefined,
          post_sale_coordinator_percent: undefined,
          customer_service_enabled: false,
          customer_service_percent: undefined,
          deliveries_enabled: false,
          deliveries_percent: undefined,
          bonds_enabled: false,
          bonds_percent: undefined,
        });
        setSelectedConfig(null);
      }
    }
  }, [formData.desarrollo, configs]);

  const handleSave = async () => {
    if (!formData.desarrollo) {
      toast({
        title: 'Error',
        description: 'El desarrollo es requerido',
        variant: 'destructive',
      });
      return;
    }

    // Convertir undefined a 0 para campos numéricos antes de enviar
    const dataToSend: CommissionConfigInput = {
      desarrollo: formData.desarrollo,
      phase_sale_percent: formData.phase_sale_percent ?? 0,
      phase_post_sale_percent: formData.phase_post_sale_percent ?? 0,
      sale_pool_total_percent: formData.sale_pool_total_percent ?? 0,
      sale_manager_percent: formData.sale_manager_percent ?? 0,
      deal_owner_percent: formData.deal_owner_percent ?? 0,
      external_advisor_percent: formData.external_advisor_percent ?? null,
      legal_manager_percent: formData.legal_manager_percent ?? 0,
      post_sale_coordinator_percent: formData.post_sale_coordinator_percent ?? 0,
      customer_service_enabled: formData.customer_service_enabled ?? false,
      customer_service_percent: formData.customer_service_percent ?? null,
      deliveries_enabled: formData.deliveries_enabled ?? false,
      deliveries_percent: formData.deliveries_percent ?? null,
      bonds_enabled: formData.bonds_enabled ?? false,
      bonds_percent: formData.bonds_percent ?? null,
    };

    setSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/config', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Éxito',
          description: 'Configuración guardada correctamente',
        });
        onConfigSaved();
        setSelectedConfig(data.data);
        setFormData({});
      } else {
        // Mostrar errores de validación si existen
        const errorMessage = data.details && Array.isArray(data.details) 
          ? data.details.join(', ')
          : data.error || 'Error al guardar la configuración';
        
        toast({
          title: 'Error de validación',
          description: errorMessage,
          variant: 'destructive',
        });
        console.error('Errores de validación:', data.details || data.error);
      }
    } catch (error) {
      console.error('Error guardando configuración:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la configuración',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGlobal = async (configKey: 'operations_coordinator_percent' | 'marketing_percent') => {
    setSavingGlobal(true);
    try {
      const token = localStorage.getItem('accessToken');
      const configValue = globalFormData[configKey];
      
      const response = await fetch('/api/commissions/config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configKey,
          configValue,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Éxito',
          description: `Configuración global de ${configKey === 'operations_coordinator_percent' ? 'Operaciones' : 'Marketing'} guardada correctamente`,
        });
        onConfigSaved(); // Recargar configuraciones
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al guardar la configuración global',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error guardando configuración global:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la configuración global',
        variant: 'destructive',
      });
    } finally {
      setSavingGlobal(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Configuración Global de Roles Indirectos */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración Global - Roles Indirectos</CardTitle>
          <CardDescription>
            Estos porcentajes se aplican a todos los desarrollos. Los roles indirectos reciben un porcentaje fijo global sobre la fase de venta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>% Coordinador de Operaciones de Ventas</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={globalFormData.operations_coordinator_percent}
                  onChange={(e) => setGlobalFormData({
                    ...globalFormData,
                    operations_coordinator_percent: parseFloat(e.target.value) || 0,
                  })}
                  placeholder="0.00"
                />
                <Button
                  onClick={() => handleSaveGlobal('operations_coordinator_percent')}
                  disabled={savingGlobal}
                  variant="outline"
                >
                  {savingGlobal ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Porcentaje global aplicable a todos los desarrollos sobre la fase de venta
              </p>
            </div>
            <div className="space-y-2">
              <Label>% Departamento de Marketing</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={globalFormData.marketing_percent}
                  onChange={(e) => setGlobalFormData({
                    ...globalFormData,
                    marketing_percent: parseFloat(e.target.value) || 0,
                  })}
                  placeholder="0.00"
                />
                <Button
                  onClick={() => handleSaveGlobal('marketing_percent')}
                  disabled={savingGlobal}
                  variant="outline"
                >
                  {savingGlobal ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Porcentaje global aplicable a todos los desarrollos sobre la fase de venta
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuración por Desarrollo */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración por Desarrollo</CardTitle>
          <CardDescription>
            Configura los porcentajes de comisión para cada desarrollo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Desarrollo</Label>
              {loadingDevelopments ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Cargando desarrollos...</span>
                </div>
              ) : (
                <Select
                  value={formData.desarrollo || ''}
                  onValueChange={(value) => setFormData({ ...formData, desarrollo: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un desarrollo" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDevelopments.length === 0 ? (
                      <SelectItem value="" disabled>
                        No hay desarrollos disponibles
                      </SelectItem>
                    ) : (
                      availableDevelopments.map((dev) => (
                        <SelectItem key={dev} value={dev}>
                          {dev}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>% Fase Venta</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.phase_sale_percent !== undefined ? formData.phase_sale_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    phase_sale_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>% Fase Postventa</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.phase_post_sale_percent !== undefined ? formData.phase_post_sale_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    phase_post_sale_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>% Pool Total Venta</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.sale_pool_total_percent !== undefined ? formData.sale_pool_total_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    sale_pool_total_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>% Gerente de Ventas</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.sale_manager_percent !== undefined ? formData.sale_manager_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    sale_manager_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>% Propietario del Deal</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.deal_owner_percent !== undefined ? formData.deal_owner_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    deal_owner_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>% Asesor Externo (Opcional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.external_advisor_percent !== undefined && formData.external_advisor_percent !== null ? formData.external_advisor_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    external_advisor_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>% Gerente Legal</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.legal_manager_percent !== undefined ? formData.legal_manager_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    legal_manager_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>% Coordinador Postventa</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.post_sale_coordinator_percent !== undefined ? formData.post_sale_coordinator_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                    post_sale_coordinator_percent: val === '' ? undefined : parseFloat(val) 
                  });
                }}
                placeholder="0.00"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar Configuración
          </Button>
        </CardContent>
      </Card>

      {configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Configuraciones Existentes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Desarrollo</TableHead>
                  <TableHead>% Venta</TableHead>
                  <TableHead>% Postventa</TableHead>
                  <TableHead>Pool Venta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>{config.desarrollo}</TableCell>
                    <TableCell>{config.phase_sale_percent}%</TableCell>
                    <TableCell>{config.phase_post_sale_percent}%</TableCell>
                    <TableCell>{config.sale_pool_total_percent}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================
// COMPONENTE: Pestaña de Ventas Comisionables
// =====================================================

function SalesTab({
  sales,
  selectedDesarrollo,
  onDesarrolloChange,
  onRefresh,
  loading,
  availableDevelopments,
}: {
  sales: CommissionSale[];
  selectedDesarrollo: string;
  onDesarrolloChange: (desarrollo: string) => void;
  onRefresh: () => void;
  loading: boolean;
  availableDevelopments: string[];
}) {
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const handleSync = async () => {
    setSyncing(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/sync-sales', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Procesamiento completado',
          description: data.data.message || `${data.data.processed} ventas procesadas`,
        });
        onRefresh(); // Recargar ventas
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al procesar ventas',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error procesando ventas:', error);
      toast({
        title: 'Error',
        description: 'Error al procesar ventas desde la base de datos',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ventas Comisionables</CardTitle>
              <CardDescription>
                Deals cerrados-ganados que generan comisión. Procesa los deals desde la base de datos local.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedDesarrollo} onValueChange={onDesarrolloChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todos los desarrollos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los desarrollos</SelectItem>
                  {availableDevelopments.map((dev) => (
                    <SelectItem key={dev} value={dev}>
                      {dev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleSync} 
                variant="default"
                disabled={syncing}
              >
                {syncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Cargar Ventas desde BD
                  </>
                )}
              </Button>
              <Button onClick={onRefresh} variant="outline">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Desarrollo</TableHead>
                <TableHead>Propietario</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>m²</TableHead>
                <TableHead>Precio/m²</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead>Fecha Firma</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    <div className="py-8 space-y-2">
                      <p>No hay ventas comisionables</p>
                      <p className="text-sm">Haz clic en "Cargar Ventas desde BD" para procesar los deals cerrados-ganados de la base de datos local</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>{sale.cliente_nombre}</TableCell>
                    <TableCell>{sale.desarrollo}</TableCell>
                    <TableCell>{sale.propietario_deal}</TableCell>
                    <TableCell>{sale.producto || '-'}</TableCell>
                    <TableCell>
                      {sale.metros_cuadrados.toLocaleString('es-MX', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}
                    </TableCell>
                    <TableCell>
                      ${Number(sale.precio_por_m2).toLocaleString('es-MX', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}
                    </TableCell>
                    <TableCell>
                      ${Number(sale.valor_total).toLocaleString('es-MX', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}
                    </TableCell>
                    <TableCell>{new Date(sale.fecha_firma).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {sale.commission_calculated ? (
                        <Badge variant="default">Calculada</Badge>
                      ) : (
                        <Badge variant="outline">Pendiente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================
// COMPONENTE: Pestaña de Distribución
// =====================================================

function DistributionTab({
  sales,
  distributions,
  selectedDesarrollo,
  onDesarrolloChange,
  onRefresh,
  loading,
  availableDevelopments,
}: {
  sales: CommissionSale[];
  distributions: Record<number, CommissionDistribution[]>;
  selectedDesarrollo: string;
  onDesarrolloChange: (desarrollo: string) => void;
  onRefresh: () => void;
  loading: boolean;
  availableDevelopments: string[];
}) {
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [saleDistributions, setSaleDistributions] = useState<CommissionDistribution[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [loadingDistributions, setLoadingDistributions] = useState(false);
  const { toast } = useToast();

  // Filtrar ventas por desarrollo
  const filteredSales = selectedDesarrollo === 'all' 
    ? sales 
    : sales.filter(s => s.desarrollo === selectedDesarrollo);

  // Cargar distribuciones cuando se selecciona una venta
  useEffect(() => {
    if (selectedSaleId) {
      loadDistributions(selectedSaleId);
    } else {
      setSaleDistributions([]);
    }
  }, [selectedSaleId]);

  const loadDistributions = async (saleId: number) => {
    setLoadingDistributions(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/distributions?sale_id=${saleId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setSaleDistributions(data.data || []);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al cargar distribuciones',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error cargando distribuciones:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar distribuciones',
        variant: 'destructive',
      });
    } finally {
      setLoadingDistributions(false);
    }
  };

  const handleCalculate = async (saleId: number) => {
    setCalculating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/distributions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sale_id: saleId }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Comisiones calculadas',
          description: 'Las comisiones se han calculado correctamente',
        });
        await loadDistributions(saleId);
        onRefresh(); // Recargar ventas para actualizar estado
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al calcular comisiones',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error calculando comisiones:', error);
      toast({
        title: 'Error',
        description: 'Error al calcular comisiones',
        variant: 'destructive',
      });
    } finally {
      setCalculating(false);
    }
  };

  const selectedSale = filteredSales.find(s => s.id === selectedSaleId);

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Distribución de Comisiones</CardTitle>
              <CardDescription>
                Visualiza y gestiona la distribución de comisiones por venta
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedDesarrollo} onValueChange={onDesarrolloChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todos los desarrollos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los desarrollos</SelectItem>
                  {availableDevelopments.map((dev) => (
                    <SelectItem key={dev} value={dev}>
                      {dev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={onRefresh} variant="outline">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {/* Lista de ventas */}
            <div className="space-y-2">
              <h3 className="font-semibold">Ventas Comisionables</h3>
              <div className="border rounded-lg max-h-[600px] overflow-y-auto">
                {filteredSales.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No hay ventas disponibles
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredSales.map((sale) => (
                      <div
                        key={sale.id}
                        onClick={() => setSelectedSaleId(sale.id)}
                        className={`p-3 cursor-pointer hover:bg-muted transition-colors ${
                          selectedSaleId === sale.id ? 'bg-muted border-l-4 border-primary' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{sale.cliente_nombre}</p>
                            <p className="text-sm text-muted-foreground">
                              {sale.desarrollo} - {sale.producto || 'Sin producto'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ${Number(sale.valor_total).toLocaleString('es-MX', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                              })} - {new Date(sale.fecha_firma).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            {sale.commission_calculated ? (
                              <Badge variant="default">Calculada</Badge>
                            ) : (
                              <Badge variant="outline">Pendiente</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Distribuciones de la venta seleccionada */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Distribución de Comisiones</h3>
                {selectedSale && !selectedSale.commission_calculated && (
                  <Button
                    onClick={() => handleCalculate(selectedSale.id)}
                    disabled={calculating}
                    size="sm"
                  >
                    {calculating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Calculando...
                      </>
                    ) : (
                      <>
                        <Calculator className="mr-2 h-4 w-4" />
                        Calcular Comisiones
                      </>
                    )}
                  </Button>
                )}
              </div>
              {!selectedSale ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground">
                  Selecciona una venta para ver su distribución de comisiones
                </div>
              ) : (
                <div className="border rounded-lg">
                  {loadingDistributions ? (
                    <div className="p-8 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : saleDistributions.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      {selectedSale.commission_calculated 
                        ? 'No hay distribuciones disponibles'
                        : 'Haz clic en "Calcular Comisiones" para generar la distribución'}
                    </div>
                  ) : (
                    <div className="divide-y">
                      <div className="p-4 bg-muted/50">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Monto total de la Venta:</span>
                            <p className="font-semibold text-lg">
                              ${Number(selectedSale.valor_total).toLocaleString('es-MX', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                              })}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fase Venta:</span>
                            <p className="font-semibold text-lg text-blue-600">
                              ${Number(selectedSale.commission_sale_phase).toLocaleString('es-MX', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                              })}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fase Postventa:</span>
                            <p className="font-semibold text-lg text-green-600">
                              ${Number(selectedSale.commission_post_sale_phase).toLocaleString('es-MX', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rol</TableHead>
                            <TableHead>Persona</TableHead>
                            <TableHead>Fase</TableHead>
                            <TableHead>%</TableHead>
                            <TableHead>Monto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {saleDistributions.map((dist) => (
                            <TableRow key={dist.id}>
                              <TableCell>{dist.role_type}</TableCell>
                              <TableCell>{dist.person_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{dist.phase}</Badge>
                              </TableCell>
                              <TableCell>{dist.percent_assigned}%</TableCell>
                              <TableCell className="font-medium">
                                ${Number(dist.amount_calculated).toLocaleString('es-MX', { 
                                  minimumFractionDigits: 2, 
                                  maximumFractionDigits: 2 
                                })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================
// COMPONENTE: Pestaña de Dashboard
// =====================================================

function DashboardTab({
  developmentDashboard,
  generalDashboard,
  selectedDesarrollo,
  selectedYear,
  onDesarrolloChange,
  onYearChange,
  loading,
}: {
  developmentDashboard: CommissionDevelopmentDashboard | null;
  generalDashboard: CommissionGeneralDashboard | null;
  selectedDesarrollo: string;
  selectedYear: number;
  onDesarrolloChange: (desarrollo: string) => void;
  onYearChange: (year: number) => void;
  loading: boolean;
}) {
  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Dashboard de Comisiones</CardTitle>
              <CardDescription>
                {selectedDesarrollo !== 'all' ? `Vista por desarrollo: ${selectedDesarrollo}` : 'Vista general Capital Plus'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedDesarrollo} onValueChange={onDesarrolloChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todos los desarrollos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los desarrollos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedYear.toString()} onValueChange={(v) => onYearChange(parseInt(v, 10))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedDesarrollo !== 'all' && developmentDashboard ? (
            <div className="space-y-4">
              <div className="text-2xl font-bold">
                Total Anual: ${developmentDashboard.total_annual.toLocaleString('es-MX', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </div>
              {/* Aquí se pueden agregar gráficas y tablas detalladas */}
            </div>
          ) : generalDashboard ? (
            <div className="space-y-4">
              <div className="text-2xl font-bold">
                Facturación Total: ${generalDashboard.total_annual.facturacion_ventas.toLocaleString('es-MX', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </div>
              {/* Aquí se pueden agregar gráficas y tablas detalladas */}
            </div>
          ) : (
            <p className="text-muted-foreground">No hay datos disponibles</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

