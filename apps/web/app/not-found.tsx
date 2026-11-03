import Link from 'next/link';

export default function NotFound() {
  return <main style={{ maxWidth: 560, margin: '80px auto', padding: 24, textAlign: 'center' }}>
    <p className="eyebrow">HAMIZ BOUTIQUE</p>
    <h1 style={{ margin: '12px 0' }}>That page is not available.</h1>
    <Link href="/" style={{ color: '#665848' }}>Return to dashboard</Link>
  </main>;
}
