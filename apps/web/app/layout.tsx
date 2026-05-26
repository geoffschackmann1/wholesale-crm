import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { SwRegister } from './sw-register';
import { getUndismissedCount } from './actions/inbox';

export const metadata: Metadata = {
  title: 'Wholesale CRM',
  description: 'Personal wholesale real-estate CRM',
  manifest: '/manifest.json',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const inboxCount = await getUndismissedCount();

  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#111827" />
      </head>
      <body>
        <SwRegister />
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-gray-200 bg-white">
            <nav className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
              <Link href="/" className="font-semibold text-gray-900 hover:text-gray-700">
                Wholesale CRM
              </Link>
              <Link
                href="/inbox"
                className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5"
              >
                Inbox
                {inboxCount > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-xs font-semibold bg-gray-900 text-white">
                    {inboxCount > 99 ? '99+' : inboxCount}
                  </span>
                )}
              </Link>
              <Link
                href="/dfd"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                DFD
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
