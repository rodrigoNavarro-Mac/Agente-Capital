/**
 * Componente para renderizar markdown con soporte completo
 * Incluye: encabezados, listas, negritas, cursivas, enlaces, tablas, código, etc.
 * También procesa citas de fuentes en formato [1], [2], etc. y las hace interactivas
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  sources?: Array<{
    filename: string;
    page: number;
    chunk: number;
    relevance_score: number;
    text_preview: string;
  }>;
  onCitationClick?: (sourceIndex: number) => void;
}

// Tipos para las partes del texto procesado
type TextPart = {
  type: 'text';
  content: string;
};

type CitationPart = {
  type: 'citation';
  content: string;
  index: number;
};

type TextPartUnion = TextPart | CitationPart;

// Componente para renderizar texto con citas procesadas
function TextWithCitations({ 
  text, 
  sources, 
  onCitationClick 
}: { 
  text: string; 
  sources?: MarkdownRendererProps['sources'];
  onCitationClick?: (sourceIndex: number) => void;
}) {
  // Procesar el texto para encontrar y renderizar citas
  const parts = useMemo((): TextPartUnion[] => {
    const regex = /\[(\d+)\]/g;
    const parts: TextPartUnion[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Agregar texto antes de la cita
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      
      // Agregar la cita
      const citationNum = parseInt(match[1]);
      const sourceIndex = citationNum - 1; // Convertir a índice 0-based
      parts.push({ 
        type: 'citation', 
        content: match[0], 
        index: sourceIndex 
      });
      
      lastIndex = regex.lastIndex;
    }
    
    // Agregar texto restante
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.substring(lastIndex) });
    }
    
    return parts.length > 0 ? parts : [{ type: 'text', content: text }];
  }, [text]);

  // Type guard para verificar si es una cita
  const isCitationPart = (part: TextPartUnion): part is CitationPart => {
    return part.type === 'citation';
  };

  return (
    <>
      {parts.map((part, idx) => {
        if (isCitationPart(part)) {
          const sourceIndex = part.index;
          const hasSource = sources && sourceIndex >= 0 && sourceIndex < sources.length;
          
          if (hasSource && onCitationClick) {
            return (
              <button
                key={idx}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCitationClick(sourceIndex);
                }}
                className="text-primary underline hover:text-primary/80 font-medium mx-0.5 cursor-pointer"
                title={`Ver fuente ${sourceIndex + 1}: ${sources[sourceIndex].filename}`}
              >
                {part.content}
              </button>
            );
          } else {
            return (
              <span key={idx} className="text-muted-foreground font-medium mx-0.5">
                {part.content}
              </span>
            );
          }
        }
        return <span key={idx}>{part.content}</span>;
      })}
    </>
  );
}

export function MarkdownRenderer({ content, className, sources, onCitationClick }: MarkdownRendererProps) {
  return (
    <div className={cn('text-sm prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Encabezados
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-4 mb-2 text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold mt-3 mb-2 text-foreground">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-3 mb-1 text-foreground">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-xs font-semibold mt-2 mb-1 text-foreground">{children}</h6>
          ),

          // Párrafos - procesar citas
          p: ({ children }) => {
            // Si children es un string, procesar citas
            if (typeof children === 'string') {
              return (
                <p className="my-2 leading-relaxed">
                  <TextWithCitations 
                    text={children} 
                    sources={sources} 
                    onCitationClick={onCitationClick}
                  />
                </p>
              );
            }
            // Si children es un array, buscar strings y procesarlos
            if (Array.isArray(children)) {
              return (
                <p className="my-2 leading-relaxed">
                  {children.map((child, idx) => {
                    if (typeof child === 'string') {
                      return (
                        <TextWithCitations 
                          key={idx}
                          text={child} 
                          sources={sources} 
                          onCitationClick={onCitationClick}
                        />
                      );
                    }
                    return <span key={idx}>{child}</span>;
                  })}
                </p>
              );
            }
            return <p className="my-2 leading-relaxed">{children}</p>;
          },

          // Listas no ordenadas
          ul: ({ children }) => (
            <ul className="list-disc list-inside my-2 space-y-1 ml-4">{children}</ul>
          ),
          // Listas ordenadas
          ol: ({ children }) => (
            <ol className="list-decimal list-inside my-2 space-y-1 ml-4">{children}</ol>
          ),
          // Items de lista - también procesar citas
          li: ({ children }) => {
            if (typeof children === 'string') {
              return (
                <li className="ml-2">
                  <TextWithCitations 
                    text={children} 
                    sources={sources} 
                    onCitationClick={onCitationClick}
                  />
                </li>
              );
            }
            if (Array.isArray(children)) {
              return (
                <li className="ml-2">
                  {children.map((child, idx) => {
                    if (typeof child === 'string') {
                      return (
                        <TextWithCitations 
                          key={idx}
                          text={child} 
                          sources={sources} 
                          onCitationClick={onCitationClick}
                        />
                      );
                    }
                    return <span key={idx}>{child}</span>;
                  })}
                </li>
              );
            }
            return <li className="ml-2">{children}</li>;
          },

          // Texto en negrita - también procesar citas
          strong: ({ children }) => {
            if (typeof children === 'string') {
              return (
                <strong className="font-semibold text-foreground">
                  <TextWithCitations 
                    text={children} 
                    sources={sources} 
                    onCitationClick={onCitationClick}
                  />
                </strong>
              );
            }
            return <strong className="font-semibold text-foreground">{children}</strong>;
          },
          // Texto en cursiva - también procesar citas
          em: ({ children }) => {
            if (typeof children === 'string') {
              return (
                <em className="italic">
                  <TextWithCitations 
                    text={children} 
                    sources={sources} 
                    onCitationClick={onCitationClick}
                  />
                </em>
              );
            }
            return <em className="italic">{children}</em>;
          },

          // Enlaces
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80 transition-colors"
            >
              {children}
            </a>
          ),

          // Código inline
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground">
                {children}
              </code>
            ) : (
              <code className={className}>{children}</code>
            );
          },

          // Bloques de código
          pre: ({ children }) => (
            <pre className="bg-muted p-3 rounded-md overflow-x-auto my-2 text-xs border border-border">
              {children}
            </pre>
          ),

          // Citas/Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary pl-4 my-2 italic text-muted-foreground">
              {children}
            </blockquote>
          ),

          // Líneas horizontales
          hr: () => <hr className="my-4 border-border" />,

          // Tablas - formato mejorado
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-md border border-border">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50 border-b border-border">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-border transition-colors hover:bg-muted/30">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="h-10 px-4 text-left align-middle font-semibold text-foreground bg-muted/50 first:rounded-tl-md last:rounded-tr-md">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 align-middle text-foreground">
              {children}
            </td>
          ),

          // Imágenes (opcional, por si acaso)
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt}
              className="max-w-full h-auto rounded-md my-2"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

