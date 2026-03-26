import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Eddie - EDI Platform',
  description: 'Enterprise EDI processing platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold text-gray-900">Eddie</h1>
            <div className="flex gap-4 text-sm">
              <a href="/" className="text-gray-600 hover:text-gray-900">Dashboard</a>
              <a href="/trading-partners" className="text-gray-600 hover:text-gray-900">Trading Partners</a>
              <a href="/sftp-connections" className="text-gray-600 hover:text-gray-900">SFTP</a>
              <a href="/mappings" className="text-gray-600 hover:text-gray-900">Mappings</a>
              <a href="/downstream-apis" className="text-gray-600 hover:text-gray-900">APIs</a>
              <a href="/transactions" className="text-gray-600 hover:text-gray-900">Transactions</a>
            </div>
          </div>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
