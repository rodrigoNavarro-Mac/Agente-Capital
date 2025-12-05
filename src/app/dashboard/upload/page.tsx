'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Upload, FileText, CheckCircle2 } from 'lucide-react';
import { uploadDocument, getUserDevelopments } from '@/lib/api';
import { ZONES, DEVELOPMENTS, DOCUMENT_TYPES } from '@/lib/constants';
import { decodeAccessToken } from '@/lib/auth';
import type { UserDevelopment } from '@/types/documents';

export default function UploadPage() {
  const [zone, setZone] = useState('');
  const [development, setDevelopment] = useState('');
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    chunks: number;
    namespace: string;
    filename: string;
  } | null>(null);
  // Estado para almacenar las asignaciones del usuario
  const [userAssignments, setUserAssignments] = useState<UserDevelopment[]>([]);
  // Estado para almacenar el rol del usuario
  const [userRole, setUserRole] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Cargar asignaciones del usuario al montar
  useEffect(() => {
    loadUserAssignments();
  }, []);

  const loadUserAssignments = async () => {
    try {
      // Obtener ID del usuario desde el token
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const payload = decodeAccessToken(token);
      if (!payload || !payload.userId) return;

      // Guardar el rol del usuario
      setUserRole(payload.role || null);

      // Roles con acceso a TODOS los desarrollos y TODAS las zonas
      const rolesWithFullAccess = ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'];
      
      // Si el usuario tiene uno de estos roles, no necesita cargar asignaciones
      // porque tiene acceso a todas las zonas y desarrollos
      if (payload.role && rolesWithFullAccess.includes(payload.role)) {
        setUserAssignments([]); // Array vacío indica acceso total
        return;
      }

      // Cargar asignaciones del usuario
      const userDevs = await getUserDevelopments(payload.userId);
      
      // Guardar todas las asignaciones en el estado
      setUserAssignments(userDevs);
      
      // Filtrar solo los que tienen permiso de upload
      const uploadableDevs = userDevs.filter(dev => dev.can_upload);
      
      if (uploadableDevs.length > 0) {
        // Si solo tiene una asignación, seleccionarla automáticamente
        if (uploadableDevs.length === 1) {
          setZone(uploadableDevs[0].zone);
          setDevelopment(uploadableDevs[0].development);
        } else {
          // Si tiene múltiples, seleccionar la primera
          setZone(uploadableDevs[0].zone);
          setDevelopment(uploadableDevs[0].development);
        }
      }
    } catch (error) {
      console.error('Error cargando asignaciones del usuario:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadResult(null);
    }
  };

  // Verificar si el usuario tiene acceso completo a todos los desarrollos
  // CEO, ADMIN, LEGAL, POST-VENTA, MARKETING tienen acceso a todo
  const hasFullAccess = userRole && ['ceo', 'admin', 'legal_manager', 'post_sales', 'marketing_manager'].includes(userRole);

  const handleUpload = async () => {
    if (!file || !zone || !development || !type) {
      toast({
        title: 'Error',
        description: 'Por favor completa todos los campos',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('zone', zone);
      formData.append('development', development);
      formData.append('type', type);
      // Obtener ID del usuario desde el token
      const token = localStorage.getItem('accessToken');
      const payload = token ? decodeAccessToken(token) : null;
      const userId = payload?.userId || 1;
      
      formData.append('uploaded_by', userId.toString());

      setUploadProgress(30);

      const result = await uploadDocument(formData);

      setUploadProgress(100);
      setUploadResult({
        chunks: result.chunks || 0,
        namespace: result.pinecone_namespace || zone,
        filename: file.name,
      });

      toast({
        title: '✅ Documento procesado',
        description: `Se crearon ${result.chunks} chunks exitosamente`,
      });

      // Reset form (pero mantener zona y desarrollo si el usuario tiene asignaciones)
      setFile(null);
      setType('');
      
      // Si el usuario tiene acceso completo o tiene asignaciones, mantener la selección actual
      // Si no, limpiar todo
      if (!hasFullAccess && userAssignments.length === 0) {
        setZone('');
        setDevelopment('');
      }
      
      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error) {
      toast({
        title: '❌ Error al subir',
        description: error instanceof Error ? error.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // Filtrar zonas y desarrollos según las asignaciones del usuario
  // Roles con acceso completo ven todas las zonas y desarrollos
  // Otros roles solo ven lo que tienen asignado
  const availableZones = hasFullAccess
    ? ZONES // Acceso completo = todas las zonas
    : (userAssignments.length > 0
        ? ZONES.filter(z => userAssignments.some(dev => dev.zone === z.value && dev.can_upload))
        : ZONES);
  
  // Filtrar desarrollos según la zona seleccionada y las asignaciones del usuario
  const developments = zone 
    ? (DEVELOPMENTS[zone] || []).filter(dev => 
        hasFullAccess || // Acceso completo = todos los desarrollos
        userAssignments.some(assignment => 
          assignment.zone === zone && 
          assignment.development === dev.value && 
          assignment.can_upload
        )
      )
    : [];

  return (
    <div className="max-w-4xl space-y-8">
      <div className="pl-4">
        <h1 className="text-3xl font-bold navy-text">Subir Documentos</h1>
        <p className="text-muted-foreground">
          Procesa y almacena documentos para el agente de IA
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo Documento</CardTitle>
          <CardDescription>
            Sube PDF, CSV o DOCX para procesar y crear embeddings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Zone Selection */}
          <div className="space-y-2">
            <Label htmlFor="zone">Zona</Label>
            <Select value={zone} onValueChange={(value) => { setZone(value); setDevelopment(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una zona" />
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
          <div className="space-y-2">
            <Label htmlFor="development">Desarrollo</Label>
            <Select value={development} onValueChange={setDevelopment} disabled={!zone}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un desarrollo" />
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

          {/* Document Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Tipo de Documento</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el tipo" />
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

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file-input">Archivo</Label>
            <div className="flex items-center gap-4">
              <Input
                id="file-input"
                type="file"
                accept=".pdf,.csv,.docx"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {file && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {file.name}
                </Badge>
              )}
            </div>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Procesando documento...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-green-900">
                    Documento Procesado Exitosamente
                  </h4>
                  <div className="space-y-1 text-sm text-green-700">
                    <p><strong>Archivo:</strong> {uploadResult.filename}</p>
                    <p><strong>Chunks indexados:</strong> {uploadResult.chunks}</p>
                    <p><strong>Namespace:</strong> {uploadResult.namespace}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleUpload}
            disabled={!file || !zone || !development || !type || uploading}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? 'Procesando...' : 'Subir y Procesar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

