import Link from 'next/link';
import { Users } from 'lucide-react';
import { AccountStatusButton } from '@/components/admin/decision-buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { getUsers } from '@/lib/admin/queries';
import { setAccountStatus } from '@/lib/admin/actions';
import { requireAdmin } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/**
 * §16 — accounts.
 *
 * Suspension is the sharpest tool in the console: it cuts a person off from
 * their own listings and leads. So the row shows enough to be sure it is the
 * right person before the button is reachable, and the signed-in admin can
 * never act on their own row.
 */
export default async function AdminUsersPage({ searchParams }: PageProps) {
  const me = await requireAdmin();
  const params = await searchParams;

  const search = first(params.q).trim().slice(0, 80);
  const statusFilter = first(params.status);

  const all = await getUsers(search);
  const users =
    statusFilter === 'suspended'
      ? all.filter((u) => u.account_status === 'suspended')
      : statusFilter === 'admin'
        ? all.filter((u) => u.role === 'admin')
        : all;

  return (
    <div>
      <form method="get" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search name, email or mobile"
          className="min-w-0 flex-1 rounded-field border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
        <button
          type="submit"
          className="rounded-field bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800"
        >
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {[
          { key: '', label: 'All' },
          { key: 'suspended', label: 'Suspended' },
          { key: 'admin', label: 'Admins' },
        ].map((tab) => {
          const active = statusFilter === tab.key;
          const query = new URLSearchParams();
          if (search) query.set('q', search);
          if (tab.key) query.set('status', tab.key);
          const qs = query.toString();

          return (
            <Link
              key={tab.key || 'all'}
              href={qs ? `/admin/users?${qs}` : '/admin/users'}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-ink-900 text-white'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-900',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {users.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Users className="size-6" />}
          title="No users match"
          description={search ? 'Try a different search.' : 'No accounts with this filter.'}
        />
      ) : (
        <div className="mt-5 overflow-hidden rounded-card border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Registered accounts</caption>
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <th scope="col" className="px-4 py-2.5 font-medium">User</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Role</th>
                <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">Joined</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === me.id;
                return (
                  <tr key={user.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">
                        {user.full_name?.trim() || 'Unnamed'}
                        {isSelf ? <span className="ml-1.5 text-xs text-ink-400">(you)</span> : null}
                      </p>
                      <p className="text-xs text-ink-500">
                        {user.email ?? '—'}
                        {user.mobile_number ? ` · ${user.mobile_number}` : ''}
                      </p>
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      {user.role === 'admin' ? (
                        <Badge tone="brand">Admin</Badge>
                      ) : (
                        <span className="text-ink-600 capitalize">{user.role}</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-ink-500 md:table-cell">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      {user.account_status === 'suspended' ? (
                        <Badge tone="danger">Suspended</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AccountStatusButton
                        userId={user.id}
                        status={user.account_status}
                        disabled={isSelf}
                        disabledReason="—"
                        onChange={setAccountStatus}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
