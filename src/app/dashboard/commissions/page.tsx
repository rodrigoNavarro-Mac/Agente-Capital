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

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, Calculator, RefreshCw, Settings, ShoppingCart, PieChart, BarChart3, Plus, Edit, Trash2, CheckCircle2, Clock, Upload, Download, X, Eye } from 'lucide-react';
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
  CommissionRule,
  CommissionRuleInput,
  CommissionRuleOperator,
  CommissionRulePeriodType,
  CommissionBillingTarget,
  CommissionSalesTarget,
} from '@/types/commissions';
import { getRoleDisplayName, normalizePersonName } from '@/lib/commission-calculator';
import { logger } from '@/lib/logger';
import { normalizeDevelopmentDisplay } from '@/lib/utils';

export default function CommissionsPage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('config');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { toast } = useToast();

  // Datos
  const [configs, setConfigs] = useState<CommissionConfig[]>([]);
  const [globalConfigs, setGlobalConfigs] = useState<any[]>([]);
  const [sales, setSales] = useState<CommissionSale[]>([]);
  const [distributions, _setDistributions] = useState<Record<number, CommissionDistribution[]>>({});
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

  const loadConfigs = useCallback(async () => {
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
  }, []);

  const loadSales = useCallback(async () => {
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
      
      // Obtener desarrollos únicos de las ventas para el filtro (normalizados)
      const devs = new Set<string>();
      loadedSales.forEach((sale: CommissionSale) => {
        if (sale.desarrollo) {
          // Normalizar el nombre del desarrollo para mostrar
          const normalized = normalizeDevelopmentDisplay(sale.desarrollo);
          devs.add(normalized);
        }
      });
      setAvailableDevelopmentsForFilter(Array.from(devs).sort());
    }
  }, [selectedDesarrollo]);

  const loadDashboard = useCallback(async () => {
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
  }, [selectedDesarrollo, selectedYear]);

  const loadInitialData = useCallback(async () => {
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
        logger.error('Error loading data:', error);
        toast({
        title: 'Error',
        description: 'Error al cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast, loadConfigs, loadSales, loadDashboard]);

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

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
            configs={configs}
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
  const [_selectedConfig, setSelectedConfig] = useState<CommissionConfig | null>(null);
  const [formData, setFormData] = useState<Partial<CommissionConfigInput>>({});
  const [saving, setSaving] = useState(false);
  const [globalFormData, setGlobalFormData] = useState<{
    operations_coordinator_percent: number;
    marketing_percent: number;
    legal_manager_percent: number;
    post_sale_coordinator_percent: number;
  }>({
    operations_coordinator_percent: 0,
    marketing_percent: 0,
    legal_manager_percent: 0,
    post_sale_coordinator_percent: 0,
  });
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [availableDevelopments, setAvailableDevelopments] = useState<string[]>([]);
  const [loadingDevelopments, setLoadingDevelopments] = useState(false);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [ruleFormData, setRuleFormData] = useState<Partial<CommissionRuleInput>>({});
  const [savingRule, setSavingRule] = useState(false);
  const [_billingTargets, setBillingTargets] = useState<CommissionBillingTarget[]>([]);
  const [loadingBillingTargets, setLoadingBillingTargets] = useState(false);
  const [billingTargetYear, setBillingTargetYear] = useState<number>(new Date().getFullYear());
  const [billingTargetFormData, setBillingTargetFormData] = useState<Record<number, string>>({});
  const [savingBillingTarget, setSavingBillingTarget] = useState(false);
  
  // Estados para metas de ventas
  const [_salesTargets, setSalesTargets] = useState<CommissionSalesTarget[]>([]);
  const [loadingSalesTargets, setLoadingSalesTargets] = useState(false);
  const [salesTargetYear, setSalesTargetYear] = useState<number>(new Date().getFullYear());
  const [salesTargetFormData, setSalesTargetFormData] = useState<Record<number, string>>({});
  const [savingSalesTarget, setSavingSalesTarget] = useState(false);

  // Funciones helper para formatear números con comas (usar useCallback para evitar recrearlas)
  const formatNumberWithCommas = useCallback((value: number | string): string => {
    if (value === undefined || value === null || value === '') return '';
    // Remover comas existentes y convertir a número
    const numValue = typeof value === 'string' 
      ? parseFloat(value.replace(/,/g, '')) 
      : value;
    if (isNaN(numValue)) return '';
    // Formatear con comas cada 3 dígitos y mantener decimales
    return numValue.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const parseFormattedNumber = useCallback((formattedValue: string): number => {
    if (!formattedValue || formattedValue === '') return 0;
    // Remover comas y convertir a número
    const cleaned = formattedValue.replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }, []);

  // Función para manejar el cambio de input - permite escribir sin formato, formatea al perder foco
  const handleBillingTargetChange = (month: number, inputValue: string) => {
    // Permitir borrar completamente
    if (inputValue === '') {
      setBillingTargetFormData({
        ...billingTargetFormData,
        [month]: '',
      });
      return;
    }
    
    // Remover solo comas (para permitir reescritura), pero mantener números y punto decimal
    let cleaned = inputValue.replace(/,/g, '');
    
    // Validar que solo contenga números y un punto decimal
    if (!/^\d*\.?\d*$/.test(cleaned)) {
      // Si no es válido, mantener el valor anterior
      return;
    }
    
    // Permitir solo un punto decimal
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limitar a 2 decimales
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + '.' + parts[1].substring(0, 2);
    }
    
    // Guardar el valor sin formato mientras se escribe
    setBillingTargetFormData({
      ...billingTargetFormData,
      [month]: cleaned,
    });
  };

  // Función para manejar el cambio de input de metas de ventas
  const handleSalesTargetChange = (month: number, inputValue: string) => {
    // Permitir borrar completamente
    if (inputValue === '') {
      setSalesTargetFormData({
        ...salesTargetFormData,
        [month]: '',
      });
      return;
    }
    
    // Remover solo comas (para permitir reescritura), pero mantener números y punto decimal
    let cleaned = inputValue.replace(/,/g, '');
    
    // Validar que solo contenga números y un punto decimal
    if (!/^\d*\.?\d*$/.test(cleaned)) {
      // Si no es válido, mantener el valor anterior
      return;
    }
    
    // Permitir solo un punto decimal
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limitar a 2 decimales
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + '.' + parts[1].substring(0, 2);
    }
    
    // Guardar el valor sin formato mientras se escribe
    setSalesTargetFormData({
      ...salesTargetFormData,
      [month]: cleaned,
    });
  };
  const { toast } = useToast();

  // Cargar valores globales cuando se cargan los datos
  useEffect(() => {
    if (globalConfigs && globalConfigs.length > 0) {
      const operations = globalConfigs.find(c => c.config_key === 'operations_coordinator_percent');
      const marketing = globalConfigs.find(c => c.config_key === 'marketing_percent');
      const legal = globalConfigs.find(c => c.config_key === 'legal_manager_percent');
      const postSale = globalConfigs.find(c => c.config_key === 'post_sale_coordinator_percent');
      setGlobalFormData({
        operations_coordinator_percent: operations?.config_value || 0,
        marketing_percent: marketing?.config_value || 0,
        legal_manager_percent: legal?.config_value || 0,
        post_sale_coordinator_percent: postSale?.config_value || 0,
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
          // Normalizar el nombre del desarrollo para mostrar
          const normalized = normalizeDevelopmentDisplay(dev.value);
          allDevelopments.add(normalized);
        });
      });
      
      // También agregar desarrollos de configuraciones existentes (por si hay alguno nuevo)
      configs.forEach((config) => {
        if (config.desarrollo) {
          // Normalizar también los desarrollos de las configuraciones
          const normalized = normalizeDevelopmentDisplay(config.desarrollo);
          allDevelopments.add(normalized);
        }
      });

      // Ordenar alfabéticamente
      setAvailableDevelopments(Array.from(allDevelopments).sort());
    } catch (error) {
      logger.error('Error loading developments:', error);
      // En caso de error, usar desarrollos de configuraciones existentes (normalizados)
      const existingDevs = configs
        .map(c => c.desarrollo)
        .filter(d => d)
        .map(d => normalizeDevelopmentDisplay(d));
      setAvailableDevelopments(Array.from(new Set(existingDevs)).sort());
    } finally {
      setLoadingDevelopments(false);
    }
  }, [configs]);

  // Cargar configuración existente cuando se selecciona un desarrollo
  useEffect(() => {
    if (formData.desarrollo) {
      // Normalizar el desarrollo seleccionado para comparar
      const normalizedSelected = normalizeDevelopmentDisplay(formData.desarrollo);
      
      // Buscar si existe configuración para este desarrollo (comparación case-insensitive y normalizada)
      const existingConfig = configs.find((config) => {
        if (!config.desarrollo) return false;
        const normalizedConfig = normalizeDevelopmentDisplay(config.desarrollo);
        return normalizedConfig.toLowerCase() === normalizedSelected.toLowerCase();
      });
      
      if (existingConfig) {
        // Cargar todos los valores de la configuración existente
        // Usar el nombre normalizado del desarrollo
        setFormData({
          desarrollo: normalizeDevelopmentDisplay(existingConfig.desarrollo),
          phase_sale_percent: existingConfig.phase_sale_percent,
          phase_post_sale_percent: existingConfig.phase_post_sale_percent,
          sale_manager_percent: existingConfig.sale_manager_percent,
          deal_owner_percent: existingConfig.deal_owner_percent,
          external_advisor_percent: existingConfig.external_advisor_percent,
          pool_enabled: existingConfig.pool_enabled || false,
          sale_pool_total_percent: existingConfig.sale_pool_total_percent,
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
          sale_manager_percent: undefined,
          deal_owner_percent: undefined,
          external_advisor_percent: undefined,
          pool_enabled: false,
          sale_pool_total_percent: undefined,
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

  const loadRules = useCallback(async () => {
    if (!formData.desarrollo) return;
    
    setLoadingRules(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = `?desarrollo=${encodeURIComponent(formData.desarrollo)}`;
      const response = await fetch(`/api/commissions/rules${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setRules(data.data || []);
      }
    } catch (error) {
      logger.error('Error loading rules:', error);
    } finally {
      setLoadingRules(false);
    }
  }, [formData.desarrollo]);

  // Cargar reglas cuando se selecciona un desarrollo
  useEffect(() => {
    if (formData.desarrollo) {
      loadRules();
    } else {
      setRules([]);
    }
  }, [formData.desarrollo, loadRules]);

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
    // Normalizar el desarrollo antes de guardarlo
    const dataToSend: CommissionConfigInput = {
      desarrollo: normalizeDevelopmentDisplay(formData.desarrollo),
      phase_sale_percent: formData.phase_sale_percent ?? 0,
      phase_post_sale_percent: formData.phase_post_sale_percent ?? 0,
      sale_manager_percent: formData.sale_manager_percent ?? 0,
      deal_owner_percent: formData.deal_owner_percent ?? 0,
      external_advisor_percent: formData.external_advisor_percent ?? null,
      pool_enabled: formData.pool_enabled ?? false,
      sale_pool_total_percent: formData.sale_pool_total_percent ?? 0,
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
        logger.error('Validation errors:', data.details || data.error);
      }
    } catch (error) {
      logger.error('Error saving configuration:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la configuración',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGlobal = async (configKey: 'operations_coordinator_percent' | 'marketing_percent' | 'legal_manager_percent' | 'post_sale_coordinator_percent') => {
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
        const configNames: Record<string, string> = {
          'operations_coordinator_percent': 'Coordinador de Operaciones de Venta',
          'marketing_percent': 'Gerente de Marketing',
          'legal_manager_percent': 'Gerente Legal',
          'post_sale_coordinator_percent': 'Coordinador Postventas',
        };
        toast({
          title: 'Éxito',
          description: `Configuración global de ${configNames[configKey] || configKey} guardada correctamente`,
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
      logger.error('Error saving global configuration:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la configuración global',
        variant: 'destructive',
      });
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSaveRule = async () => {
    if (!ruleFormData.desarrollo || !ruleFormData.rule_name || !ruleFormData.periodo_type || 
        !ruleFormData.periodo_value || !ruleFormData.operador || !ruleFormData.unidades_vendidas || 
        ruleFormData.porcentaje_comision === undefined) {
      toast({
        title: 'Error',
        description: 'Todos los campos son requeridos',
        variant: 'destructive',
      });
      return;
    }

    setSavingRule(true);
    try {
      const token = localStorage.getItem('accessToken');
      const url = '/api/commissions/rules';
      const method = editingRule ? 'PUT' : 'POST';
      const body = editingRule
        ? { id: editingRule.id, ...ruleFormData }
        : ruleFormData;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Éxito',
          description: editingRule ? 'Regla actualizada correctamente' : 'Regla creada correctamente',
        });
        setShowRuleForm(false);
        setEditingRule(null);
        setRuleFormData({});
        await loadRules();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al guardar la regla',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error saving rule:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la regla',
        variant: 'destructive',
      });
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta regla?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/rules?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Éxito',
          description: 'Regla eliminada correctamente',
        });
        await loadRules();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al eliminar la regla',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error deleting rule:', error);
      toast({
        title: 'Error',
        description: 'Error al eliminar la regla',
        variant: 'destructive',
      });
    }
  };

  const handleEditRule = (rule: CommissionRule) => {
    setEditingRule(rule);
    setRuleFormData({
      desarrollo: rule.desarrollo,
      rule_name: rule.rule_name,
      periodo_type: rule.periodo_type,
      periodo_value: rule.periodo_value,
      operador: rule.operador,
      unidades_vendidas: rule.unidades_vendidas,
      porcentaje_comision: rule.porcentaje_comision,
      porcentaje_iva: rule.porcentaje_iva,
      activo: rule.activo,
      prioridad: rule.prioridad,
    });
    setShowRuleForm(true);
  };

  // Funciones para metas de facturación
  const loadBillingTargets = useCallback(async () => {
    setLoadingBillingTargets(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/billing-targets?year=${billingTargetYear}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        const targets = data.data || [];
        setBillingTargets(targets);
        // Inicializar formulario con valores existentes (formateados con comas)
        const formData: Record<number, string> = {};
        targets.forEach((target: CommissionBillingTarget) => {
          formData[target.month] = formatNumberWithCommas(target.target_amount);
        });
        setBillingTargetFormData(formData);
      }
    } catch (error) {
      logger.error('Error loading billing targets:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar las metas de comisión',
        variant: 'destructive',
      });
    } finally {
      setLoadingBillingTargets(false);
    }
  }, [billingTargetYear, toast, formatNumberWithCommas]);

  useEffect(() => {
    loadBillingTargets();
  }, [loadBillingTargets]);

  const handleSaveBillingTarget = async (month: number) => {
    const formattedValue = billingTargetFormData[month];
    if (formattedValue === undefined || formattedValue === '') {
      toast({
        title: 'Error',
        description: 'El monto objetivo no puede estar vacío',
        variant: 'destructive',
      });
      return;
    }
    // Parsear el valor formateado a número
    const targetAmount = parseFormattedNumber(formattedValue);
    if (targetAmount < 0) {
      toast({
        title: 'Error',
        description: 'El monto objetivo debe ser mayor o igual a 0',
        variant: 'destructive',
      });
      return;
    }

    setSavingBillingTarget(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/billing-targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: billingTargetYear,
          month,
          target_amount: targetAmount,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Éxito',
          description: 'Meta de comisión guardada correctamente',
        });
        await loadBillingTargets();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al guardar la meta de comisión',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error saving billing target:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la meta de comisión',
        variant: 'destructive',
      });
    } finally {
      setSavingBillingTarget(false);
    }
  };

  // Funciones para metas de ventas
  const loadSalesTargets = useCallback(async () => {
    setLoadingSalesTargets(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/sales-targets?year=${salesTargetYear}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        const targets = data.data || [];
        setSalesTargets(targets);
        // Inicializar formulario con valores existentes (formateados con comas)
        const formData: Record<number, string> = {};
        targets.forEach((target: CommissionSalesTarget) => {
          formData[target.month] = formatNumberWithCommas(target.target_amount);
        });
        setSalesTargetFormData(formData);
      }
    } catch (error) {
      logger.error('Error loading sales targets:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar las metas de ventas',
        variant: 'destructive',
      });
    } finally {
      setLoadingSalesTargets(false);
    }
  }, [salesTargetYear, toast, formatNumberWithCommas]);

  useEffect(() => {
    loadSalesTargets();
  }, [loadSalesTargets]);

  const handleSaveSalesTarget = async (month: number) => {
    const formattedValue = salesTargetFormData[month];
    if (formattedValue === undefined || formattedValue === '') {
      toast({
        title: 'Error',
        description: 'El monto objetivo no puede estar vacío',
        variant: 'destructive',
      });
      return;
    }
    // Parsear el valor formateado a número
    const targetAmount = parseFormattedNumber(formattedValue);
    if (targetAmount < 0) {
      toast({
        title: 'Error',
        description: 'El monto objetivo debe ser mayor o igual a 0',
        variant: 'destructive',
      });
      return;
    }

    setSavingSalesTarget(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/sales-targets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: salesTargetYear,
          month,
          target_amount: targetAmount,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Éxito',
          description: 'Meta de ventas guardada correctamente',
        });
        await loadSalesTargets();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al guardar la meta de ventas',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error saving sales target:', error);
      toast({
        title: 'Error',
        description: 'Error al guardar la meta de ventas',
        variant: 'destructive',
      });
    } finally {
      setSavingSalesTarget(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Configuración por Desarrollo - Separada por Fases */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración por Desarrollo</CardTitle>
          <CardDescription>
            Configura los porcentajes de comisión para cada desarrollo. El cálculo se realiza sobre el monto total de la venta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Selector de Desarrollo y Porcentajes de Fase (Guía) */}
          <div className="grid grid-cols-3 gap-4 border-b pb-4">
            <div>
              <Label>Desarrollo</Label>
              {loadingDevelopments ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Cargando...</span>
                </div>
              ) : (
                <Select
                  value={formData.desarrollo || ''}
                  onValueChange={(value) => {
                    // Normalizar el desarrollo al seleccionarlo
                    const normalized = normalizeDevelopmentDisplay(value);
                    setFormData({ ...formData, desarrollo: normalized });
                  }}
                >
                  <SelectTrigger className="mt-2">
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
              <Label>% Fase Venta (Guía)</Label>
              <Input
                type="number"
                step="0.001"
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
                placeholder="0.000"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Solo como referencia</p>
            </div>
            <div>
              <Label>% Fase Postventa (Guía)</Label>
              <Input
                type="number"
                step="0.001"
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
                placeholder="0.000"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Solo como referencia</p>
            </div>
          </div>

          {/* Fase Venta */}
          <div className="space-y-4 border-l-4 border-blue-500 pl-4">
            <h3 className="text-lg font-semibold text-blue-600">Fase Venta</h3>
            <div className="grid grid-cols-2 gap-4">
            <div>
                <Label>% Gerente de Ventas del Desarrollo</Label>
              <Input
                type="number"
                  step="0.001"
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
                  placeholder="0.000"
                  className="mt-2"
              />
            </div>
            <div>
                <Label>% Asesor Interno (Propietario del Lead)</Label>
              <Input
                type="number"
                  step="0.001"
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
                  placeholder="0.000"
                  className="mt-2"
              />
            </div>
            <div>
                <Label>% Asesor Externo (Opcional)</Label>
              <Input
                type="number"
                  step="0.001"
                min="0"
                max="100"
                  value={formData.external_advisor_percent !== undefined && formData.external_advisor_percent !== null ? formData.external_advisor_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                      external_advisor_percent: val === '' ? null : parseFloat(val) 
                  });
                }}
                  placeholder="0.000"
                  className="mt-2"
              />
            </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="pool_enabled"
                    checked={formData.pool_enabled || false}
                    onChange={(e) => setFormData({ ...formData, pool_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="pool_enabled" className="cursor-pointer">
                    Pool (Opcional - Solo si cumplen reglas)
                  </Label>
                </div>
                {formData.pool_enabled && (
              <Input
                type="number"
                    step="0.001"
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
                    placeholder="% Pool Total"
              />
                )}
                <p className="text-xs text-muted-foreground">
                  Solo para gerente de ventas y asesores internos/externos
                </p>
            </div>
            </div>
          </div>

          {/* Fase Postventa */}
          <div className="space-y-4 border-l-4 border-green-500 pl-4">
            <h3 className="text-lg font-semibold text-green-600">Fase Postventa</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Los roles base (Gerente Legal y Coordinador Postventas) se configuran globalmente. Ver sección &quot;Configuración Global&quot;.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="customer_service_enabled"
                    checked={formData.customer_service_enabled || false}
                    onChange={(e) => setFormData({ ...formData, customer_service_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="customer_service_enabled" className="cursor-pointer">
                    Atención a Clientes (Opcional)
                  </Label>
                </div>
                {formData.customer_service_enabled && (
              <Input
                type="number"
                    step="0.001"
                min="0"
                max="100"
                    value={formData.customer_service_percent !== undefined && formData.customer_service_percent !== null ? formData.customer_service_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                        customer_service_percent: val === '' ? null : parseFloat(val) 
                  });
                }}
                    placeholder="0.000"
              />
                )}
            </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="deliveries_enabled"
                    checked={formData.deliveries_enabled || false}
                    onChange={(e) => setFormData({ ...formData, deliveries_enabled: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="deliveries_enabled" className="cursor-pointer">
                    Entregas (Opcional)
                  </Label>
                </div>
                {formData.deliveries_enabled && (
              <Input
                type="number"
                    step="0.001"
                min="0"
                max="100"
                    value={formData.deliveries_percent !== undefined && formData.deliveries_percent !== null ? formData.deliveries_percent : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ 
                    ...formData, 
                        deliveries_percent: val === '' ? null : parseFloat(val) 
                  });
                }}
                    placeholder="0.000"
              />
                )}
            </div>
          </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
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
                    <TableCell>{normalizeDevelopmentDisplay(config.desarrollo || '')}</TableCell>
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

      {/* Reglas de Comisión por Desarrollo */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reglas de Comisión por Desarrollo</CardTitle>
              <CardDescription>
                Crea reglas de comisión basadas en período, unidades vendidas y porcentajes
              </CardDescription>
            </div>
            {formData.desarrollo && (
              <Button
                onClick={() => {
                  const currentYear = new Date().getFullYear();
                  const currentMonth = new Date().getMonth() + 1;
                  
                  setRuleFormData({
                    desarrollo: formData.desarrollo,
                    periodo_type: 'mensual',
                    periodo_value: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
                    operador: '=',
                    unidades_vendidas: 1,
                    porcentaje_comision: 0,
                    porcentaje_iva: 0,
                    activo: true,
                    prioridad: 0,
                  });
                  setEditingRule(null);
                  setShowRuleForm(true);
                }}
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nueva Regla
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!formData.desarrollo ? (
            <p className="text-muted-foreground text-center py-4">
              Selecciona un desarrollo para crear o ver reglas de comisión
            </p>
          ) : (
            <>
              {showRuleForm && (
                <Card className="mb-4 border-primary">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {editingRule ? 'Editar Regla' : 'Nueva Regla'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nombre de la Regla</Label>
                        <Input
                          value={ruleFormData.rule_name || ''}
                          onChange={(e) => setRuleFormData({ ...ruleFormData, rule_name: e.target.value })}
                          placeholder="Ej: Regla Q1 2025 - 10+ unidades"
                        />
                      </div>
                      <div>
                        <Label>Desarrollo</Label>
                        <Input value={ruleFormData.desarrollo || ''} disabled />
                      </div>
                      <div>
                        <Label>Tipo de Período</Label>
                        <Select
                          value={ruleFormData.periodo_type || 'mensual'}
                          onValueChange={(value) => {
                            const periodoType = value as CommissionRulePeriodType;
                            let periodoValue = '';
                            const currentYear = new Date().getFullYear();
                            
                            // Generar valor por defecto según el tipo
                            // IMPORTANTE: Para trimestres, periodo_value es solo el año (ej: "2025")
                            // La regla se aplica a todos los trimestres de ese año
                            if (periodoType === 'anual') {
                              periodoValue = currentYear.toString();
                            } else if (periodoType === 'mensual') {
                              const currentMonth = new Date().getMonth() + 1;
                              periodoValue = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
                            } else if (periodoType === 'trimestre') {
                              // Para trimestres, solo el año (la regla se aplica a todos los trimestres)
                              periodoValue = currentYear.toString();
                            }
                            
                            setRuleFormData({ ...ruleFormData, periodo_type: periodoType, periodo_value: periodoValue });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trimestre">Trimestre</SelectItem>
                            <SelectItem value="mensual">Mensual</SelectItem>
                            <SelectItem value="anual">Anual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>
                          Período
                          {ruleFormData.periodo_type === 'trimestre' && ' (Ej: 2025-Q1)'}
                          {ruleFormData.periodo_type === 'mensual' && ' (Ej: 2025-01)'}
                          {ruleFormData.periodo_type === 'anual' && ' (Ej: 2025)'}
                        </Label>
                        <Input
                          value={ruleFormData.periodo_value || ''}
                          onChange={(e) => setRuleFormData({ ...ruleFormData, periodo_value: e.target.value })}
                          placeholder={
                            ruleFormData.periodo_type === 'trimestre' ? '2025-Q1' :
                            ruleFormData.periodo_type === 'mensual' ? '2025-01' :
                            '2025'
                          }
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {ruleFormData.periodo_type === 'trimestre' && 'Formato: YYYY-QN (ej: 2025-Q1, 2025-Q2, 2025-Q3, 2025-Q4)'}
                          {ruleFormData.periodo_type === 'mensual' && 'Formato: YYYY-MM (ej: 2025-01, 2025-02, ..., 2025-12)'}
                          {ruleFormData.periodo_type === 'anual' && 'Formato: YYYY (ej: 2025, 2026)'}
                        </p>
                      </div>
                      <div>
                        <Label>Operador</Label>
                        <Select
                          value={ruleFormData.operador || '='}
                          onValueChange={(value) => setRuleFormData({ ...ruleFormData, operador: value as CommissionRuleOperator })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="=">= (Igual)</SelectItem>
                            <SelectItem value=">=">≥ (Mayor o igual)</SelectItem>
                            <SelectItem value="<=">≤ (Menor o igual)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Unidades Vendidas (Producto)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={ruleFormData.unidades_vendidas || ''}
                          onChange={(e) => setRuleFormData({ ...ruleFormData, unidades_vendidas: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div>
                        <Label>% Comisión</Label>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          max="100"
                          value={ruleFormData.porcentaje_comision !== undefined ? ruleFormData.porcentaje_comision : ''}
                          onChange={(e) => setRuleFormData({ ...ruleFormData, porcentaje_comision: parseFloat(e.target.value) || 0 })}
                          placeholder="0.000"
                        />
                      </div>
                      <div>
                        <Label>% IVA</Label>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          max="100"
                          value={ruleFormData.porcentaje_iva !== undefined ? ruleFormData.porcentaje_iva : ''}
                          onChange={(e) => setRuleFormData({ ...ruleFormData, porcentaje_iva: parseFloat(e.target.value) || 0 })}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label>Prioridad</Label>
                        <Input
                          type="number"
                          min="0"
                          value={ruleFormData.prioridad !== undefined ? ruleFormData.prioridad : ''}
                          onChange={(e) => setRuleFormData({ ...ruleFormData, prioridad: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Nota: Todas las reglas aplicables se respetan. La prioridad solo afecta el orden de visualización.
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 pt-6">
                        <input
                          type="checkbox"
                          id="activo"
                          checked={ruleFormData.activo !== undefined ? ruleFormData.activo : true}
                          onChange={(e) => setRuleFormData({ ...ruleFormData, activo: e.target.checked })}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="activo" className="cursor-pointer">
                          Activa
                        </Label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveRule} disabled={savingRule}>
                        {savingRule ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Guardar Regla
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowRuleForm(false);
                          setEditingRule(null);
                          setRuleFormData({});
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {loadingRules ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : rules.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No hay reglas configuradas para este desarrollo
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Unidades</TableHead>
                      <TableHead>% Comisión</TableHead>
                      <TableHead>% IVA</TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.rule_name}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">
                              {rule.periodo_type === 'trimestre' && `Trimestre ${rule.periodo_value}`}
                              {rule.periodo_type === 'mensual' && `Mes ${rule.periodo_value}`}
                              {rule.periodo_type === 'anual' && `Año ${rule.periodo_value}`}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {rule.periodo_value}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {rule.operador === '=' ? '=' : rule.operador === '>=' ? '≥' : '≤'}
                          </Badge>
                        </TableCell>
                        <TableCell>{rule.unidades_vendidas}</TableCell>
                        <TableCell>{rule.porcentaje_comision}%</TableCell>
                        <TableCell>{rule.porcentaje_iva}%</TableCell>
                        <TableCell>{rule.prioridad}</TableCell>
                        <TableCell>
                          {rule.activo ? (
                            <Badge variant="default">Activa</Badge>
                          ) : (
                            <Badge variant="outline">Inactiva</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditRule(rule)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Metas de Comisión */}
      <Card>
        <CardHeader>
          <CardTitle>Metas de Comisión</CardTitle>
          <CardDescription>
            Configura las metas de comisión mensuales para el dashboard. Estas metas se utilizan para calcular el porcentaje de cumplimiento. El monto se calcula como la suma de la fase de ventas y fase de postventa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label>Año:</Label>
            <Select
              value={billingTargetYear.toString()}
              onValueChange={(value) => setBillingTargetYear(parseInt(value, 10))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => loadBillingTargets()}
              disabled={loadingBillingTargets}
            >
              {loadingBillingTargets ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { month: 1, name: 'Enero' },
              { month: 2, name: 'Febrero' },
              { month: 3, name: 'Marzo' },
              { month: 4, name: 'Abril' },
              { month: 5, name: 'Mayo' },
              { month: 6, name: 'Junio' },
              { month: 7, name: 'Julio' },
              { month: 8, name: 'Agosto' },
              { month: 9, name: 'Septiembre' },
              { month: 10, name: 'Octubre' },
              { month: 11, name: 'Noviembre' },
              { month: 12, name: 'Diciembre' },
            ].map(({ month, name }) => (
              <div key={month} className="space-y-2">
                <Label>{name}</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={billingTargetFormData[month] !== undefined ? billingTargetFormData[month] : ''}
                    onChange={(e) => handleBillingTargetChange(month, e.target.value)}
                    onBlur={(e) => {
                      // Al perder el foco, formatear el valor con comas
                      const inputValue = e.target.value;
                      if (inputValue === '') {
                        return;
                      }
                      const parsed = parseFormattedNumber(inputValue);
                      if (parsed > 0) {
                        setBillingTargetFormData({
                          ...billingTargetFormData,
                          [month]: formatNumberWithCommas(parsed),
                        });
                      } else {
                        // Si no es un número válido, limpiar
                        setBillingTargetFormData({
                          ...billingTargetFormData,
                          [month]: '',
                        });
                      }
                    }}
                    placeholder="0.00"
                    className="text-right"
                  />
                  <Button
                    onClick={() => handleSaveBillingTarget(month)}
                    disabled={savingBillingTarget}
                    variant="outline"
                    size="sm"
                  >
                    {savingBillingTarget ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Metas de Ventas */}
      <Card>
        <CardHeader>
          <CardTitle>Metas de Ventas</CardTitle>
          <CardDescription>
            Configura las metas de ventas mensuales para el dashboard. Estas metas se utilizan para calcular el porcentaje de cumplimiento. El monto se calcula usando el valor total de la venta sin IVA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label>Año:</Label>
            <Select
              value={salesTargetYear.toString()}
              onValueChange={(value) => setSalesTargetYear(parseInt(value, 10))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - 2 + i;
                  return (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => loadSalesTargets()}
              disabled={loadingSalesTargets}
            >
              {loadingSalesTargets ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Actualizar
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { month: 1, name: 'Enero' },
              { month: 2, name: 'Febrero' },
              { month: 3, name: 'Marzo' },
              { month: 4, name: 'Abril' },
              { month: 5, name: 'Mayo' },
              { month: 6, name: 'Junio' },
              { month: 7, name: 'Julio' },
              { month: 8, name: 'Agosto' },
              { month: 9, name: 'Septiembre' },
              { month: 10, name: 'Octubre' },
              { month: 11, name: 'Noviembre' },
              { month: 12, name: 'Diciembre' },
            ].map(({ month, name }) => (
              <div key={month} className="space-y-2">
                <Label>{name}</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={salesTargetFormData[month] !== undefined ? salesTargetFormData[month] : ''}
                    onChange={(e) => handleSalesTargetChange(month, e.target.value)}
                    onBlur={(e) => {
                      // Al perder el foco, formatear el valor con comas
                      const inputValue = e.target.value;
                      if (inputValue === '') {
                        return;
                      }
                      const parsed = parseFormattedNumber(inputValue);
                      if (parsed > 0) {
                        setSalesTargetFormData({
                          ...salesTargetFormData,
                          [month]: formatNumberWithCommas(parsed),
                        });
                      } else {
                        // Si no es un número válido, limpiar
                        setSalesTargetFormData({
                          ...salesTargetFormData,
                          [month]: '',
                        });
                      }
                    }}
                    placeholder="0.00"
                    className="text-right"
                  />
                  <Button
                    onClick={() => handleSaveSalesTarget(month)}
                    disabled={savingSalesTarget}
                    variant="outline"
                    size="sm"
                  >
                    {savingSalesTarget ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Configuración Global - Separada por Fases */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración Global</CardTitle>
          <CardDescription>
            Estos porcentajes se aplican a todos los desarrollos. Separados por fase de venta y fase postventa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Fase Venta */}
          <div className="space-y-4 border-l-4 border-blue-500 pl-4">
            <h3 className="text-lg font-semibold text-blue-600">Fase Venta</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label>% Coordinador de Operaciones de Venta</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                    step="0.001"
                  min="0"
                  max="100"
                  value={globalFormData.operations_coordinator_percent}
                  onChange={(e) => setGlobalFormData({
                    ...globalFormData,
                    operations_coordinator_percent: parseFloat(e.target.value) || 0,
                  })}
                    placeholder="0.000"
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
            </div>
            <div className="space-y-2">
                <Label>% Gerente de Marketing</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                    step="0.001"
                  min="0"
                  max="100"
                  value={globalFormData.marketing_percent}
                  onChange={(e) => setGlobalFormData({
                    ...globalFormData,
                    marketing_percent: parseFloat(e.target.value) || 0,
                  })}
                    placeholder="0.000"
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
              </div>
            </div>
          </div>

          {/* Fase Postventa */}
          <div className="space-y-4 border-l-4 border-green-500 pl-4">
            <h3 className="text-lg font-semibold text-green-600">Fase Postventa</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>% Gerente Legal</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={globalFormData.legal_manager_percent}
                    onChange={(e) => setGlobalFormData({
                      ...globalFormData,
                      legal_manager_percent: parseFloat(e.target.value) || 0,
                    })}
                    placeholder="0.000"
                  />
                  <Button
                    onClick={() => handleSaveGlobal('legal_manager_percent')}
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
              </div>
              <div className="space-y-2">
                <Label>% Coordinador Postventas</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={globalFormData.post_sale_coordinator_percent}
                    onChange={(e) => setGlobalFormData({
                      ...globalFormData,
                      post_sale_coordinator_percent: parseFloat(e.target.value) || 0,
                    })}
                    placeholder="0.000"
                  />
                  <Button
                    onClick={() => handleSaveGlobal('post_sale_coordinator_percent')}
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
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
  const [partnersMap, setPartnersMap] = useState<Record<number, Array<{ socio: string; participacion: number }>>>({});
  const [loadingPartners, setLoadingPartners] = useState<Record<number, boolean>>({});
  const { toast } = useToast();

  // Cargar socios del producto para múltiples ventas en batch (optimización)
  const loadPartnersBatch = useCallback(async (saleIds: number[]) => {
    if (saleIds.length === 0) return;

    // Marcar todas las ventas como cargando
    setLoadingPartners(prev => {
      const newState = { ...prev };
      saleIds.forEach(id => {
        newState[id] = true;
      });
      return newState;
    });

    try {
      const token = localStorage.getItem('accessToken');
      const saleIdsJson = JSON.stringify(saleIds);
      const response = await fetch(`/api/commissions/product-partners?sale_ids=${encodeURIComponent(saleIdsJson)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        // data.data es un objeto con sale_id como clave
        setPartnersMap(prev => {
          const newState = { ...prev };
          // Agregar los socios cargados
          Object.entries(data.data || {}).forEach(([saleIdStr, partners]: [string, any]) => {
            const saleIdNum = parseInt(saleIdStr, 10);
            newState[saleIdNum] = partners || [];
          });
          // Para las ventas que no tienen socios, guardar array vacío
          saleIds.forEach(id => {
            if (newState[id] === undefined) {
              newState[id] = [];
            }
          });
          return newState;
        });
      } else {
        // En caso de error, guardar arrays vacíos para todas las ventas
        setPartnersMap(prev => {
          const newState = { ...prev };
          saleIds.forEach(id => {
            newState[id] = [];
          });
          return newState;
        });
      }
    } catch (error) {
      logger.error('Error loading partners batch:', error);
      // En caso de error, guardar arrays vacíos para todas las ventas
      setPartnersMap(prev => {
        const newState = { ...prev };
        saleIds.forEach(id => {
          newState[id] = [];
        });
        return newState;
      });
    } finally {
      // Limpiar el estado de carga
      setLoadingPartners(prev => {
        const newState = { ...prev };
        saleIds.forEach(id => {
          delete newState[id];
        });
        return newState;
      });
    }
  }, []);

  // Cargar socios cuando se monta el componente o cambian las ventas (en batch)
  useEffect(() => {
    // Identificar ventas que necesitan cargar socios
    const saleIdsToLoad = sales
      .filter(sale => sale.zoho_deal_id && partnersMap[sale.id] === undefined && !loadingPartners[sale.id])
      .map(sale => sale.id);

    // Cargar todas las ventas pendientes en una sola llamada
    if (saleIdsToLoad.length > 0) {
      loadPartnersBatch(saleIdsToLoad);
    }
  }, [sales, loadPartnersBatch, partnersMap, loadingPartners]);

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
        // Limpiar partnersMap para forzar recarga de socios
        setPartnersMap({});
        onRefresh(); // Recargar ventas
      } else {
        logger.error('Error processing sales:', data.error);
      }
    } catch (error) {
      logger.error('Error processing sales:', error);
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
                <TableHead>Asesor</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Socios del Producto</TableHead>
                <TableHead>m²</TableHead>
                <TableHead>Precio/m²</TableHead>
                <TableHead>Valor Total</TableHead>
                <TableHead className="text-center">Pagadas/Total</TableHead>
                <TableHead>Fecha Firma</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">
                    <div className="py-8 space-y-2">
                      <p>No hay ventas comisionables</p>
                      <p className="text-sm">Haz clic en &quot;Cargar Ventas desde BD&quot; para procesar los deals cerrados-ganados de la base de datos local</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => {
                  const partners = partnersMap[sale.id] || [];
                  const isLoading = loadingPartners[sale.id];
                  
                  return (
                    <TableRow key={sale.id}>
                      <TableCell>{sale.cliente_nombre}</TableCell>
                      <TableCell>{normalizeDevelopmentDisplay(sale.desarrollo || '')}</TableCell>
                      <TableCell>{sale.propietario_deal}</TableCell>
                      <TableCell>{sale.producto || '-'}</TableCell>
                      <TableCell className="max-w-[300px]">
                        {isLoading ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="text-xs text-muted-foreground">Cargando...</span>
                          </div>
                        ) : partners.length > 0 ? (
                          <div className="text-sm space-y-1">
                            {partners.map((partner, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                <span className="font-medium">{partner.socio}</span>
                                {partner.participacion > 0 && (
                                  <span className="text-muted-foreground">
                                    ({partner.participacion.toFixed(2)}%)
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
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
                      <TableCell className="text-center">
                        {(() => {
                          const total = sale.total_distributions ?? 0;
                          const paid = sale.paid_distributions ?? 0;
                          const allPaid = total > 0 && paid === total;
                          const label = `${paid}/${total}`;

                          return total === 0 ? (
                            <span className="text-muted-foreground">{label}</span>
                          ) : (
                            <div className="flex justify-center">
                              <Badge variant={allPaid ? 'default' : 'secondary'}>
                              {label}
                              </Badge>
                            </div>
                          );
                        })()}
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
                  );
                })
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
  distributions: _distributions,
  selectedDesarrollo,
  onDesarrolloChange,
  onRefresh,
  loading,
  availableDevelopments,
  configs,
}: {
  sales: CommissionSale[];
  distributions: Record<number, CommissionDistribution[]>;
  selectedDesarrollo: string;
  onDesarrolloChange: (desarrollo: string) => void;
  onRefresh: () => void;
  loading: boolean;
  availableDevelopments: string[];
  configs: CommissionConfig[];
}) {
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null);
  const [saleDistributions, setSaleDistributions] = useState<CommissionDistribution[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingDistributions, setLoadingDistributions] = useState(false);
  const { toast } = useToast();

  // Filtrar ventas por desarrollo
  const filteredSales = selectedDesarrollo === 'all' 
    ? sales 
    : sales.filter(s => s.desarrollo === selectedDesarrollo);

  const loadDistributions = useCallback(async (saleId: number) => {
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
        logger.error('Error loading distributions:', data.error);
      }
    } catch (error) {
      logger.error('Error loading distributions:', error);
    } finally {
      setLoadingDistributions(false);
    }
  }, []);

  // Cargar distribuciones cuando se selecciona una venta
  useEffect(() => {
    if (selectedSaleId) {
      loadDistributions(selectedSaleId);
    } else {
      setSaleDistributions([]);
    }
  }, [selectedSaleId, loadDistributions]);

  const handleCalculate = async (saleId: number, recalculate: boolean = false) => {
    setCalculating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/distributions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sale_id: saleId, recalculate }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: recalculate ? 'Comisiones recalculadas' : 'Comisiones calculadas',
          description: recalculate 
            ? 'Las comisiones se han recalculado correctamente con la nueva configuración'
            : 'Las comisiones se han calculado correctamente',
        });
        await loadDistributions(saleId);
        onRefresh(); // Recargar ventas para actualizar estado
      } else {
        logger.error('Error calculating commissions:', data.error);
      }
    } catch (error) {
      logger.error('Error calculating commissions:', error);
    } finally {
      setCalculating(false);
    }
  };

  const handleDelete = async (saleId: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar el cálculo de comisiones? Esto permitirá recalcular con la nueva configuración.')) {
      return;
    }

    setDeleting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/distributions?sale_id=${saleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Cálculo eliminado',
          description: 'El cálculo de comisiones ha sido eliminado. Puedes recalcular con la nueva configuración.',
        });
        setSaleDistributions([]);
        onRefresh(); // Recargar ventas para actualizar estado
      } else {
        logger.error('Error deleting calculation:', data.error);
      }
    } catch (error) {
      logger.error('Error deleting calculation:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handlePaymentStatusChange = async (distributionId: number, newStatus: 'pending' | 'paid') => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/distributions', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          distribution_id: distributionId,
          payment_status: newStatus,
        }),
      });
      const data = await response.json();
      if (data.success) {
        // Actualizar el estado local
        setSaleDistributions(prev => 
          prev.map(dist => 
            dist.id === distributionId 
              ? { ...dist, payment_status: newStatus }
              : dist
          )
        );
        toast({
          title: 'Estado actualizado',
          description: `La comisión ha sido marcada como ${newStatus === 'paid' ? 'pagada' : 'pendiente'}`,
        });
      } else {
        logger.error('Error updating payment status:', data.error);
      }
    } catch (error) {
      logger.error('Error updating payment status:', error);
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
                              {normalizeDevelopmentDisplay(sale.desarrollo || '')} - {sale.producto || 'Sin producto'}
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
                {selectedSale && (
                  <div className="flex gap-2">
                    {selectedSale.commission_calculated ? (
                      <>
                        <Button
                          onClick={() => handleCalculate(selectedSale.id, true)}
                          disabled={calculating}
                          size="sm"
                          variant="outline"
                        >
                          {calculating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Recalculando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Recalcular
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleDelete(selectedSale.id)}
                          disabled={deleting}
                          size="sm"
                          variant="destructive"
                        >
                          {deleting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Eliminando...
                            </>
                          ) : (
                            <>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
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
                          {(() => {
                            // Calcular sumas reales desde las distribuciones (pagado en comisiones)
                            const salePaid = saleDistributions
                              .filter(d => d.phase === 'sale')
                              .reduce((sum, d) => sum + (Number(d.amount_calculated) || 0), 0);
                            const postSalePaid = saleDistributions
                              .filter(d => d.phase === 'post_sale')
                              .reduce((sum, d) => sum + (Number(d.amount_calculated) || 0), 0);
                            
                            // Obtener configuración del desarrollo para calcular totales de fase
                            const config = configs.find(c => c.desarrollo.toLowerCase() === selectedSale.desarrollo.toLowerCase());
                            
                            // Calcular comisión base (100% del valor total por defecto)
                            const commissionBase = Number(selectedSale.valor_total);
                            
                            // Calcular totales de fase desde la configuración
                            const salePhaseTotal = config 
                              ? Number(((commissionBase * config.phase_sale_percent) / 100).toFixed(2))
                              : 0;
                            const postSalePhaseTotal = config
                              ? Number(((commissionBase * config.phase_post_sale_percent) / 100).toFixed(2))
                              : 0;
                            
                            // Total de comisiones pagadas
                            const totalCommissionsPaid = salePaid + postSalePaid;
                            
                            // Monto total de comisiones por fase
                            const totalCommissionsByPhase = salePhaseTotal + postSalePhaseTotal;
                            
                            // Utilidad = Monto total comisiones por fase - Total de comisiones pagadas
                            const utility = totalCommissionsByPhase - totalCommissionsPaid;
                            
                            return (
                              <>
                                <div className="col-span-2 border-t pt-2 mt-2">
                                  <span className="text-muted-foreground text-xs font-semibold">Fase Venta</span>
                                  <div className="flex justify-between items-center mt-1">
                                    <span className="text-sm">Total: </span>
                                    <p className="font-semibold text-blue-600">
                                      ${salePhaseTotal.toLocaleString('es-MX', { 
                                        minimumFractionDigits: 2, 
                                        maximumFractionDigits: 2 
                                      })}
                                    </p>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm">Pagado en comisiones: </span>
                                    <p className="font-semibold text-blue-700">
                                      ${salePaid.toLocaleString('es-MX', { 
                                        minimumFractionDigits: 2, 
                                        maximumFractionDigits: 2 
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <div className="col-span-2 border-t pt-2 mt-2">
                                  <span className="text-muted-foreground text-xs font-semibold">Fase Postventa</span>
                                  <div className="flex justify-between items-center mt-1">
                                    <span className="text-sm">Total: </span>
                                    <p className="font-semibold text-green-600">
                                      ${postSalePhaseTotal.toLocaleString('es-MX', { 
                                        minimumFractionDigits: 2, 
                                        maximumFractionDigits: 2 
                                      })}
                                    </p>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm">Pagado en comisiones: </span>
                                    <p className="font-semibold text-green-700">
                                      ${postSalePaid.toLocaleString('es-MX', { 
                                        minimumFractionDigits: 2, 
                                        maximumFractionDigits: 2 
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <div className="col-span-2 border-t pt-2 mt-2">
                                  <span className="text-muted-foreground">Total de Comisiones (Fase Venta + Postventa):</span>
                                  <p className="font-semibold text-lg">
                                    ${totalCommissionsPaid.toLocaleString('es-MX', { 
                                      minimumFractionDigits: 2, 
                                      maximumFractionDigits: 2 
                                    })}
                                  </p>
                                </div>
                                <div className="col-span-2 border-t pt-2 mt-2">
                                  <span className="text-muted-foreground">Utilidad:</span>
                                  <p className="font-semibold text-lg text-yellow-600">
                                    ${utility.toLocaleString('es-MX', { 
                                      minimumFractionDigits: 2, 
                                      maximumFractionDigits: 2 
                                    })}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    (Monto total comisiones por fase - Total de comisiones pagadas)
                                  </p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                      
                      {/* Distribuciones por Fase */}
                      <div className="divide-y">
                        <div className="p-2 bg-blue-50 border-b border-blue-200">
                          <h4 className="font-semibold text-sm text-blue-700">Fase Venta</h4>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rol</TableHead>
                              <TableHead>Persona</TableHead>
                              <TableHead>%</TableHead>
                              <TableHead>Monto</TableHead>
                              <TableHead>Estado de Pago</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {saleDistributions.filter(d => d.phase === 'sale').map((dist) => {
                              const normalizedName = normalizePersonName(
                                dist.role_type,
                                dist.person_name,
                                selectedSale,
                                selectedSale?.desarrollo
                              );
                              return (
                                <TableRow key={dist.id}>
                                  <TableCell>{getRoleDisplayName(dist.role_type)}</TableCell>
                                  <TableCell>{normalizedName}</TableCell>
                                  <TableCell>{dist.percent_assigned}%</TableCell>
                                  <TableCell className="font-medium">
                                    ${Number(dist.amount_calculated || 0).toLocaleString('es-MX', { 
                                      minimumFractionDigits: 2, 
                                      maximumFractionDigits: 2 
                                    })}
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={dist.payment_status || 'pending'}
                                      onValueChange={(value: 'pending' | 'paid') => 
                                        handlePaymentStatusChange(dist.id, value)
                                      }
                                    >
                                      <SelectTrigger className="w-[140px]">
                                        <SelectValue>
                                          {dist.payment_status === 'paid' ? (
                                            <div className="flex items-center gap-2">
                                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                                              <span>Pagada</span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2">
                                              <Clock className="h-4 w-4 text-yellow-600" />
                                              <span>Pendiente</span>
                                            </div>
                                          )}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="pending">
                                          <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-yellow-600" />
                                            Pendiente
                                          </div>
                                        </SelectItem>
                                        <SelectItem value="paid">
                                          <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                            Pagada
                                          </div>
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {saleDistributions.filter(d => d.phase === 'sale').length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                  No hay distribuciones en fase venta
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>

                        <div className="p-2 bg-green-50 border-b border-green-200">
                          <h4 className="font-semibold text-sm text-green-700">Fase Postventa</h4>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rol</TableHead>
                              <TableHead>Persona</TableHead>
                              <TableHead>%</TableHead>
                              <TableHead>Monto</TableHead>
                              <TableHead>Estado de Pago</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {saleDistributions.filter(d => d.phase === 'post_sale').map((dist) => {
                              const normalizedName = normalizePersonName(
                                dist.role_type,
                                dist.person_name,
                                selectedSale,
                                selectedSale?.desarrollo
                              );
                              return (
                                <TableRow key={dist.id}>
                                  <TableCell>{getRoleDisplayName(dist.role_type)}</TableCell>
                                  <TableCell>{normalizedName}</TableCell>
                                  <TableCell>{dist.percent_assigned}%</TableCell>
                                  <TableCell className="font-medium">
                                    ${Number(dist.amount_calculated || 0).toLocaleString('es-MX', { 
                                      minimumFractionDigits: 2, 
                                      maximumFractionDigits: 2 
                                    })}
                                  </TableCell>
                                  <TableCell>
                                    <Select
                                      value={dist.payment_status || 'pending'}
                                      onValueChange={(value: 'pending' | 'paid') => 
                                        handlePaymentStatusChange(dist.id, value)
                                      }
                                    >
                                      <SelectTrigger className="w-[140px]">
                                        <SelectValue>
                                          {dist.payment_status === 'paid' ? (
                                            <div className="flex items-center gap-2">
                                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                                              <span>Pagada</span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-2">
                                              <Clock className="h-4 w-4 text-yellow-600" />
                                              <span>Pendiente</span>
                                            </div>
                                          )}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="pending">
                                          <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-yellow-600" />
                                            Pendiente
                                          </div>
                                        </SelectItem>
                                        <SelectItem value="paid">
                                          <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                            Pagada
                                          </div>
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            {saleDistributions.filter(d => d.phase === 'post_sale').length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                  No hay distribuciones en fase postventa
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>

                        {/* Utilidad de Reglas (Referencia) */}
                        {(() => {
                          const utilityDistributions = saleDistributions.filter(d => d.phase === 'utility');
                          const ruleDistributions = utilityDistributions.filter(d => d.role_type === 'rule_bonus' && d.person_name !== 'Utilidad Restante');
                          const remainingUtility = utilityDistributions.find(d => d.person_name === 'Utilidad Restante');
                          
                          if (ruleDistributions.length > 0 || remainingUtility) {
                            return (
                              <>
                                <div className="p-2 bg-yellow-50 border-b border-yellow-200">
                                  <h4 className="font-semibold text-sm text-yellow-700">
                                    Utilidad por Reglas (Referencia - No distribuida)
                                  </h4>
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Regla</TableHead>
                                      <TableHead>Unidades</TableHead>
                                      <TableHead>Estado</TableHead>
                                      <TableHead>%</TableHead>
                                      <TableHead>Monto</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {ruleDistributions.map((dist) => {
                                      // Parsear información de unidades desde person_name: "Nombre|unidades_vendidas|unidades_requeridas|operador|fulfilled"
                                      const parts = dist.person_name.split('|');
                                      let ruleName = dist.person_name;
                                      let unidadesVendidas = 1;
                                      let unidadesRequeridas = 1;
                                      let operador = '=';
                                      let isFulfilled = dist.amount_calculated > 0;
                                      
                                      if (parts.length === 5) {
                                        ruleName = parts[0];
                                        unidadesVendidas = parseInt(parts[1]) || 1;
                                        unidadesRequeridas = parseInt(parts[2]) || 1;
                                        operador = parts[3] || '=';
                                        isFulfilled = parts[4] === '1';
                                      } else {
                                        // Fallback: intentar detectar si es cumplida o no
                                        isFulfilled = !dist.person_name.includes('Regla no cumplida') && dist.amount_calculated > 0;
                                        ruleName = dist.person_name.replace('Regla no cumplida - ', '').replace('Utilidad - ', '');
                                      }
                                      
                                      return (
                                        <TableRow 
                                          key={dist.id} 
                                          className={isFulfilled ? 'bg-green-50/50' : 'bg-red-50/50'}
                                        >
                                          <TableCell className="font-medium">
                                            {ruleName}
                                          </TableCell>
                                          <TableCell className="text-sm">
                                            {unidadesVendidas} / {unidadesRequeridas} ({operador})
                                          </TableCell>
                                          <TableCell>
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                              isFulfilled 
                                                ? 'bg-green-100 text-green-700' 
                                                : 'bg-red-100 text-red-700'
                                            }`}>
                                              {isFulfilled ? 'Cumplida' : 'No cumplida'}
                                            </span>
                                          </TableCell>
                                          <TableCell className={isFulfilled ? '' : 'text-gray-400'}>
                                            {dist.percent_assigned > 0 ? `${dist.percent_assigned}%` : '-'}
                                          </TableCell>
                                          <TableCell className={`font-medium ${isFulfilled ? 'text-green-700' : 'text-red-400'}`}>
                                            {dist.amount_calculated > 0 ? (
                                              `$${Number(dist.amount_calculated).toLocaleString('es-MX', { 
                                                minimumFractionDigits: 2, 
                                                maximumFractionDigits: 2 
                                              })}`
                                            ) : (
                                              <span className="text-gray-400 italic">-</span>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                    {remainingUtility && (
                                      <TableRow key={remainingUtility.id} className="bg-yellow-50/50">
                                        <TableCell className="font-medium" colSpan={2}>
                                          Utilidad Restante
                                        </TableCell>
                                        <TableCell>-</TableCell>
                                        <TableCell>{remainingUtility.percent_assigned}%</TableCell>
                                        <TableCell className="font-medium text-yellow-700">
                                          ${Number(remainingUtility.amount_calculated).toLocaleString('es-MX', { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 2 
                                          })}
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </>
                            );
                          }
                          return null;
                        })()}
                      </div>
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
  const [distributions, setDistributions] = useState<Array<CommissionDistribution & {
    producto: string | null;
    fecha_firma: string;
    cliente_nombre: string;
    desarrollo: string;
  }>>([]);
  const [loadingDistributions, setLoadingDistributions] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [personFilter, setPersonFilter] = useState<string>('all');
  const [partnerCommissions, setPartnerCommissions] = useState<Array<{
    socio_name: string;
    concepto: string;
    producto: string | null;
    cliente_nombre: string;
    desarrollo: string;
    total_comision: number;
    iva: number;
    total_con_iva: number;
    participacion: number;
    sale_id: number;
    month: number;
    fecha_firma: string;
  }>>([]);
  const [loadingPartnerCommissions, setLoadingPartnerCommissions] = useState(false);
  const { toast } = useToast();

  /**
   * Determina el color del semáforo según el porcentaje de cumplimiento
   * Verde: >= 100% (meta alcanzada o superada)
   * Amarillo: >= 80% y < 100% (cerca de la meta)
   * Rojo: < 80% (lejos de la meta)
   */
  const getCumplimientoColor = (porcentaje: number | null): string => {
    if (porcentaje === null) return 'text-gray-500';
    if (porcentaje >= 100) return 'text-green-600 font-bold';
    if (porcentaje >= 80) return 'text-yellow-600 font-semibold';
    return 'text-red-600 font-semibold';
  };

  // Cargar distribuciones
  const loadDistributions = useCallback(async () => {
    setLoadingDistributions(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams();
      params.append('list', 'distributions');
      params.append('year', selectedYear.toString());
      if (selectedDesarrollo !== 'all') {
        params.append('desarrollo', selectedDesarrollo);
      }
      if (paymentStatusFilter !== 'all') {
        params.append('payment_status', paymentStatusFilter);
      }
      
      const response = await fetch(`/api/commissions/dashboard?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setDistributions(data.data || []);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al cargar distribuciones',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error loading distributions:', error);
    } finally {
      setLoadingDistributions(false);
    }
  }, [selectedDesarrollo, selectedYear, paymentStatusFilter, toast]);

  // Cargar distribuciones cuando cambian los filtros
  useEffect(() => {
    loadDistributions();
  }, [loadDistributions]);

  // Cargar comisiones por socio
  const loadPartnerCommissions = useCallback(async () => {
    setLoadingPartnerCommissions(true);
    try {
      const token = localStorage.getItem('accessToken');
      const params = new URLSearchParams();
      params.append('year', selectedYear.toString());
      if (selectedDesarrollo !== 'all') {
        params.append('desarrollo', selectedDesarrollo);
      }
      
      const response = await fetch(`/api/commissions/partner-commissions?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setPartnerCommissions(data.data || []);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al cargar comisiones por socio',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error loading partner commissions:', error);
    } finally {
      setLoadingPartnerCommissions(false);
    }
  }, [selectedDesarrollo, selectedYear, toast]);

  // Cargar comisiones por socio cuando cambian los filtros
  useEffect(() => {
    loadPartnerCommissions();
  }, [loadPartnerCommissions]);

  // Estados para manejo de facturas
  const [uploadingInvoice, setUploadingInvoice] = useState<number | null>(null);

  // Manejar subida de factura
  const handleUploadInvoice = async (distributionId: number, file: File) => {
    setUploadingInvoice(distributionId);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('distribution_id', distributionId.toString());

      const response = await fetch('/api/commissions/invoices', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Factura subida',
          description: 'La factura se ha subido correctamente',
        });
        // Recargar distribuciones para actualizar el estado
        await loadDistributions();
      } else {
        logger.error('Error uploading invoice:', data.error);
      }
    } catch (error) {
      logger.error('Error uploading invoice:', error);
    } finally {
      setUploadingInvoice(null);
    }
  };

  // Manejar visualización de factura
  const handleViewInvoice = async (distributionId: number) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/invoices?distribution_id=${distributionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        // Limpiar el objeto URL después de un tiempo
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      } else {
        const data = await response.json();
        toast({
          title: 'Error',
          description: data.error || 'Error al visualizar factura',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error visualizando factura:', error);
      toast({
        title: 'Error',
        description: 'Error al visualizar factura',
        variant: 'destructive',
      });
    }
  };

  // Manejar descarga de factura
  const handleDownloadInvoice = async (distributionId: number) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/invoices?distribution_id=${distributionId}&download=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `factura_${distributionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({
          title: 'Descarga iniciada',
          description: 'La factura se está descargando',
        });
      } else {
        const data = await response.json();
        toast({
          title: 'Error',
          description: data.error || 'Error al descargar factura',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error descargando factura:', error);
      toast({
        title: 'Error',
        description: 'Error al descargar factura',
        variant: 'destructive',
      });
    }
  };

  // Manejar eliminación de factura
  const handleDeleteInvoice = async (distributionId: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta factura?')) {
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/commissions/invoices?distribution_id=${distributionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Factura eliminada',
          description: 'La factura se ha eliminado correctamente',
        });
        // Recargar distribuciones para actualizar el estado
        await loadDistributions();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al eliminar factura',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error eliminando factura:', error);
      toast({
        title: 'Error',
        description: 'Error al eliminar factura',
        variant: 'destructive',
      });
    }
  };

  // Manejar cambio de estado de pago
  const handlePaymentStatusChange = async (distributionId: number, newStatus: 'pending' | 'paid') => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/commissions/distributions', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          distribution_id: distributionId,
          payment_status: newStatus,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: 'Estado actualizado',
          description: `La comisión ha sido marcada como ${newStatus === 'paid' ? 'pagada' : 'pendiente'}`,
        });
        // Recargar distribuciones para actualizar el estado
        await loadDistributions();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Error al actualizar estado de pago',
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error updating payment status:', error);
      toast({
        title: 'Error',
        description: 'Error al actualizar estado de pago',
        variant: 'destructive',
      });
    }
  };

  // Calcular IVA (usando el mismo porcentaje que en comisiones por socio)
  const ivaPercent = parseFloat(process.env.NEXT_PUBLIC_IVA_PERCENT || '16');
  const calculateIva = (amount: number) => Number(((amount * ivaPercent) / 100).toFixed(2));
  const calculateTotalWithIva = (amount: number) => Number((amount + calculateIva(amount)).toFixed(2));

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
                  {generalDashboard &&
                    Object.keys(generalDashboard.commission_by_development)
                      .sort()
                      .map((dev) => (
                        <SelectItem key={dev} value={dev}>
                          {normalizeDevelopmentDisplay(dev)}
                        </SelectItem>
                      ))}
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
        <CardContent className="pt-4">
          {selectedDesarrollo !== 'all' && developmentDashboard ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Anual</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="text-xl font-bold">
                      ${developmentDashboard.total_annual.toLocaleString('es-MX', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Pagadas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="text-xl font-bold text-green-600">
                      ${(developmentDashboard.total_paid || 0).toLocaleString('es-MX', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-600" />
                      Pendientes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="text-xl font-bold text-yellow-600">
                      ${(developmentDashboard.total_pending || 0).toLocaleString('es-MX', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* Tabla mensual con estado de pago */}
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">Comisiones por Mes</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="text-xs py-1.5">Mes</TableHead>
                        <TableHead className="text-xs py-1.5 text-right">Total</TableHead>
                        <TableHead className="text-xs py-1.5 text-right">Pagadas</TableHead>
                        <TableHead className="text-xs py-1.5 text-right">Pendientes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {developmentDashboard.monthly_stats.map((month) => (
                        <TableRow key={month.month} className="h-8">
                          <TableCell className="text-xs py-1.5 font-medium">{month.month_name}</TableCell>
                          <TableCell className="text-xs py-1.5 text-right">
                            ${month.commission_total.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-xs py-1.5 text-right text-green-600">
                            ${(month.commission_paid || 0).toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-xs py-1.5 text-right text-yellow-600">
                            ${(month.commission_pending || 0).toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : generalDashboard ? (
            <div className="space-y-3">
              {/* Tabla 1: Datos mensuales Capital Plus */}
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">Datos mensuales Capital Plus</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="text-xs py-1.5">Métrica</TableHead>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableHead key={month.month} className="text-xs py-1.5 text-center min-w-[90px]">
                            <div className="flex flex-col">
                              <span>{month.month_name.substring(0, 3)}</span>
                              <span className="text-[10px] text-muted-foreground">{selectedYear}</span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">Ventas Totales</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            {month.ventas_totales}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">Ticket promedio de Venta</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            ${month.ticket_promedio_venta.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">Comisiones</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            ${month.monto_comision.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">Meta de comisión</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            {month.meta_facturacion !== null
                              ? `$${month.meta_facturacion.toLocaleString('es-MX', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">% comisión alcanzado</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            {month.porcentaje_cumplimiento !== null ? (
                              <span className={getCumplimientoColor(month.porcentaje_cumplimiento)}>
                                {month.porcentaje_cumplimiento.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">Monto de ventas</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            ${month.monto_ventas.toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">Meta de ventas</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            {month.meta_ventas !== null
                              ? `$${month.meta_ventas.toLocaleString('es-MX', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="h-8">
                        <TableCell className="text-xs py-1.5 font-medium">% ventas alcanzado</TableCell>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableCell key={month.month} className="text-xs py-1.5 text-center">
                            {month.porcentaje_cumplimiento_ventas !== null ? (
                              <span className={getCumplimientoColor(month.porcentaje_cumplimiento_ventas)}>
                                {month.porcentaje_cumplimiento_ventas.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Tabla 2: Comisión por desarrollo */}
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">→ Comisión por desarrollo</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="text-xs py-1.5">Desarrollo</TableHead>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableHead key={month.month} className="text-xs py-1.5 text-center min-w-[90px]">
                            <div className="flex flex-col">
                              <span>{month.month_name.substring(0, 3)}</span>
                              <span className="text-[10px] text-muted-foreground">{selectedYear}</span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(generalDashboard.commission_by_development)
                        .sort()
                        .map((desarrollo) => (
                          <TableRow key={desarrollo} className="h-8">
                            <TableCell className="text-xs py-1.5 font-medium capitalize">
                              {desarrollo}
                            </TableCell>
                            {generalDashboard.monthly_metrics.map((month) => {
                              const amount =
                                generalDashboard.commission_by_development[desarrollo]?.[
                                  month.month
                                ] || 0;
                              return (
                                <TableCell key={month.month} className="text-xs py-1.5 text-center">
                                  ${amount.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      {Object.keys(generalDashboard.commission_by_development).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={13}
                            className="text-center text-muted-foreground"
                          >
                            No hay datos de comisiones por desarrollo
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Tabla 3: Comisión por vendedor */}
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">→ Comisión por vendedor</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="text-xs py-1.5">Vendedor</TableHead>
                        {generalDashboard.monthly_metrics.map((month) => (
                          <TableHead key={month.month} className="text-xs py-1.5 text-center min-w-[90px]">
                            <div className="flex flex-col">
                              <span>{month.month_name.substring(0, 3)}</span>
                              <span className="text-[10px] text-muted-foreground">{selectedYear}</span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.keys(generalDashboard.commission_by_salesperson)
                        .sort()
                        .map((salesperson) => (
                          <TableRow key={salesperson} className="h-8">
                            <TableCell className="text-xs py-1.5 font-medium">{salesperson}</TableCell>
                            {generalDashboard.monthly_metrics.map((month) => {
                              const amount =
                                generalDashboard.commission_by_salesperson[salesperson]?.[
                                  month.month
                                ] || 0;
                              return (
                                <TableCell key={month.month} className="text-xs py-1.5 text-center">
                                  ${amount.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      {Object.keys(generalDashboard.commission_by_salesperson).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={13}
                            className="text-center text-muted-foreground"
                          >
                            No hay datos de comisiones por vendedor
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No hay datos disponibles</p>
          )}

          {/* Tabla de Comisiones a Pagar */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Comisiones a Pagar</CardTitle>
                  <CardDescription className="text-xs">
                    Lista detallada de todas las comisiones con su estado de pago
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select
                    value={personFilter}
                    onValueChange={(value: string) => setPersonFilter(value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Todas las personas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las personas</SelectItem>
                      {(() => {
                        // Obtener personas únicas de las distribuciones
                        const uniquePersons = Array.from(new Set(distributions.map(d => d.person_name)))
                          .sort();
                        return uniquePersons.map(person => (
                          <SelectItem key={person} value={person}>
                            {person}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  <Select
                    value={paymentStatusFilter}
                    onValueChange={(value: 'all' | 'pending' | 'paid') => setPaymentStatusFilter(value)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                      <SelectItem value="paid">Pagadas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {loadingDistributions ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (() => {
                // Aplicar filtros
                const monthNames = [
                  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
                ];

                let filteredDistributions = distributions;

                // Filtrar por persona
                if (personFilter !== 'all') {
                  filteredDistributions = filteredDistributions.filter(d => d.person_name === personFilter);
                }

                // Filtrar por estado de pago
                if (paymentStatusFilter !== 'all') {
                  filteredDistributions = filteredDistributions.filter(d => d.payment_status === paymentStatusFilter);
                }

                if (filteredDistributions.length === 0) {
                  return (
                    <div className="text-center text-muted-foreground p-4 text-sm">
                      No hay comisiones disponibles con los filtros seleccionados
                    </div>
                  );
                }

                // Agrupar por mes
                const groupedByMonth: Record<number, typeof filteredDistributions> = {};
                filteredDistributions.forEach(dist => {
                  const fechaFirma = new Date(dist.fecha_firma);
                  const month = fechaFirma.getMonth() + 1;
                  if (!groupedByMonth[month]) {
                    groupedByMonth[month] = [];
                  }
                  groupedByMonth[month].push(dist);
                });

                // Ordenar meses
                const sortedMonths = Object.keys(groupedByMonth)
                  .map(m => parseInt(m, 10))
                  .sort((a, b) => a - b);

                return (
                  <div className="space-y-3">
                    {sortedMonths.map(month => {
                      const monthDistributions = groupedByMonth[month];
                      
                      // Calcular totales del mes
                      const totalMonth = monthDistributions.reduce((sum, d) => sum + Number(d.amount_calculated || 0), 0);
                      const totalIvaMonth = monthDistributions.reduce((sum, d) => sum + calculateIva(Number(d.amount_calculated || 0)), 0);
                      const totalConIvaMonth = monthDistributions.reduce((sum, d) => sum + calculateTotalWithIva(Number(d.amount_calculated || 0)), 0);
                      const numTransacciones = monthDistributions.length;
                      const monthYear = `${selectedYear}-${String(month).padStart(2, '0')}`;

                      return (
                        <div key={month} className="space-y-2 border rounded-md p-3 bg-slate-50/50">
                          <div className="flex items-center justify-between pb-2 border-b">
                            <div className="flex items-center gap-3">
                              <h3 className="text-base font-bold">{monthNames[month - 1]} {selectedYear}</h3>
                              <span className="text-xs text-muted-foreground bg-slate-200 px-2 py-0.5 rounded">
                                {monthYear}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {numTransacciones} {numTransacciones === 1 ? 'transacción' : 'transacciones'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <div className="text-[10px] text-muted-foreground">Subtotal</div>
                                <div className="text-sm font-semibold">
                                  ${totalMonth.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground">IVA</div>
                                <div className="text-sm font-semibold">
                                  ${totalIvaMonth.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground">Total Mes</div>
                                <div className="text-base font-bold">
                                  ${totalConIvaMonth.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="h-8">
                                  <TableHead className="text-xs py-1.5 px-2">Producto</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Cliente</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Desarrollo</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Fecha</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Persona</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Rol</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Fase</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2 text-right">Comisión</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2 text-right">IVA</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2 text-right">Total</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Estado</TableHead>
                                  <TableHead className="text-xs py-1.5 px-2">Factura</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {monthDistributions.map((dist) => {
                                  const amount = Number(dist.amount_calculated || 0);
                                  const iva = calculateIva(amount);
                                  const totalConIva = calculateTotalWithIva(amount);
                                  
                                  return (
                                    <TableRow key={dist.id} className="h-8">
                                      <TableCell className="text-xs py-1.5 px-2 font-medium">
                                        {dist.producto || '-'}
                                      </TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">{dist.cliente_nombre}</TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">{dist.desarrollo}</TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">
                                        {new Date(dist.fecha_firma).toLocaleDateString('es-MX')}
                                      </TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">{dist.person_name}</TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">{getRoleDisplayName(dist.role_type)}</TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">
                                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                          {dist.phase === 'sale' ? 'Venta' : dist.phase === 'post_sale' ? 'Postventa' : 'Utilidad'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-xs py-1.5 px-2 text-right font-medium">
                                        ${amount.toLocaleString('es-MX', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}
                                      </TableCell>
                                      <TableCell className="text-xs py-1.5 px-2 text-right">
                                        ${iva.toLocaleString('es-MX', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}
                                      </TableCell>
                                      <TableCell className="text-xs py-1.5 px-2 text-right font-bold">
                                        ${totalConIva.toLocaleString('es-MX', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}
                                      </TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">
                                        <Select
                                          value={dist.payment_status}
                                          onValueChange={(value: 'pending' | 'paid') => handlePaymentStatusChange(dist.id, value)}
                                        >
                                          <SelectTrigger className="w-[110px] h-7 text-xs">
                                            <SelectValue>
                                              {dist.payment_status === 'paid' ? (
                                                <div className="flex items-center gap-1">
                                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                  <span className="text-xs">Pagada</span>
                                                </div>
                                              ) : (
                                                <div className="flex items-center gap-1">
                                                  <Clock className="h-3 w-3 text-yellow-600" />
                                                  <span className="text-xs">Pendiente</span>
                                                </div>
                                              )}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="pending">
                                              <div className="flex items-center gap-2">
                                                <Clock className="h-4 w-4 text-yellow-600" />
                                                Pendiente
                                              </div>
                                            </SelectItem>
                                            <SelectItem value="paid">
                                              <div className="flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                Pagada
                                              </div>
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </TableCell>
                                      <TableCell className="text-xs py-1.5 px-2">
                                        <div className="flex items-center gap-1">
                                          {dist.invoice_pdf_path ? (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleViewInvoice(dist.id)}
                                                title="Ver factura"
                                                className="h-6 w-6 p-0"
                                              >
                                                <Eye className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDownloadInvoice(dist.id)}
                                                title="Descargar factura"
                                                className="h-6 w-6 p-0"
                                              >
                                                <Download className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDeleteInvoice(dist.id)}
                                                title="Eliminar factura"
                                                className="h-6 w-6 p-0"
                                              >
                                                <X className="h-3 w-3 text-red-600" />
                                              </Button>
                                            </>
                                          ) : (
                                            <>
                                              <input
                                                type="file"
                                                accept=".pdf,application/pdf"
                                                className="hidden"
                                                id={`invoice-upload-${dist.id}`}
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) {
                                                    handleUploadInvoice(dist.id, file);
                                                  }
                                                }}
                                                disabled={uploadingInvoice === dist.id}
                                              />
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={uploadingInvoice === dist.id}
                                                title="Subir factura PDF"
                                                onClick={() => {
                                                  const input = document.getElementById(`invoice-upload-${dist.id}`) as HTMLInputElement;
                                                  input?.click();
                                                }}
                                                className="h-6 px-2 text-xs"
                                              >
                                                {uploadingInvoice === dist.id ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Upload className="h-3 w-3" />
                                                )}
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Tabla de Comisiones por Socio */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <div>
                <CardTitle className="text-lg">Comisiones por Socio</CardTitle>
                <CardDescription className="text-xs">
                  Total de comisiones que se deben cobrar a cada socio (100% de fase venta + fase posventa)
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {loadingPartnerCommissions ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : partnerCommissions.length === 0 ? (
                <div className="text-center text-muted-foreground p-4 text-sm">
                  No hay comisiones por socio disponibles
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Agrupar por mes y luego por socio */}
                  {(() => {
                    const monthNames = [
                      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
                    ];

                    // Primero agrupar por mes
                    const groupedByMonth: Record<number, typeof partnerCommissions> = {};
                    partnerCommissions.forEach(commission => {
                      const month = commission.month;
                      if (!groupedByMonth[month]) {
                        groupedByMonth[month] = [];
                      }
                      groupedByMonth[month].push(commission);
                    });

                    // Ordenar meses
                    const sortedMonths = Object.keys(groupedByMonth)
                      .map(m => parseInt(m, 10))
                      .sort((a, b) => a - b);

                    return sortedMonths.map(month => {
                      const monthCommissions = groupedByMonth[month];
                      
                      // Agrupar por socio dentro del mes
                      const groupedBySocio: Record<string, typeof partnerCommissions> = {};
                      monthCommissions.forEach(commission => {
                        if (!groupedBySocio[commission.socio_name]) {
                          groupedBySocio[commission.socio_name] = [];
                        }
                        groupedBySocio[commission.socio_name].push(commission);
                      });

                      // Calcular totales del mes
                      const totalMonth = monthCommissions.reduce((sum, c) => sum + c.total_comision, 0);
                      const totalIvaMonth = monthCommissions.reduce((sum, c) => sum + c.iva, 0);
                      const totalConIvaMonth = monthCommissions.reduce((sum, c) => sum + c.total_con_iva, 0);
                      const numSocios = Object.keys(groupedBySocio).length;
                      const numTransacciones = monthCommissions.length;
                      const monthYear = `${selectedYear}-${String(month).padStart(2, '0')}`;

                      return (
                        <div key={month} className="space-y-2 border rounded-md p-3 bg-slate-50/50">
                          <div className="flex items-center justify-between pb-2 border-b">
                            <div className="flex items-center gap-3">
                              <h3 className="text-base font-bold">{monthNames[month - 1]} {selectedYear}</h3>
                              <span className="text-xs text-muted-foreground bg-slate-200 px-2 py-0.5 rounded">
                                {monthYear}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {numSocios} {numSocios === 1 ? 'socio' : 'socios'} • {numTransacciones} {numTransacciones === 1 ? 'transacción' : 'transacciones'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div>
                                <div className="text-[10px] text-muted-foreground">Subtotal</div>
                                <div className="text-sm font-semibold">
                                  ${totalMonth.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground">IVA</div>
                                <div className="text-sm font-semibold">
                                  ${totalIvaMonth.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground">Total Mes</div>
                                <div className="text-base font-bold">
                                  ${totalConIvaMonth.toLocaleString('es-MX', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Mostrar comisiones por socio dentro del mes */}
                          <div className="space-y-2">
                            {Object.keys(groupedBySocio).sort().map(socioName => {
                              const socioCommissions = groupedBySocio[socioName];
                              const totalSocio = socioCommissions.reduce((sum, c) => sum + c.total_comision, 0);
                              const totalIvaSocio = socioCommissions.reduce((sum, c) => sum + c.iva, 0);
                              const totalConIvaSocio = socioCommissions.reduce((sum, c) => sum + c.total_con_iva, 0);

                              return (
                                <div key={`${month}-${socioName}`} className="space-y-1.5">
                                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                                    <h4 className="text-sm font-semibold">{socioName}</h4>
                                    <div className="flex items-center gap-3 text-right">
                                      <div>
                                        <div className="text-[10px] text-muted-foreground">Subtotal</div>
                                        <div className="text-xs font-semibold">
                                          ${totalSocio.toLocaleString('es-MX', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-muted-foreground">IVA</div>
                                        <div className="text-xs font-semibold">
                                          ${totalIvaSocio.toLocaleString('es-MX', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-muted-foreground">Total Socio</div>
                                        <div className="text-sm font-bold">
                                          ${totalConIvaSocio.toLocaleString('es-MX', {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="h-8">
                                          <TableHead className="text-xs py-1.5 px-2">Concepto</TableHead>
                                          <TableHead className="text-xs py-1.5 px-2">Lote</TableHead>
                                          <TableHead className="text-xs py-1.5 px-2">Cliente</TableHead>
                                          <TableHead className="text-xs py-1.5 px-2 text-right">Part.</TableHead>
                                          <TableHead className="text-xs py-1.5 px-2 text-right">Comisión</TableHead>
                                          <TableHead className="text-xs py-1.5 px-2 text-right">IVA</TableHead>
                                          <TableHead className="text-xs py-1.5 px-2 text-right">Total</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {socioCommissions.map((commission, idx) => (
                                          <TableRow key={`${commission.sale_id}-${idx}`} className="h-8">
                                            <TableCell className="text-xs py-1.5 px-2 font-medium">
                                              {commission.concepto}
                                            </TableCell>
                                            <TableCell className="text-xs py-1.5 px-2">{commission.producto || '-'}</TableCell>
                                            <TableCell className="text-xs py-1.5 px-2">{commission.cliente_nombre}</TableCell>
                                            <TableCell className="text-xs py-1.5 px-2 text-right">
                                              {commission.participacion.toFixed(2)}%
                                            </TableCell>
                                            <TableCell className="text-xs py-1.5 px-2 text-right font-medium">
                                              ${commission.total_comision.toLocaleString('es-MX', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}
                                            </TableCell>
                                            <TableCell className="text-xs py-1.5 px-2 text-right">
                                              ${commission.iva.toLocaleString('es-MX', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}
                                            </TableCell>
                                            <TableCell className="text-xs py-1.5 px-2 text-right font-bold">
                                              ${commission.total_con_iva.toLocaleString('es-MX', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

