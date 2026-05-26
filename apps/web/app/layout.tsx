import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Wholesale CRM',
  description: 'Personal wholesale real-estate CRM',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-gray-200 bg-white">
            <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
              <Link href="/" className="font-semibold text-gray-900 hover:text-gray-700">
                Wholesale CRM
              </Link>
              <Link
                href="/buy-boxes"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Buy Boxes
              </Link>
              <Link
                href="/replay"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Replay
              </Link>
            </nav>
          </header>
          <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
