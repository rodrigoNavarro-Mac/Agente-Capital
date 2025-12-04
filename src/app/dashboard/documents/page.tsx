'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Dialog } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FileText, Filter, Trash2, Loader2, AlertTriangle, Eye, Database, RefreshCw } from 'lucide-react';
import { getDocuments, deleteDocument, getDocumentChunks } from '@/lib/api';
import { ZONES, DEVELOPMENTS, DOCUMENT_TYPES } from '@/lib/constants';
import { formatDate, snakeToTitle } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { decodeAccessToken } from '@/lib/auth';
import type { DocumentMetadata, UserRole, PineconeMatch } from '@/types/documents';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoneFilter, setZoneFilter] = useState('');
  const [developmentFilter, setDevelopmentFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  
  // Estados para el modal de visualización
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [documentToView, setDocumentToView] = useState<DocumentMetadata | null>(null);
  const [documentChunks, setDocumentChunks] = useState<PineconeMatch[]>([]);
  const [documentText, setDocumentText] = useState<string>('');
  const [loadingChunks, setLoadingChunks] = useState(false);
  
  const { toast } = useToast();

  // Obtener información del usuario al montar
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        const payload = decodeAccessToken(token);
        if (payload) {
          setUserId(payload.userId || null);
          // Validar que el role sea un UserRole válido antes de asignarlo
          setUserRole((payload.role as UserRole) || null);
        }
      } catch (error) {
        console.error('Error decodificando token:', error);
      }
    }
  }, []);

  const loadDocuments = useCallback(async (invalidateCache = false) => {
    setLoading(true);
    try {
      const docs = await getDocuments({
        zone: zoneFilter || undefined,
        development: developmentFilter || undefined,
        type: typeFilter || undefined,
      }, invalidateCache);
      setDocuments(docs);
      if (invalidateCache) {
        toast({
          title: '✅ Caché actualizado',
          description: `Se cargaron ${docs.length} documentos`,
        });
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: '❌ Error',
        description: 'No se pudieron cargar los documentos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [zoneFilter, developmentFilter, typeFilter, toast]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDeleteClick = (doc: DocumentMetadata) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleViewClick = async (doc: DocumentMetadata) => {
    setDocumentToView(doc);
    setViewDialogOpen(true);
    setLoadingChunks(true);
    setDocumentChunks([]);
    setDocumentText('');

    try {
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      // Si es admin, cargar los chunks
      if (userRole === 'admin' || userRole === 'ceo') {
        const chunksData = await getDocumentChunks(doc.id!, userId);
        setDocumentChunks(chunksData.chunks);
        setDocumentText(chunksData.documentText);
      } else {
        // Si no es admin, solo mostrar el texto reconstruido básico
        // (esto requeriría un endpoint diferente que no muestre metadatos de chunks)
        toast({
          title: 'Información',
          description: 'Solo los administradores pueden ver los detalles de los chunks',
        });
      }
    } catch (error) {
      console.error('Error cargando chunks:', error);
      toast({
        title: '❌ Error',
        description: error instanceof Error ? error.message : 'No se pudieron cargar los chunks del documento',
        variant: 'destructive',
      });
    } finally {
      setLoadingChunks(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!documentToDelete || !userId) return;

    setIsDeleting(true);
    // Agregar el ID al set de documentos que se están eliminando
    setDeletingIds(prev => new Set(prev).add(documentToDelete.id!));

    try {
      await deleteDocument(documentToDelete.id!, userId);
      
      // Eliminar el documento de la lista local
      setDocuments(prev => prev.filter(d => d.id !== documentToDelete.id));
      
      toast({
        title: '✅ Documento eliminado',
        description: `"${documentToDelete.filename}" ha sido eliminado exitosamente`,
      });

      // Cerrar el diálogo
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: '❌ Error al eliminar',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el documento',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      // Quitar el ID del set de documentos que se están eliminando
      setDeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentToDelete.id!);
        return newSet;
      });
    }
  };

  const developments = zoneFilter ? DEVELOPMENTS[zoneFilter] || [] : [];

  return (
    <div className="space-y-8">
      <div className="pl-4">
        <h1 className="text-3xl font-bold navy-text">Documentos</h1>
        <p className="text-muted-foreground">
          Explora y gestiona documentos procesados
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <CardTitle>Filtros</CardTitle>
          </div>
          <CardDescription>
            Filtra documentos por zona, desarrollo o tipo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Select value={zoneFilter || undefined} onValueChange={(value) => { setZoneFilter(value); setDevelopmentFilter(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las zonas" />
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
              <Select value={developmentFilter || undefined} onValueChange={setDevelopmentFilter} disabled={!zoneFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los desarrollos" />
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

            <div className="space-y-2">
              <Select value={typeFilter || undefined} onValueChange={setTypeFilter}>
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
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Documentos ({documents.length})</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDocuments(true)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Cargando documentos...
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No se encontraron documentos</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Desarrollo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {doc.filename}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ZONES.find(z => z.value === doc.zone)?.label || doc.zone}
                      </Badge>
                    </TableCell>
                    <TableCell>{snakeToTitle(doc.development)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {DOCUMENT_TYPES.find(t => t.value === doc.type)?.label || doc.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.created_at && formatDate(doc.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleViewClick(doc)}
                          title="Visualizar documento"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteClick(doc)}
                          disabled={deletingIds.has(doc.id!)}
                          title="Eliminar documento"
                        >
                          {deletingIds.has(doc.id!) ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setDeleteDialogOpen(open);
            if (!open) setDocumentToDelete(null);
          }
        }}
        title="¿Eliminar documento?"
        description={
          documentToDelete ? (
            <div className="space-y-3">
              <p className="font-medium text-foreground">
                Estás a punto de eliminar el documento:
              </p>
              <div className="bg-muted p-3 rounded-md border">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{documentToDelete.filename}</span>
                </div>
                <div className="text-xs space-y-1">
                  <div>
                    <span className="text-muted-foreground">Zona:</span>{' '}
                    <span className="font-medium">
                      {ZONES.find(z => z.value === documentToDelete.zone)?.label}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Desarrollo:</span>{' '}
                    <span className="font-medium">{snakeToTitle(documentToDelete.development)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>{' '}
                    <span className="font-medium">
                      {DOCUMENT_TYPES.find(t => t.value === documentToDelete.type)?.label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-destructive">Esta acción es permanente</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Se eliminará el registro de la base de datos</li>
                    <li>Se eliminarán todos los vectores de Pinecone</li>
                    <li>El agente ya no podrá acceder a esta información</li>
                    <li>No se puede deshacer esta operación</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            'Cargando información del documento...'
          )
        }
        confirmLabel="Sí, eliminar documento"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        variant="destructive"
        loading={isDeleting}
      />

      {/* Dialog de visualización de documento */}
      <Dialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        title={documentToView ? `Documento: ${documentToView.filename}` : 'Visualizar Documento'}
        size="xl"
      >
        {documentToView && (
          <div className="space-y-4">
            {/* Información del documento */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Información del Documento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Zona:</span>{' '}
                    <Badge variant="outline" className="ml-2">
                      {ZONES.find(z => z.value === documentToView.zone)?.label || documentToView.zone}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Desarrollo:</span>{' '}
                    <span className="font-medium">{snakeToTitle(documentToView.development)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>{' '}
                    <Badge variant="secondary" className="ml-2">
                      {DOCUMENT_TYPES.find(t => t.value === documentToView.type)?.label || documentToView.type}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fecha:</span>{' '}
                    <span className="font-medium">
                      {documentToView.created_at && formatDate(documentToView.created_at)}
                    </span>
                  </div>
                  {documentChunks.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Chunks:</span>{' '}
                      <span className="font-medium">{documentChunks.length}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tabs para contenido y chunks (solo admin) */}
            <Tabs defaultValue="content" className="w-full">
              <TabsList>
                <TabsTrigger value="content">Contenido del Documento</TabsTrigger>
                {(userRole === 'admin' || userRole === 'ceo') && (
                  <TabsTrigger value="chunks">
                    <Database className="h-4 w-4 mr-2" />
                    Chunks ({documentChunks.length})
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Tab de contenido */}
              <TabsContent value="content" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Texto Completo del Documento</CardTitle>
                    <CardDescription>
                      Contenido reconstruido desde los chunks almacenados
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingChunks ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-muted-foreground">Cargando contenido...</span>
                      </div>
                    ) : documentText ? (
                      <div className="bg-muted p-4 rounded-md max-h-[500px] overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm font-mono">
                          {documentText}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No se pudo cargar el contenido del documento</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tab de chunks (solo admin) */}
              {(userRole === 'admin' || userRole === 'ceo') && (
                <TabsContent value="chunks" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Chunks Almacenados en Pinecone</CardTitle>
                      <CardDescription>
                        Visualiza cómo está dividido y almacenado el documento en la base de datos vectorial
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {loadingChunks ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          <span className="ml-2 text-muted-foreground">Cargando chunks...</span>
                        </div>
                      ) : documentChunks.length > 0 ? (
                        <div className="space-y-4">
                          <div className="text-sm text-muted-foreground mb-4">
                            Total de chunks: <strong>{documentChunks.length}</strong>
                          </div>
                          <Accordion type="single" collapsible className="w-full">
                            {documentChunks.map((chunk, index) => (
                              <AccordionItem key={chunk.id} value={`chunk-${index}`}>
                                <AccordionTrigger className="text-sm">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">Chunk {chunk.metadata.chunk}</Badge>
                                    {chunk.metadata.page > 0 && (
                                      <Badge variant="secondary">Página {chunk.metadata.page}</Badge>
                                    )}
                                    <span className="text-muted-foreground">
                                      ID: {chunk.id.substring(0, 20)}...
                                    </span>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-3 pt-2">
                                    {/* Metadatos del chunk */}
                                    <div className="grid grid-cols-2 gap-2 text-xs bg-muted p-3 rounded-md">
                                      <div>
                                        <span className="text-muted-foreground">ID:</span>{' '}
                                        <code className="text-xs">{chunk.id}</code>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Score:</span>{' '}
                                        <span className="font-medium">{chunk.score.toFixed(4)}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Zona:</span>{' '}
                                        <span className="font-medium">{chunk.metadata.zone}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Desarrollo:</span>{' '}
                                        <span className="font-medium">{chunk.metadata.development}</span>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Tipo:</span>{' '}
                                        <Badge variant="secondary" className="text-xs">
                                          {chunk.metadata.type}
                                        </Badge>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Creado:</span>{' '}
                                        <span className="font-medium">
                                          {chunk.metadata.created_at 
                                            ? formatDate(chunk.metadata.created_at)
                                            : 'N/A'}
                                        </span>
                                      </div>
                                    </div>
                                    {/* Texto del chunk */}
                                    <div className="bg-background border p-3 rounded-md">
                                      <p className="text-sm whitespace-pre-wrap">
                                        {chunk.metadata.text || 'Sin texto'}
                                      </p>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No se encontraron chunks para este documento</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}
      </Dialog>
    </div>
  );
}

