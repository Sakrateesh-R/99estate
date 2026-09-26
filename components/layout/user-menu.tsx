'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Bell,
  Building2,
  ChevronDown,
  Heart,
  Inbox,
  LayoutDashboard,
  LogOut,
  Shield,
  User2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/lib/auth/actions';

export type UserMenuProfile = {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
};

const ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/properties', label: 'My properties', icon: Building2 },
  { href: '/dashboard/leads', label: 'Enquiries', icon: Inbox },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/saved', label: 'Saved', icon: Heart },
  { href: '/dashboard/profile', label: 'Profile', icon: User2 },
];

export function UserMenu({ profile }: { profile: UserMenuProfile }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initial = (profile.fullName ?? profile.email).trim().charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-ink-100"
      >
        {profile.avatarUrl ? (
          <Image
            src={profile.avatarUrl}
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-full object-cover ring-1 ring-ink-200"
          />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-brand-700 text-sm font-semibold text-white">
            {initial}
          </span>
        )}
        <ChevronDown
          className={cn('size-4 text-ink-500 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-card border border-ink-200 bg-white shadow-pop"
        >
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">
              {profile.fullName ?? 'Your account'}
            </p>
            <p className="truncate text-xs text-ink-500">{profile.email}</p>
          </div>

          <div className="py-1">
            {ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
              >
                <Icon className="size-4 text-ink-400" aria-hidden />
                {label}
              </Link>
            ))}

            {profile.isAdmin ? (
              <Link
                href="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
              >
                <Shield className="size-4" aria-hidden />
                Admin console
              </Link>
            ) : null}
          </div>

          <form action={signOut} className="border-t border-ink-100">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-red-600"
            >
              <LogOut className="size-4 text-ink-400" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
