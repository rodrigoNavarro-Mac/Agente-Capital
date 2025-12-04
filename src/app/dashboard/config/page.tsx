'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Settings, Save, CheckCircle2, XCircle } from 'lucide-react';
import { getAgentConfig, updateMultipleConfig, updateAgentConfig } from '@/lib/api';
import type { AgentSettings } from '@/types/documents';

export default function ConfigPage() {
  const [config, setConfig] = useState<AgentSettings>({
    temperature: 0.2,
    top_k: 5,
    chunk_size: 500,
    chunk_overlap: 50,
    max_tokens: 2048,
    system_prompt: '',
  });
  const [llmProvider, setLlmProvider] = useState<'lmstudio' | 'openai'>('lmstudio');
  const [providerHealth, setProviderHealth] = useState<{
    lmstudio: boolean;
    openai: boolean;
    current: 'lmstudio' | 'openai';
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [showContext, setShowContext] = useState(true);

  const { toast } = useToast();

  const checkProvidersHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const response = await fetch('/api/rag-query');
      if (response.ok) {
        const data = await response.json();
        if (data.health) {
          setProviderHealth({
            lmstudio: data.health.lmStudio === 'available',
            openai: data.health.openai === 'available',
            current: data.health.current || 'lmstudio',
          });
        }
      }
    } catch (error) {
      console.error('Error checking provider health:', error);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const data = await getAgentConfig();
      setConfig(data);
      
      // Cargar proveedor LLM
      const providerResponse = await fetch('/api/agent-config?key=llm_provider');
      if (providerResponse.ok) {
        const providerData = await providerResponse.json();
        if (providerData.success && providerData.data) {
          setLlmProvider(providerData.data as 'lmstudio' | 'openai');
        }
      }
      
      // Cargar estado de salud de proveedores
      await checkProvidersHealth();
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  }, [checkProvidersHealth]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleProviderChange = async (newProvider: 'lmstudio' | 'openai') => {
    setSaving(true);
    try {
      // Obtener userId del token (simplificado, debería venir de auth)
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      let userId = 1; // Default, debería obtenerse del token
      
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.userId || 1;
        } catch {
          // Si no se puede decodificar, usar default
        }
      }

      await updateAgentConfig('llm_provider', newProvider, userId);
      setLlmProvider(newProvider);
      
      // Verificar salud después del cambio
      await checkProvidersHealth();
      
      toast({
        title: '✅ Proveedor LLM actualizado',
        description: `Ahora se está usando ${newProvider === 'openai' ? 'OpenAI' : 'LM Studio'}`,
      });
    } catch (error) {
      toast({
        title: '❌ Error al cambiar proveedor',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultipleConfig(
        [
          { key: 'temperature', value: config.temperature },
          { key: 'top_k', value: config.top_k },
          { key: 'chunk_size', value: config.chunk_size },
          { key: 'chunk_overlap', value: config.chunk_overlap },
          { key: 'max_tokens', value: config.max_tokens },
        ],
        1 // TODO: Get from auth
      );

      toast({
        title: '✅ Configuración guardada',
        description: 'Los cambios se aplicarán en la próxima consulta',
      });
    } catch (error) {
      toast({
        title: '❌ Error al guardar',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Cargando configuración...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div className="pl-4">
        <h1 className="text-3xl font-bold navy-text">Configuración</h1>
        <p className="text-muted-foreground">
          Ajusta los parámetros del agente de IA
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* LLM Provider Selection */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>Proveedor LLM</CardTitle>
            </div>
            <CardDescription>
              Selecciona el proveedor de LLM a utilizar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="llm_provider">Proveedor</Label>
              <Select
                value={llmProvider}
                onValueChange={(value) => handleProviderChange(value as 'lmstudio' | 'openai')}
                disabled={saving || checkingHealth}
              >
                <SelectTrigger id="llm_provider">
                  <SelectValue placeholder="Selecciona un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lmstudio">
                    <div className="flex items-center justify-between w-full">
                      <span>LM Studio</span>
                      {providerHealth && (
                        <Badge 
                          variant={providerHealth.lmstudio ? 'default' : 'destructive'}
                          className="ml-2"
                        >
                          {providerHealth.lmstudio ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {providerHealth.lmstudio ? 'Disponible' : 'No disponible'}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                  <SelectItem value="openai">
                    <div className="flex items-center justify-between w-full">
                      <span>OpenAI</span>
                      {providerHealth && (
                        <Badge 
                          variant={providerHealth.openai ? 'default' : 'destructive'}
                          className="ml-2"
                        >
                          {providerHealth.openai ? (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {providerHealth.openai ? 'Disponible' : 'No disponible'}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {llmProvider === 'openai' 
                  ? 'Usando OpenAI API (requiere OPENAI_API_KEY configurada)'
                  : 'Usando LM Studio local (requiere servidor corriendo)'}
              </p>
            </div>
            
            {providerHealth && (
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Proveedor actual:</span>
                  <Badge variant="outline">
                    {providerHealth.current === 'openai' ? 'OpenAI' : 'LM Studio'}
                  </Badge>
                </div>
              </div>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={checkProvidersHealth}
              disabled={checkingHealth}
              className="w-full"
            >
              {checkingHealth ? 'Verificando...' : 'Verificar Estado de Proveedores'}
            </Button>
          </CardContent>
        </Card>

        {/* LLM Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>Modelo LLM</CardTitle>
            </div>
            <CardDescription>
              Parámetros de generación de texto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Temperature */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Temperature</Label>
                <span className="text-sm font-medium">{config.temperature}</span>
              </div>
              <Slider
                value={[config.temperature]}
                onValueChange={(value) => setConfig({ ...config, temperature: value[0] })}
                min={0}
                max={2}
                step={0.1}
              />
              <p className="text-xs text-muted-foreground">
                Controla la aleatoriedad. Menor = más determinístico
              </p>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <Label htmlFor="max_tokens">Tokens Máximos</Label>
              <Input
                id="max_tokens"
                type="number"
                value={config.max_tokens}
                onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) })}
                min={100}
                max={8192}
              />
              <p className="text-xs text-muted-foreground">
                Longitud máxima de la respuesta
              </p>
            </div>
          </CardContent>
        </Card>

        {/* RAG Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Recuperación (RAG)</CardTitle>
            <CardDescription>
              Configuración de búsqueda semántica
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Top K */}
            <div className="space-y-2">
              <Label htmlFor="top_k">Top K</Label>
              <Input
                id="top_k"
                type="number"
                value={config.top_k}
                onChange={(e) => setConfig({ ...config, top_k: parseInt(e.target.value) })}
                min={1}
                max={20}
              />
              <p className="text-xs text-muted-foreground">
                Número de resultados a recuperar de Pinecone
              </p>
            </div>

            {/* Show Context Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Mostrar contexto</Label>
                <p className="text-xs text-muted-foreground">
                  Incluir fuentes en respuestas
                </p>
              </div>
              <Switch
                checked={showContext}
                onCheckedChange={setShowContext}
              />
            </div>
          </CardContent>
        </Card>

        {/* Chunking Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Procesamiento de Texto</CardTitle>
            <CardDescription>
              Configuración de chunks y embeddings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Chunk Size */}
            <div className="space-y-2">
              <Label htmlFor="chunk_size">Tamaño de Chunk</Label>
              <Input
                id="chunk_size"
                type="number"
                value={config.chunk_size}
                onChange={(e) => setConfig({ ...config, chunk_size: parseInt(e.target.value) })}
                min={100}
                max={2000}
              />
              <p className="text-xs text-muted-foreground">
                Tokens por chunk al procesar documentos
              </p>
            </div>

            {/* Chunk Overlap */}
            <div className="space-y-2">
              <Label htmlFor="chunk_overlap">Solapamiento</Label>
              <Input
                id="chunk_overlap"
                type="number"
                value={config.chunk_overlap}
                onChange={(e) => setConfig({ ...config, chunk_overlap: parseInt(e.target.value) })}
                min={0}
                max={500}
              />
              <p className="text-xs text-muted-foreground">
                Tokens de overlap entre chunks
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle>Sistema</CardTitle>
            <CardDescription>
              Información del entorno
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Modelo LLM</span>
              <span className="font-medium">llama-3.2-3B</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Embeddings</span>
              <span className="font-medium">llama-text-embed-v2</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vector DB</span>
              <span className="font-medium">Pinecone</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dimensión</span>
              <span className="font-medium">1024</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </div>
  );
}

