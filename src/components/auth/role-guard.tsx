'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/types/documents';
import { Loading } from '@/components/loading';

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRoles: UserRole[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
    const router = useRouter();
    const [authorized, setAuthorized] = useState<boolean | null>(null);

    useEffect(() => {
        // 1. Check local storage for user data (consistent with Sidebar)
        const userStr = localStorage.getItem('user');
        let userRole: UserRole | null = null;

        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                userRole = user.role || null;
            } catch (e) {
                console.error('Error parsing user data in RoleGuard', e);
            }
        } else {
            // Fallback: Try decoding token if user object missing (optional, but good backup)
            const token = localStorage.getItem('accessToken');
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    userRole = payload.role || null;
                } catch (e) {
                    console.error('Error decoding token in RoleGuard', e);
                }
            }
        }

        if (userRole && allowedRoles.includes(userRole)) {
            setAuthorized(true);
        } else {
            setAuthorized(false);
            // Redirect to dashboard if unauthorized
            router.push('/dashboard');
        }
    }, [allowedRoles, router]);

    if (authorized === null) {
        return (
            <div className="flex justify-center items-center h-full min-h-[50vh]">
                <Loading />
            </div>
        );
    }

    if (!authorized) {
        return null; // Will redirect in useEffect
    }

    return <>{children}</>;
}
