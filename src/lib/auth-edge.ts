
import { jwtVerify } from 'jose';

// Configuración
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface JWTPayload {
    userId: number;
    email: string;
    role?: string;
    [key: string]: any;
}

/**
 * Verifica y decodifica un token JWT de acceso (compatible con Edge Runtime)
 */
export async function verifyAccessTokenEdge(token: string): Promise<JWTPayload | null> {
    try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        return payload as JWTPayload;
    } catch {
        return null;
    }
}

/**
 * Extrae el token del header Authorization
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}
