'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogIn, Building2 } from 'lucide-react';
import { login } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast({
        title: 'Error',
        description: 'Por favor completa todos los campos',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await login(email, password);
      
      // Verificar que la respuesta tenga los datos necesarios
      if (!response || !response.accessToken || !response.user) {
        throw new Error('Respuesta inválida del servidor');
      }
      
      // Guardar tokens en localStorage
      localStorage.setItem('accessToken', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));

      toast({
        title: 'Bienvenido',
        description: `Hola, ${response.user.name}`,
      });

      // Redirigir al dashboard
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Error en login:', error);
      toast({
        title: 'Error al iniciar sesión',
        description: error instanceof Error ? error.message : 'Credenciales inválidas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 p-3 sm:p-4">
      {/* Patrón sutil de fondo */}
      <div className="absolute inset-0 opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgb(15 23 42) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }}></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo/Header profesional */}
        <div className="text-center mb-6 sm:mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-capital-navy rounded-lg mb-4 sm:mb-6 shadow-lg">
            <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-capital-gold" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-capital-navy mb-2 tracking-tight">
            Capital Plus
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 font-medium">Agente de IA</p>
        </div>

        {/* Login Card profesional */}
        <Card className="shadow-xl border border-gray-200">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl sm:text-2xl font-semibold text-capital-navy">
              Iniciar Sesión
            </CardTitle>
            <CardDescription className="text-sm text-gray-600">
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Correo electrónico
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@capitalplus.com"
                  disabled={loading}
                  required
                  className="h-11 border-gray-300 focus:border-capital-navy focus:ring-capital-navy"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  required
                  className="h-11 border-gray-300 focus:border-capital-navy focus:ring-capital-navy"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-capital-navy hover:bg-capital-navy/90 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Iniciar Sesión
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 sm:mt-6 text-center">
              <a
                href="/forgot-password"
                className="text-xs sm:text-sm text-capital-navy hover:text-capital-navy/80 font-medium hover:underline transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Footer profesional */}
        <p className="text-center text-xs text-gray-500 mt-6 sm:mt-8">
          © 2024 Capital Plus. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}

