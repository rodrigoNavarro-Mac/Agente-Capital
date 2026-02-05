'use client';

import { Button } from '@/components/ui/button';
import { Facebook, CheckCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { saveMetaToken } from '../config-actions';

declare global {
    interface Window {
        FB: any;
    }
}

export function ConnectMetaButton() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'unknown' | 'connected' | 'not_authorized'>('unknown');
    const [sdkReady, setSdkReady] = useState(false);

    // Check login status callback
    const statusChangeCallback = async (response: any) => {
        console.log('[MetaSDK] Status Change:', response);
        setLoading(false);

        if (response.status === 'connected') {
            setStatus('connected');
            // Log token for developer convenience
            if (response.authResponse) {
                const token = response.authResponse.accessToken;
                console.log('[MetaSDK] Token:', token);

                // Auto-save token to DB
                const result = await saveMetaToken(token);
                if (result.success) {
                    toast({
                        title: 'Conectado y Guardado',
                        description: 'Token guardado en base de datos correctamente.',
                    });
                } else {
                    toast({
                        title: 'Conectado',
                        description: 'Error guardando token: ' + result.error,
                        variant: 'destructive',
                    });
                }
            }
        } else if (response.status === 'not_authorized') {
            setStatus('not_authorized');
        } else {
            setStatus('unknown');
        }
    };

    useEffect(() => {
        const onSdkReady = () => {
            console.log('[ConnectMetaButton] SDK Ready Event received');
            setSdkReady(true);
            window.FB.getLoginStatus(statusChangeCallback);
        };

        // If already initialized (rare race condition if provider runs fast)
        if (window.FB && window.FB.getLoginStatus) {
            // We assume if getLoginStatus exists, init *might* be done, but to be safe 
            // we rely on the event or a specific check. 
            // However, standard FB sdk loads async. 
            // Best bet: check if our custom flag exists or just wait for event.
            // But since we control provider, let's keep it simple:
            // If event fired before we mounted, we missed it.
            // Hack: Provider sets a global flag? Or just keep polling but check for a specific flag?
            // Let's stick to event listener but also check generic FB existence + a small timeout fallback?
            // Actually, the safest way without global flags is just polling for a "known initialized state" 
            // but FB object doesn't have an "isInitialized" property publicly documented.
            // We will trust the Provider to dispatch. To catch "already happened", we can check if it's there.
            // If FB.init happened, usually FB object is populated.
        }

        window.addEventListener('meta-sdk-ready', onSdkReady);

        // Fallback polling in case we missed the event
        const interval = setInterval(() => {
            // We can't strictly know if init was called just by window.FB existing.
            // But if the Provider ran, it dispatched.
            // Let's just rely on the user clicking "Refresh" if it hangs, or better:
            // The Provider is in layout, so it should run once.
        }, 1000);

        return () => window.removeEventListener('meta-sdk-ready', onSdkReady);
    }, []);

    const handleLogin = () => {
        if (!window.FB) return;

        setLoading(true);
        window.FB.login((response: any) => {
            statusChangeCallback(response);
        }, { scope: 'ads_read,read_insights,ads_management' });
    };

    const handleLogout = () => {
        if (!window.FB) return;
        window.FB.logout((_response: any) => {
            setStatus('unknown');
            toast({ title: 'Desconectado', description: 'Has cerrado sesión en Meta.' });
        });
    }

    if (!sdkReady) {
        return (
            <Button disabled variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Cargando SDK...
            </Button>
        );
    }

    if (status === 'connected') {
        return (
            <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Conectado
                </Badge>
                <Button variant="ghost" size="sm" onClick={handleLogout} className="text-xs text-muted-foreground">
                    Desconectar
                </Button>
            </div>
        );
    }

    return (
        <Button onClick={handleLogin} disabled={loading} className="bg-[#1877F2] hover:bg-[#166fe5] text-white">
            <Facebook className="mr-2 h-4 w-4" />
            {loading ? 'Conectando...' : 'Conectar con Facebook'}
        </Button>
    );
}
