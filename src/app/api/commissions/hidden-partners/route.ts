import { NextRequest, NextResponse } from 'next/server';
import { getHiddenPartners, addHiddenPartner, removeHiddenPartner } from '@/lib/db/commission-db';
import { decodeAccessToken } from '@/lib/auth/auth';

export async function GET(_request: NextRequest) {
    try {
        const hiddenPartners = await getHiddenPartners();
        return NextResponse.json({ success: true, data: hiddenPartners });
    } catch (error) {
        console.error('Error fetching hidden partners:', error);
        return NextResponse.json(
            { success: false, error: 'Error al obtener socios ocultos' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.split(' ')[1];

        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }

        const payload = decodeAccessToken(token);
        if (!payload?.userId) {
            return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 });
        }

        const body = await request.json();
        const { socio_name, description } = body;

        if (!socio_name) {
            return NextResponse.json(
                { success: false, error: 'Nombre del socio es requerido' },
                { status: 400 }
            );
        }

        await addHiddenPartner(socio_name, description, payload.userId);

        return NextResponse.json({
            success: true,
            message: 'Socio ocultado correctamente'
        });
    } catch (error) {
        console.error('Error adding hidden partner:', error);
        return NextResponse.json(
            { success: false, error: 'Error al ocultar socio' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.split(' ')[1];

        if (!token) {
            return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const socio_name = searchParams.get('socio_name');

        if (!socio_name) {
            return NextResponse.json(
                { success: false, error: 'Nombre del socio es requerido' },
                { status: 400 }
            );
        }

        await removeHiddenPartner(socio_name);

        return NextResponse.json({
            success: true,
            message: 'Socio restaurado correctamente'
        });
    } catch (error) {
        console.error('Error removing hidden partner:', error);
        return NextResponse.json(
            { success: false, error: 'Error al restaurar socio' },
            { status: 500 }
        );
    }
}
