'use client';

import { useEffect, useState } from 'react';
import { getEngineConfig } from '../actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

interface UIConfig {
    versionId: string;
    rules: {
        id: string;
        name: string;
        description: string;
        version: string;
    }[];
}

export function EngineConfigCard() {
    const [config, setConfig] = useState<UIConfig | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchConfig() {
            try {
                const data = await getEngineConfig();
                setConfig(data);
            } catch (error) {
                console.error('Failed to load config', error);
            } finally {
                setLoading(false);
            }
        }
        fetchConfig();
    }, []);

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Configuración Activa</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-20 animate-pulse bg-muted rounded-md" />
                </CardContent>
            </Card>
        );
    }

    if (!config) return null;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                    Configuración del Motor
                </CardTitle>
                <Badge variant="secondary" className="font-mono">
                    {config.versionId}
                </Badge>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-3">Reglas Activas</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                            {config.rules.map((rule) => (
                                <div
                                    key={rule.id}
                                    className="flex items-start justify-between p-3 rounded-md border bg-card/50 hover:bg-muted/30 transition-colors"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium leading-none">{rule.name}</p>
                                            <Badge variant="outline" className="text-[10px] h-5 px-1">
                                                v{rule.version}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {rule.description}
                                        </p>
                                    </div>

                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="ghost" className="h-6 w-6 p-0 hover:bg-transparent">
                                                <Info className="h-4 w-4 text-muted-foreground/50 hover:text-primary cursor-help" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80">
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="text-sm font-semibold">{rule.name}</h4>
                                                    <span className="text-[10px] font-mono text-muted-foreground">{rule.id}</span>
                                                </div>
                                                <p className="text-sm">
                                                    {rule.description}
                                                </p>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
