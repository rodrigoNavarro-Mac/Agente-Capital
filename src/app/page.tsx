'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Verificar si hay token en localStorage
    const token = localStorage.getItem('accessToken');
    
    if (token) {
      // Si hay token, redirigir al dashboard
      router.push('/dashboard');
    } else {
      // Si no hay token, redirigir al login
      router.push('/login');
    }
  }, [router]);

  return null;
}
