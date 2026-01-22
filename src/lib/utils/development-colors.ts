/**
 * Colores personalizados por desarrollo para gráficas y elementos visuales
 * Cada desarrollo tiene su propia paleta de colores
 */

export interface DevelopmentColorPalette {
  primary: string;        // Color principal
  secondary: string;      // Color secundario
  accent: string;         // Color de acento
  success: string;         // Color para indicadores positivos
  warning: string;         // Color para advertencias
  danger: string;          // Color para indicadores negativos
  gradient: string[];      // Array de colores para gradientes
  chartColors: string[];   // Array de colores para gráficas múltiples
}

// Paleta de colores por defecto (cuando no hay desarrollo seleccionado o es "all")
const DEFAULT_COLORS: DevelopmentColorPalette = {
  primary: '#8884d8',
  secondary: '#82ca9d',
  accent: '#ffc658',
  success: '#82ca9d',
  warning: '#ffc658',
  danger: '#ff7300',
  gradient: ['#8884d8', '#82ca9d', '#ffc658'],
  chartColors: ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0'],
};

// Paletas de colores personalizadas por desarrollo
const DEVELOPMENT_COLORS: Record<string, DevelopmentColorPalette> = {
  // Yucatán
  'amura': {
    primary: '#4A90E2',      // Azul vibrante
    secondary: '#7B68EE',    // Azul púrpura
    accent: '#FFD700',       // Dorado
    success: '#50C878',      // Verde esmeralda
    warning: '#FFA500',       // Naranja
    danger: '#FF6B6B',       // Rojo coral
    gradient: ['#4A90E2', '#7B68EE', '#FFD700'],
    chartColors: ['#4A90E2', '#7B68EE', '#FFD700', '#50C878', '#FFA500', '#FF6B6B'],
  },
  'm2': {
    primary: '#2E86AB',      // Azul océano
    secondary: '#A23B72',    // Magenta
    accent: '#F18F01',       // Naranja dorado
    success: '#06A77D',      // Verde turquesa
    warning: '#F77F00',       // Naranja oscuro
    danger: '#D62828',       // Rojo
    gradient: ['#2E86AB', '#A23B72', '#F18F01'],
    chartColors: ['#2E86AB', '#A23B72', '#F18F01', '#06A77D', '#F77F00', '#D62828'],
  },
  'alya': {
    primary: '#6C5CE7',      // Púrpura
    secondary: '#00B894',    // Verde menta
    accent: '#FDCB6E',       // Amarillo
    success: '#00B894',      // Verde menta
    warning: '#E17055',      // Coral
    danger: '#D63031',       // Rojo
    gradient: ['#6C5CE7', '#00B894', '#FDCB6E'],
    chartColors: ['#6C5CE7', '#00B894', '#FDCB6E', '#E17055', '#D63031', '#A29BFE'],
  },
  'c2b': {
    primary: '#0984E3',      // Azul cielo
    secondary: '#00B894',    // Verde esmeralda
    accent: '#FDCB6E',       // Amarillo
    success: '#00B894',      // Verde esmeralda
    warning: '#E17055',      // Coral
    danger: '#D63031',       // Rojo
    gradient: ['#0984E3', '#00B894', '#FDCB6E'],
    chartColors: ['#0984E3', '#00B894', '#FDCB6E', '#E17055', '#D63031', '#74B9FF'],
  },
  'c2a': {
    primary: '#00B894',      // Verde esmeralda
    secondary: '#0984E3',    // Azul cielo
    accent: '#FDCB6E',       // Amarillo
    success: '#00B894',      // Verde esmeralda
    warning: '#E17055',      // Coral
    danger: '#D63031',       // Rojo
    gradient: ['#00B894', '#0984E3', '#FDCB6E'],
    chartColors: ['#00B894', '#0984E3', '#FDCB6E', '#E17055', '#D63031', '#55EFC4'],
  },
  'd1a': {
    primary: '#A29BFE',      // Púrpura claro
    secondary: '#FD79A8',    // Rosa
    accent: '#FDCB6E',       // Amarillo
    success: '#00B894',      // Verde esmeralda
    warning: '#E17055',      // Coral
    danger: '#D63031',       // Rojo
    gradient: ['#A29BFE', '#FD79A8', '#FDCB6E'],
    chartColors: ['#A29BFE', '#FD79A8', '#FDCB6E', '#00B894', '#E17055', '#D63031'],
  },
  
  // Puebla
  '777': {
    primary: '#E17055',      // Coral
    secondary: '#FDCB6E',    // Amarillo
    accent: '#00B894',       // Verde esmeralda
    success: '#00B894',      // Verde esmeralda
    warning: '#FDCB6E',      // Amarillo
    danger: '#D63031',       // Rojo
    gradient: ['#E17055', '#FDCB6E', '#00B894'],
    chartColors: ['#E17055', '#FDCB6E', '#00B894', '#0984E3', '#D63031', '#A29BFE'],
  },
  '111': {
    primary: '#D63031',      // Rojo
    secondary: '#E17055',    // Coral
    accent: '#FDCB6E',      // Amarillo
    success: '#00B894',      // Verde esmeralda
    warning: '#FDCB6E',      // Amarillo
    danger: '#D63031',       // Rojo
    gradient: ['#D63031', '#E17055', '#FDCB6E'],
    chartColors: ['#D63031', '#E17055', '#FDCB6E', '#00B894', '#0984E3', '#A29BFE'],
  },
  'qroo': {
    primary: '#0984E3',      // Azul cielo
    secondary: '#00B894',     // Verde esmeralda
    accent: '#FDCB6E',       // Amarillo
    success: '#00B894',      // Verde esmeralda
    warning: '#FDCB6E',      // Amarillo
    danger: '#D63031',       // Rojo
    gradient: ['#0984E3', '#00B894', '#FDCB6E'],
    chartColors: ['#0984E3', '#00B894', '#FDCB6E', '#E17055', '#D63031', '#74B9FF'],
  },
  
  // Quintana Roo
  'fuego': {
    primary: '#E17055',      // Coral (fuego)
    secondary: '#FDCB6E',    // Amarillo (llama)
    accent: '#D63031',      // Rojo (fuego intenso)
    success: '#00B894',      // Verde esmeralda
    warning: '#FDCB6E',      // Amarillo
    danger: '#D63031',       // Rojo
    gradient: ['#E17055', '#FDCB6E', '#D63031'],
    chartColors: ['#E17055', '#FDCB6E', '#D63031', '#00B894', '#0984E3', '#A29BFE'],
  },
  'hazul': {
    primary: '#0984E3',      // Azul cielo
    secondary: '#74B9FF',     // Azul claro
    accent: '#00B894',       // Verde esmeralda
    success: '#00B894',      // Verde esmeralda
    warning: '#FDCB6E',      // Amarillo
    danger: '#D63031',       // Rojo
    gradient: ['#0984E3', '#74B9FF', '#00B894'],
    chartColors: ['#0984E3', '#74B9FF', '#00B894', '#FDCB6E', '#E17055', '#D63031'],
  },
};

/**
 * Obtiene la paleta de colores para un desarrollo específico
 * @param desarrollo - Nombre del desarrollo (case-insensitive)
 * @returns Paleta de colores del desarrollo o paleta por defecto
 */
export function getDevelopmentColors(desarrollo: string | null | undefined): DevelopmentColorPalette {
  if (!desarrollo || desarrollo === 'all' || desarrollo === '') {
    return DEFAULT_COLORS;
  }
  
  // Buscar el desarrollo (case-insensitive)
  const desarrolloKey = Object.keys(DEVELOPMENT_COLORS).find(
    key => key.toLowerCase() === desarrollo.toLowerCase()
  );
  
  if (desarrolloKey) {
    return DEVELOPMENT_COLORS[desarrolloKey];
  }
  
  // Si no se encuentra, devolver colores por defecto
  return DEFAULT_COLORS;
}

/**
 * Obtiene un color específico de la paleta del desarrollo
 * @param desarrollo - Nombre del desarrollo
 * @param colorKey - Clave del color ('primary', 'secondary', etc.)
 * @returns Color hexadecimal
 */
export function getDevelopmentColor(
  desarrollo: string | null | undefined,
  colorKey: keyof DevelopmentColorPalette
): string {
  const palette = getDevelopmentColors(desarrollo);
  return palette[colorKey] as string;
}

/**
 * Obtiene un color del array de colores de gráficas según el índice
 * @param desarrollo - Nombre del desarrollo
 * @param index - Índice del color (se aplica módulo si es mayor al array)
 * @returns Color hexadecimal
 */
export function getChartColor(desarrollo: string | null | undefined, index: number): string {
  const palette = getDevelopmentColors(desarrollo);
  return palette.chartColors[index % palette.chartColors.length];
}

