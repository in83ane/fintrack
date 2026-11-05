"use client";

import Link from 'next/link';
import { LayoutDashboard, Briefcase, ReceiptText, ArrowRightLeft, Menu } from 'lucide-react';
import { useNavigationPathname } from './PageTransition';
import { useApp } from '@/src/context/AppContext';

const NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { path: '/portfolio', icon: Briefcase, key: 'portfolio' },
  { path: '/ledger', icon: ReceiptText, key: 'ledger' },
  { path: '/cashflow', icon: ArrowRightLeft, key: 'cashflow' },
];

export function BottomNav({ onOpenMenu, menuOpen = false }: { onOpenMenu: () => void; menuOpen?: boolean }) {
  const pathname = useNavigationPathname();
  const { t, language } = useApp();
  return <nav aria-label={language === 'th' ? 'เมนูมือถือ' : 'Mobile navigation'} className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background lg:hidden">
    <div className="mx-auto flex max-w-lg items-stretch">
      {NAV_ITEMS.map(({ path, icon: Icon, key }) => {
        const active = pathname === path || pathname.startsWith(`${path}/`);
        return <Link key={path} href={path} aria-current={active ? 'page' : undefined} className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] ${active ? 'text-primary' : 'text-muted'}`}>
          <Icon size={20} strokeWidth={active ? 2.2 : 1.7}/><span className="max-w-full truncate">{t(key)}</span>
        </Link>;
      })}
      <button type="button" onClick={onOpenMenu} aria-expanded={menuOpen} aria-controls="mobile-navigation" className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] text-muted"><Menu size={20}/><span>{language === 'th' ? 'เมนู' : 'Menu'}</span></button>
    </div>
  </nav>;
}
