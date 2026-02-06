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

  // Headers de seguridad
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Content-Security-Policy básica (puede requerir ajustes según uso de scripts externos)
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://connect.facebook.net https://graph.facebook.com https://vercel.live; connect-src 'self' https://graph.facebook.com https://vercel.live; frame-src 'self' https://vercel.live; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:;",
          }
        ],
      },
    ];
  },
};

module.exports = nextConfig;
