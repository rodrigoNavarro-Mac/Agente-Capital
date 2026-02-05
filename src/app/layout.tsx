import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { MetaSdkProvider } from '@/lib/modules/meta-ads/infrastructure/meta/sdk/provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Capital Plus AI Agent',
  description: 'Sistema Interno de IA para Capital Plus',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.variable} ${montserrat.variable} ${inter.className}`}>
        {children}
        <Toaster />
        <MetaSdkProvider />
      </body>
    </html>
  );
}
