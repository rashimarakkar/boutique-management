import type { Metadata } from 'next';
import { AuthGuard } from './components/auth-guard';
import './styles.css';
export const metadata: Metadata = { title: 'Hamiz Boutique', description: 'Private boutique order manager' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AuthGuard>{children}</AuthGuard></body></html>; }
