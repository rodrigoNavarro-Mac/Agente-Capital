/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - OAUTH CALLBACK (ZOHO)
 * =====================================================
 * Ruta de redireccion despues de que el usuario autoriza
 * la app en Zoho. Intercambia el codigo por access_token
 * y refresh_token y muestra el refresh_token para copiarlo
 * a .env / Vercel.
 *
 * URL: https://agente-capital.vercel.app/oauth/callback
 * Configura en Zoho API Console este mismo URI como
 * "Authorized Redirect URI".
 */

const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || '';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || '';
const ZOHO_REDIRECT_URI = process.env.ZOHO_REDIRECT_URI || '';

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function getTokenUrl(): string {
  let base = (ZOHO_ACCOUNTS_URL || '').trim().replace(/\/$/, '');
  const idx = base.indexOf('/oauth');
  if (idx !== -1) base = base.slice(0, idx);
  return `${base}/oauth/v2/token`;
}

async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const redirectUri = ZOHO_REDIRECT_URI || 'https://agente-capital.vercel.app/oauth/callback';
  const tokenUrl = getTokenUrl();

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });

  const data: TokenResponse = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      error: data.error || 'token_request_failed',
      error_description: data.error_description || `HTTP ${res.status}`,
    };
  }

  return data;
}

export default async function OAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; error_description?: string }>;
}) {
  const params = await searchParams;
  const code = params.code;
  const error = params.error;
  const errorDescription = params.error_description;

  // Usuario denego autorizacion o error de Zoho en la URL
  if (error) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '560px', margin: '48px auto', padding: '24px' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Error de autorizacion</h1>
        <p style={{ color: '#666' }}>
          {errorDescription || error}
        </p>
        <p style={{ marginTop: '16px', fontSize: '0.875rem' }}>
          <a href="/" style={{ color: '#2563eb' }}>Volver al inicio</a>
        </p>
      </div>
    );
  }

  if (!code) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '560px', margin: '48px auto', padding: '24px' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Falta codigo de autorizacion</h1>
        <p style={{ color: '#666' }}>
          Esta ruta es el callback de OAuth. Zoho debe redirigir aqui con <code>?code=...</code> despues de que el usuario autorice la aplicacion.
        </p>
        <p style={{ marginTop: '16px', fontSize: '0.875rem' }}>
          Configura en Zoho API Console el Redirect URI: <code style={{ background: '#f3f4f6', padding: '2px 6px' }}>https://agente-capital.vercel.app/oauth/callback</code>
        </p>
        <p style={{ marginTop: '16px' }}>
          <a href="/" style={{ color: '#2563eb' }}>Volver al inicio</a>
        </p>
      </div>
    );
  }

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '560px', margin: '48px auto', padding: '24px' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Configuracion incompleta</h1>
        <p style={{ color: '#666' }}>
          Configura <code>ZOHO_CLIENT_ID</code> y <code>ZOHO_CLIENT_SECRET</code> en las variables de entorno (por ejemplo en Vercel).
        </p>
        <p style={{ marginTop: '16px' }}>
          <a href="/" style={{ color: '#2563eb' }}>Volver al inicio</a>
        </p>
      </div>
    );
  }

  const tokenData = await exchangeCodeForTokens(code);

  if (tokenData.error) {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '560px', margin: '48px auto', padding: '24px' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Error al obtener tokens</h1>
        <p style={{ color: '#666' }}>
          {tokenData.error_description || tokenData.error}
        </p>
        <p style={{ marginTop: '16px', fontSize: '0.875rem' }}>
          Asegurate de que <code>ZOHO_REDIRECT_URI</code> sea exactamente <code>https://agente-capital.vercel.app/oauth/callback</code> (o la URL que uses) y que coincida con el Redirect URI configurado en Zoho.
        </p>
        <p style={{ marginTop: '16px' }}>
          <a href="/" style={{ color: '#2563eb' }}>Volver al inicio</a>
        </p>
      </div>
    );
  }

  const refreshToken = tokenData.refresh_token || '';

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '560px', margin: '48px auto', padding: '24px' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Autorizacion correcta</h1>
      <p style={{ color: '#666', marginBottom: '16px' }}>
        Copia el Refresh Token y agregalo a tu archivo <code>.env</code> o a las variables de entorno en Vercel como <code>ZOHO_REFRESH_TOKEN</code>.
      </p>
      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
        ZOHO_REFRESH_TOKEN
      </label>
      <textarea
        readOnly
        value={refreshToken}
        style={{
          width: '100%',
          minHeight: '80px',
          padding: '12px',
          fontFamily: 'monospace',
          fontSize: '0.8125rem',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          background: '#f9fafb',
        }}
      />
      <p style={{ marginTop: '16px', fontSize: '0.875rem', color: '#666' }}>
        <a href="/" style={{ color: '#2563eb' }}>Volver al inicio</a>
      </p>
    </div>
  );
}
