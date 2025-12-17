'use client';

import { useState, useEffect } from 'react';
import { 
  Book, 
  MessageSquare, 
  Upload, 
  FileText, 
  Star, 
  User,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Shield,
  Lightbulb,
  AlertCircle,
  Building2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { UserRole } from '@/types/documents';

// Tipo para secciones de la guía
interface GuideSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  content: React.ReactNode;
  roles?: UserRole[]; // Si no se especifica, es para todos
}

export default function GuiaPage() {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<string[]>(['primeros-pasos']);

  useEffect(() => {
    // Obtener información del usuario
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role || null);
        setUserName(user.name || 'Usuario');
      } catch (error) {
        console.error('Error parsing user:', error);
      }
    }
  }, []);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionId) 
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  // Obtener nombre del rol en español
  const getRoleName = (role: UserRole | null): string => {
    const roleNames: Partial<Record<UserRole, string>> = {
      'admin': 'Administrador',
      'ceo': 'CEO',
      'sales_manager': 'Gerente de Ventas',
      'sales_agent': 'Agente de Ventas',
      'post_sales': 'Post-Ventas',
      'legal_manager': 'Gerente Legal',
      'marketing_manager': 'Gerente de Marketing'
    };
    return role && roleNames[role] ? roleNames[role] : 'Usuario';
  };

  // Verificar si el usuario puede subir documentos
  const canUpload = userRole && ['admin', 'ceo', 'sales_manager', 'legal_manager', 'marketing_manager'].includes(userRole);

  // Definir secciones de la guía
  const guideSections: GuideSection[] = [
    {
      id: 'primeros-pasos',
      title: 'Primeros Pasos',
      icon: HelpCircle,
      description: 'Aprende lo básico para comenzar a usar el sistema',
      content: (
        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div className="flex items-start">
              <Lightbulb className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-blue-900">¡Bienvenido {userName}!</h4>
                <p className="text-sm text-blue-800 mt-1">
                  Tu rol actual es: <Badge variant="secondary">{getRoleName(userRole)}</Badge>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">¿Qué es el Agente Capital Plus?</h4>
            <p className="text-gray-700">
              Es tu asistente inteligente personal que te ayuda a encontrar información sobre 
              nuestros desarrollos inmobiliarios. El sistema está alimentado 100% por documentos 
              oficiales de Capital Plus.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Características principales:</h4>
            <ul className="space-y-2">
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Responde preguntas sobre desarrollos, precios, amenidades y más</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Cita las fuentes de donde obtiene la información</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Aprende continuamente gracias a tus calificaciones</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Disponible 24/7 para ayudarte en tu trabajo</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'zoho-crm',
      title: 'ZOHO CRM',
      icon: Building2,
      description: 'Leads, deals y estadísticas (según tu rol)',
      roles: ['admin', 'ceo', 'sales_manager', 'post_sales', 'legal_manager', 'marketing_manager'],
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">¿Qué es ZOHO CRM en este sistema?</h4>
            <p className="text-gray-700">
              Es un módulo para <strong>visualizar información comercial</strong> (leads, deals y métricas) y ayudarte a dar seguimiento.
              La información se muestra con filtros para analizar periodos, asesores y desarrollos.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Qué puedes hacer (funciones principales):</h4>
            <ul className="space-y-2">
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">1.</span>
                <span className="text-gray-700">
                  <strong>Estadísticas:</strong> ver indicadores y gráficos del periodo seleccionado.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">2.</span>
                <span className="text-gray-700">
                  <strong>Leads:</strong> revisar y filtrar leads por desarrollo, fuente, asesor y estado.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">3.</span>
                <span className="text-gray-700">
                  <strong>Deals:</strong> revisar y filtrar deals por desarrollo, fuente, asesor y etapa.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">4.</span>
                <span className="text-gray-700">
                  <strong>Filtros globales:</strong> cambiar periodo (semana/mes/trimestre/año) y comparar con el periodo anterior.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">5.</span>
                <span className="text-gray-700">
                  <strong>Actualizar:</strong> recargar información para ver los datos más recientes.
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div className="flex items-start">
              <Shield className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="space-y-2">
                <h4 className="font-semibold text-blue-900">Acceso por rol (muy importante)</h4>
                <ul className="space-y-1 text-sm text-blue-800">
                  <li>
                    <strong>Admin / CEO / Post-Ventas / Gerente Legal / Gerente Marketing:</strong> acceso a ZOHO CRM con <strong>todos los desarrollos</strong>.
                  </li>
                  <li>
                    <strong>Gerente de Ventas:</strong> acceso a ZOHO CRM, pero <strong>solo a los desarrollos asignados</strong> por un administrador.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h5 className="font-semibold text-yellow-900 mb-2 flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              Nota sobre sincronización
            </h5>
            <p className="text-sm text-yellow-800">
              La sincronización completa de ZOHO (traer/actualizar datos) está pensada para administradores.
              Si no ves datos o notas un comportamiento extraño, contacta a un administrador para validar la sincronización.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'consultar-agente',
      title: 'Consultar al Asistente',
      icon: MessageSquare,
      description: 'Aprende a hacer preguntas y obtener las mejores respuestas',
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Cómo hacer una consulta:</h4>
            <ol className="space-y-3 list-decimal list-inside">
              <li className="text-gray-700">
                <strong>Ve a &quot;Consultar Agente&quot;</strong> en el menú lateral
              </li>
              <li className="text-gray-700">
                <strong>Selecciona el contexto:</strong>
                <ul className="ml-6 mt-2 space-y-1 list-disc list-inside">
                  <li>Zona (Yucatán, Quintana Roo, Querétaro, etc.)</li>
                  <li>Desarrollo (Amura, M2, Marea, etc.)</li>
                  <li>Tipo de documento (opcional)</li>
                </ul>
              </li>
              <li className="text-gray-700">
                <strong>Escribe tu pregunta</strong> de forma natural
              </li>
              <li className="text-gray-700">
                <strong>Presiona Enter</strong> o click en &quot;Consultar&quot;
              </li>
            </ol>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h5 className="font-semibold text-green-900 mb-2 flex items-center">
              <span className="text-green-500 mr-2">✓</span>
              Ejemplos de buenas preguntas:
            </h5>
            <ul className="space-y-1 text-sm text-green-800">
              <li>• &quot;¿Cuánto cuesta un departamento de 2 recámaras en Amura?&quot;</li>
              <li>• &quot;¿Qué amenidades tiene el desarrollo Marea?&quot;</li>
              <li>• &quot;¿Cuáles son los plazos de entrega de M2?&quot;</li>
              <li>• &quot;Dame información de contacto del desarrollo Amura&quot;</li>
            </ul>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h5 className="font-semibold text-red-900 mb-2 flex items-center">
              <span className="text-red-500 mr-2">✗</span>
              Evita preguntas muy vagas:
            </h5>
            <ul className="space-y-1 text-sm text-red-800">
              <li>• &quot;Información&quot; (demasiado general)</li>
              <li>• &quot;¿Qué hay?&quot; (sin contexto)</li>
              <li>• &quot;Cuéntame&quot; (sin especificar qué)</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Entendiendo las respuestas:</h4>
            <p className="text-gray-700">
              Cada respuesta incluye:
            </p>
            <ul className="space-y-2">
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">1.</span>
                <span className="text-gray-700"><strong>Respuesta principal:</strong> La información solicitada</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">2.</span>
                <span className="text-gray-700"><strong>Fuentes:</strong> Documentos de donde se obtuvo la información</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">3.</span>
                <span className="text-gray-700"><strong>Calificación:</strong> Para que ayudes a mejorar el sistema</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'calificar-respuestas',
      title: 'Calificar Respuestas',
      icon: Star,
      description: 'Ayuda a mejorar el sistema calificando las respuestas',
      content: (
        <div className="space-y-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
            <div className="flex items-start">
              <Star className="h-5 w-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-yellow-900">¿Por qué calificar?</h4>
                <p className="text-sm text-yellow-800 mt-1">
                  Tus calificaciones ayudan al sistema a aprender y mejorar continuamente.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Sistema de calificación:</h4>
            <div className="space-y-2">
              <div className="flex items-start">
                <div className="flex text-yellow-400 mr-3">★★★★★</div>
                <div>
                  <div className="font-medium">Excelente (5/5)</div>
                  <div className="text-sm text-gray-600">Respuesta perfecta, muy útil</div>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex text-yellow-400 mr-3">★★★★☆</div>
                <div>
                  <div className="font-medium">Buena (4/5)</div>
                  <div className="text-sm text-gray-600">Respuesta útil con información completa</div>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex text-yellow-400 mr-3">★★★☆☆</div>
                <div>
                  <div className="font-medium">Regular (3/5)</div>
                  <div className="text-sm text-gray-600">Respuesta parcial o poco clara</div>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex text-yellow-400 mr-3">★★☆☆☆</div>
                <div>
                  <div className="font-medium">Mala (2/5)</div>
                  <div className="text-sm text-gray-600">Respuesta incorrecta o poco útil</div>
                </div>
              </div>
              <div className="flex items-start">
                <div className="flex text-yellow-400 mr-3">★☆☆☆☆</div>
                <div>
                  <div className="font-medium">Muy Mala (1/5)</div>
                  <div className="text-sm text-gray-600">Respuesta incorrecta o irrelevante</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Consejos para calificar:</h4>
            <ul className="space-y-2">
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Califica basándote en si la respuesta contestó tu pregunta</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Verifica si la información fue precisa y actualizada</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Agrega comentarios en calificaciones bajas para explicar el problema</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">✓</span>
                <span className="text-gray-700">Si encuentras información desactualizada, repórtala en los comentarios</span>
              </li>
            </ul>
          </div>
        </div>
      )
    }
  ];

  // Agregar sección de upload solo para usuarios con permisos
  if (canUpload) {
    guideSections.push({
      id: 'subir-documentos',
      title: 'Subir Documentos',
      icon: Upload,
      description: 'Alimenta al asistente con nueva información',
      roles: ['admin', 'ceo', 'sales_manager', 'legal_manager', 'marketing_manager'],
      content: (
        <div className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div className="flex items-start">
              <Shield className="h-5 w-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-blue-900">Tienes permisos de carga</h4>
                <p className="text-sm text-blue-800 mt-1">
                  Como {getRoleName(userRole)}, puedes subir y gestionar documentos del sistema.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Paso a paso para subir documentos:</h4>
            <ol className="space-y-3 list-decimal list-inside">
              <li className="text-gray-700">
                <strong>Ve a &quot;Subir Documentos&quot;</strong> en el menú lateral
              </li>
              <li className="text-gray-700">
                <strong>Completa la información:</strong>
                <ul className="ml-6 mt-2 space-y-1 list-disc list-inside">
                  <li>Zona (Yucatán, Quintana Roo, etc.)</li>
                  <li>Desarrollo (Amura, M2, Marea, etc.)</li>
                  <li>Tipo de documento (Contrato, Brochure, Precios, etc.)</li>
                  <li>Descripción breve del contenido</li>
                </ul>
              </li>
              <li className="text-gray-700">
                <strong>Selecciona el archivo:</strong>
                <ul className="ml-6 mt-2 space-y-1 list-disc list-inside">
                  <li>Formatos: PDF, Excel (.xlsx, .csv), Word (.docx)</li>
                  <li>Tamaño máximo: 10 MB</li>
                </ul>
              </li>
              <li className="text-gray-700">
                <strong>Click en &quot;Subir Documento&quot;</strong> y espera a que se procese (30-60 segundos)
              </li>
            </ol>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h5 className="font-semibold text-green-900 mb-2">✓ Buenas prácticas:</h5>
            <ul className="space-y-1 text-sm text-green-800">
              <li>• Usa nombres de archivo descriptivos (ej: &quot;amura_precios_sep_2024.pdf&quot;)</li>
              <li>• Sube siempre la versión más reciente del documento</li>
              <li>• Elimina versiones anteriores si actualizas un documento</li>
              <li>• Asegúrate que el texto del PDF sea seleccionable (no imágenes escaneadas)</li>
              <li>• Llena todos los campos del formulario correctamente</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">¿Qué pasa durante el procesamiento?</h4>
            <p className="text-gray-700">El sistema:</p>
            <ul className="space-y-2">
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">1.</span>
                <span className="text-gray-700">Extrae el texto del documento</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">2.</span>
                <span className="text-gray-700">Limpia y organiza el contenido</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">3.</span>
                <span className="text-gray-700">Divide en fragmentos manejables</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">4.</span>
                <span className="text-gray-700">Genera representaciones vectoriales (embeddings)</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">5.</span>
                <span className="text-gray-700">Guarda en la base de datos vectorial</span>
              </li>
            </ul>
          </div>
        </div>
      )
    });
  }

  // Agregar más secciones comunes
  guideSections.push(
    {
      id: 'explorar-documentos',
      title: 'Explorar Documentos',
      icon: FileText,
      description: 'Busca y gestiona los documentos del sistema',
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Ver lista de documentos:</h4>
            <ol className="space-y-2 list-decimal list-inside">
              <li className="text-gray-700">
                Ve a <strong>&quot;Documentos&quot;</strong> en el menú lateral
              </li>
              <li className="text-gray-700">
                Usa los <strong>filtros</strong> para encontrar documentos específicos:
                <ul className="ml-6 mt-2 space-y-1 list-disc list-inside">
                  <li>Por zona</li>
                  <li>Por desarrollo</li>
                  <li>Por tipo de documento</li>
                  <li>Por búsqueda de texto</li>
                </ul>
              </li>
              <li className="text-gray-700">
                <strong>Click en un documento</strong> para ver detalles completos
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Información disponible:</h4>
            <p className="text-gray-700">Para cada documento puedes ver:</p>
            <ul className="space-y-2">
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Nombre y descripción</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Zona y desarrollo asociado</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Tipo de documento</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Fecha de carga y usuario que lo subió</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Estadísticas de uso (consultas que lo referencian)</span>
              </li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'mi-perfil',
      title: 'Mi Perfil',
      icon: User,
      description: 'Gestiona tu cuenta y configuración personal',
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Acceder a tu perfil:</h4>
            <ol className="space-y-2 list-decimal list-inside">
              <li className="text-gray-700">
                Click en <strong>&quot;Mi Perfil&quot;</strong> en el menú lateral
              </li>
              <li className="text-gray-700">
                O click en tu <strong>nombre/avatar</strong> en la esquina superior derecha
              </li>
            </ol>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Información de tu perfil:</h4>
            <ul className="space-y-2">
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Nombre y correo electrónico</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Rol y permisos</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Estadísticas personales (consultas, calificaciones)</span>
              </li>
              <li className="flex items-start">
                <span className="text-capital-gold mr-2">•</span>
                <span className="text-gray-700">Zonas y desarrollos a los que tienes acceso</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-capital-navy">Cambiar tu contraseña:</h4>
            <ol className="space-y-2 list-decimal list-inside">
              <li className="text-gray-700">En tu perfil, click en <strong>&quot;Cambiar Contraseña&quot;</strong></li>
              <li className="text-gray-700">Ingresa tu contraseña actual</li>
              <li className="text-gray-700">Ingresa tu nueva contraseña (mínimo 8 caracteres)</li>
              <li className="text-gray-700">Confirma tu nueva contraseña</li>
              <li className="text-gray-700">Click en &quot;Guardar&quot;</li>
            </ol>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h5 className="font-semibold text-yellow-900 mb-2 flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              Requisitos de contraseña:
            </h5>
            <ul className="space-y-1 text-sm text-yellow-800">
              <li>• Mínimo 8 caracteres</li>
              <li>• Al menos una letra mayúscula</li>
              <li>• Al menos una letra minúscula</li>
              <li>• Al menos un número</li>
              <li>• (Recomendado) Un carácter especial (@, #, $, etc.)</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'preguntas-frecuentes',
      title: 'Preguntas Frecuentes',
      icon: HelpCircle,
      description: 'Respuestas a las dudas más comunes',
      content: (
        <div className="space-y-4">
          <div className="space-y-4">
            <div>
              <h5 className="font-semibold text-capital-navy mb-2">
                ¿El asistente tiene acceso a internet?
              </h5>
              <p className="text-gray-700 text-sm">
                No. El asistente solo responde basándose en los documentos de Capital Plus. 
                Esto garantiza que toda la información sea oficial y aprobada por la empresa.
              </p>
            </div>

            <div>
              <h5 className="font-semibold text-capital-navy mb-2">
                ¿Puedo confiar en las respuestas?
              </h5>
              <p className="text-gray-700 text-sm">
                Sí, pero siempre verifica las fuentes citadas. El asistente indica de dónde 
                obtuvo cada información. Si algo parece incorrecto, califícalo para ayudarnos a mejorarlo.
              </p>
            </div>

            <div>
              <h5 className="font-semibold text-capital-navy mb-2">
                ¿Qué pasa si no encuentra información?
              </h5>
              <p className="text-gray-700 text-sm">
                Te dirá que no tiene suficiente información. Esto puede significar que:
              </p>
              <ul className="mt-2 ml-6 space-y-1 text-sm text-gray-700 list-disc list-inside">
                <li>La información no ha sido subida al sistema</li>
                <li>Está en un documento al que no tienes acceso</li>
                <li>Necesitas reformular tu pregunta</li>
              </ul>
            </div>

            <div>
              <h5 className="font-semibold text-capital-navy mb-2">
                ¿Quién puede ver mis consultas?
              </h5>
              <p className="text-gray-700 text-sm">
                Solo tú y los administradores del sistema. Las consultas se guardan para 
                mejorar el sistema, pero tu privacidad está protegida.
              </p>
            </div>

            <div>
              <h5 className="font-semibold text-capital-navy mb-2">
                ¿Cuánto tarda en procesarse un documento?
              </h5>
              <p className="text-gray-700 text-sm">
                Depende del tamaño:
              </p>
              <ul className="mt-2 ml-6 space-y-1 text-sm text-gray-700 list-disc list-inside">
                <li>Documentos pequeños (1-5 páginas): 10-30 segundos</li>
                <li>Documentos medianos (5-20 páginas): 30-90 segundos</li>
                <li>Documentos grandes (20+ páginas): 1-3 minutos</li>
              </ul>
            </div>

            <div>
              <h5 className="font-semibold text-capital-navy mb-2">
                ¿El asistente recuerda conversaciones anteriores?
              </h5>
              <p className="text-gray-700 text-sm">
                Actualmente no. Cada consulta es independiente. Si necesitas referirte a algo 
                anterior, menciona el contexto en tu nueva pregunta.
              </p>
            </div>
          </div>
        </div>
      )
    }
  );

  // Filtrar secciones según rol y búsqueda
  // Nota: si aún no conocemos el rol (userRole === null), mostramos todo para evitar "parpadeos" al cargar.
  const roleVisibleSections = guideSections.filter((section) => {
    if (!section.roles) return true;
    if (!userRole) return true;
    return section.roles.includes(userRole);
  });

  const filteredSections = roleVisibleSections.filter((section) =>
    section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-capital-navy flex items-center gap-2 sm:gap-3">
            <Book className="h-6 w-6 sm:h-8 sm:w-8 text-capital-gold flex-shrink-0" />
            <span>Guía de Usuario</span>
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2">
            Aprende a usar el Agente Capital Plus de forma efectiva
          </p>
        </div>
      </div>

      {/* Buscador */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar en la guía..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Información del usuario */}
      <Card className="bg-gradient-to-r from-capital-navy to-capital-navy/90">
        <CardContent className="pt-4 sm:pt-6 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-capital-gold flex items-center justify-center text-capital-navy text-xl sm:text-2xl font-bold flex-shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg sm:text-xl font-semibold truncate text-capital-gold">{userName}</h3>
              <p className="text-xs sm:text-sm text-white/80 break-words">
                Rol: {getRoleName(userRole)} • 
                {canUpload ? ' Puede subir documentos' : ' Solo consultas'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secciones de la guía */}
      <div className="space-y-4">
        {filteredSections.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                No se encontraron resultados para &quot;{searchTerm}&quot;
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.includes(section.id);

            return (
              <Card key={section.id} className="overflow-hidden">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full text-left"
                >
                  <CardHeader className="hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-capital-navy/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-capital-navy" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base sm:text-xl truncate">{section.title}</CardTitle>
                          <CardDescription className="text-xs sm:text-sm line-clamp-1">{section.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </button>
                {isExpanded && (
                  <CardContent className="border-t">
                    <div className="pt-4 sm:pt-6">
                      {section.content}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Footer de ayuda */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex items-start gap-2 sm:gap-3">
            <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-blue-900 mb-2 text-sm sm:text-base">¿Necesitas más ayuda?</h4>
              <p className="text-xs sm:text-sm text-blue-800">
                Si tienes problemas técnicos o preguntas adicionales, contacta a:
              </p>
              <ul className="mt-2 space-y-1 text-xs sm:text-sm text-blue-800">
                <li>• Tu supervisor directo</li>
                <li>• Soporte técnico: <a href="mailto:r.navarro@capitalplus.mx" className="underline break-all">r.navarro@capitalplus.mx</a></li>
                <li>• Administradores del sistema</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

