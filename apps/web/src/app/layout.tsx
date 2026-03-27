import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutDashboard, Users, Server, GitBranch, Plug, ScrollText } from 'lucide-react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Eddie - EDI Platform',
  description: 'Enterprise EDI processing platform',
};

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/trading-partners', label: 'Trading Partners', icon: Users },
  { href: '/sftp-connections', label: 'SFTP Connections', icon: Server },
  { href: '/mappings', label: 'Mappings', icon: GitBranch },
  { href: '/downstream-apis', label: 'Downstream APIs', icon: Plug },
  { href: '/transactions', label: 'Transactions', icon: ScrollText },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex">
        <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
          <div className="p-6 border-b border-slate-700">
            <h1 className="text-xl font-bold">Eddie</h1>
            <p className="text-xs text-slate-400 mt-1">EDI Platform</p>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex-1 flex flex-col min-h-screen">
          <header className="h-14 border-b bg-white flex items-center px-6">
            <span className="text-sm text-muted-foreground">Organization</span>
          </header>
          <main className="flex-1 p-6 bg-slate-50">{children}</main>
        </div>
      </body>
    </html>
  );
}
