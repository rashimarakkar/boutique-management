import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Hamiz Boutique', description: 'Private boutique order manager' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
