import type { Metadata, Viewport } from 'next';
import { AuthGuard } from './components/auth-guard';
import { ServiceWorkerRegistration } from './components/service-worker-registration';
import './styles.css';

export const metadata: Metadata = {
  title: 'Hamiz Boutique',
  description: 'Private boutique order manager',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Hamiz Boutique',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#343930',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegistration />
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  );
}
