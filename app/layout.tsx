import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hearthstone Hub',
  description: 'Make a more informed NYC apartment decision.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/">Hearthstone Hub</Link>
          <nav aria-label="Main navigation">
            <Link href="/">Home</Link>
            <Link href="/account">My account</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
