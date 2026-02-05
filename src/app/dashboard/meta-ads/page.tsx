import { RoleGuard } from '@/components/auth/role-guard';
import { Card } from '@/components/ui/card';
import { AuditLogsTable } from './components/audit-logs-table';
import { EngineConfigCard } from './components/engine-config-card';
import { ConnectMetaButton } from './components/connect-button';

export default function MetaAdsDashboard() {
    return (
        <RoleGuard allowedRoles={['admin']}>
            <div className="space-y-6">
                <h1 className="text-2xl font-bold text-[#153356]">Meta Ads Dashboard</h1>

                {/* Top Row: Welcome & Config */}
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="p-6">
                        <h2 className="text-lg font-semibold mb-2">Bienvenido al Panel de Control</h2>
                        <p className="text-gray-600 mb-4">
                            Este módulo es accesible únicamente para administradores.
                            El sistema evalúa automáticamente las reglas definidas.
                        </p>
                        <ConnectMetaButton />
                    </Card>

                    <EngineConfigCard />
                </div>

                <AuditLogsTable />
            </div>
        </RoleGuard>
    );
}
