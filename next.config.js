/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuración para manejar archivos grandes en uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Webpack config para pdf-parse, canvas y OCR
  webpack: (config, { isServer }) => {
    // Solo para el servidor (API routes)
    if (isServer) {
      // Excluir archivos binarios nativos (.node) del bundle
      config.module = config.module || {};
      config.module.rules = config.module.rules || [];
      config.module.rules.push({
        test: /\.node$/,
        use: 'node-loader',
      });
      
      // Marcar librerías problemáticas como externas para que se resuelvan en runtime
      // Esto evita que webpack intente bundlearlas
      config.externals = config.externals || [];
      config.externals.push('canvas');
      config.externals.push('pdfjs-dist');
      
      // Configurar resolve para compatibilidad
      config.resolve.alias = config.resolve.alias || {};
      config.resolve.fallback = config.resolve.fallback || {};
    }
    
    // Para el cliente, deshabilitar canvas
    if (!isServer) {
      config.resolve.alias.canvas = false;
    }
    
    config.resolve.alias.encoding = false;
    
    return config;
  },
};

module.exports = nextConfig;
