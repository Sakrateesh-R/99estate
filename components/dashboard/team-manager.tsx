'use client';

import * as React from 'react';
import { useActionState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { Clock, LogOut, Mail, UserMinus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  type TeamActionState,
} from '@/lib/organizations/actions';
import {
  ORG_MEMBER_ROLE_LABELS,
  ORG_MEMBER_ROLE_SUMMARY,
  ORG_MEMBER_STATUS_LABELS,
} from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { PendingInvitation, TeamMember } from '@/lib/organizations/queries';
import type { Enums } from '@/types/database.types';

const INITIAL: TeamActionState = { ok: false };

/** Mirrors INVITABLE_ROLES in the action; `owner` is not offered here either. */
const INVITABLE: Enums<'org_member_role'>[] = [
  'admin',
  'sales_manager',
  'sales_executive',
  'marketing',
  'viewer',
];

/** Roles an existing member can be moved to. Owner is included — see below. */
const ASSIGNABLE: Enums<'org_member_role'>[] = ['owner', ...INVITABLE];

function InviteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      <UserPlus className="size-4" aria-hidden />
      Invite
    </Button>
  );
}

/**
 * The team panel: who is here, who has been invited, and what each can do.
 *
 * Inviting records an address and nothing more — there is no mailer, so the
 * person joins by signing in with Google on that address and
 * `accept_pending_invitations()` seats them. That is stated on screen, because
 * a form that looks like it sent an email and did not is worse than one that
 * says what it actually did.
 */
export function TeamManager({
  organizationId,
  members,
  invitations,
  canManage,
  myRole,
}: {
  organizationId: string;
  members: TeamMember[];
  invitations: PendingInvitation[];
  canManage: boolean;
  myRole: Enums<'org_member_role'>;
}) {
  const [inviteState, inviteAction] = useActionState(inviteMember, INITIAL);
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = React.useState<TeamMember | null>(null);
  const toast = useToast();
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (inviteState.ok && inviteState.message) {
      toast({ tone: 'success', title: 'Invitation recorded', description: inviteState.message });
      formRef.current?.reset();
    }
  }, [inviteState, toast]);

  /** Shared handling for the small, non-form actions. */
  function run(action: () => Promise<TeamActionState>, successTitle: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast({ tone: 'success', title: successTitle, description: result.message });
        router.refresh();
      } else {
        toast({ tone: 'error', title: result.error ?? 'That did not work' });
      }
    });
  }

  const activeOwners = members.filter((m) => m.role === 'owner' && m.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* ---- Current team ------------------------------------------------ */}
      <ul className="divide-y divide-ink-100">
        {members.map((member) => {
          /**
           * You cannot change your own role — the database refuses it, so
           * offering the control would be offering a guaranteed error. And the
           * last active owner cannot be demoted or removed, which a constraint
           * trigger enforces independently.
           */
          const isLastOwner = member.role === 'owner' && activeOwners === 1;
          const roleEditable = canManage && !member.isYou && !isLastOwner;
          const canRemove = (canManage && !isLastOwner) || (member.isYou && !isLastOwner);

          return (
            <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {member.name ?? 'Unnamed member'}
                  {member.isYou ? (
                    <span className="ml-1.5 text-xs font-normal text-ink-500">(you)</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {ORG_MEMBER_ROLE_SUMMARY[member.role]}
                </p>
              </div>

              {member.status !== 'active' ? (
                <Badge tone="warning">{ORG_MEMBER_STATUS_LABELS[member.status]}</Badge>
              ) : null}

              {roleEditable ? (
                <Select
                  aria-label={`Role for ${member.name ?? 'this member'}`}
                  defaultValue={member.role}
                  disabled={pending}
                  className="h-9 w-auto min-w-[9.5rem] text-sm"
                  onChange={(event) => {
                    const formData = new FormData();
                    formData.set('organization_id', organizationId);
                    formData.set('member_id', member.id);
                    formData.set('role', event.target.value);
                    run(() => updateMemberRole(formData), 'Role updated');
                  }}
                >
                  {ASSIGNABLE.map((role) => (
                    <option key={role} value={role}>
                      {ORG_MEMBER_ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              ) : (
                <Badge tone={member.role === 'owner' ? 'brand' : 'neutral'}>
                  {ORG_MEMBER_ROLE_LABELS[member.role]}
                </Badge>
              )}

              {canRemove ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirmRemove(member)}
                  aria-label={member.isYou ? 'Leave this company' : `Remove ${member.name ?? 'member'}`}
                >
                  {member.isYou ? (
                    <LogOut className="size-4" aria-hidden />
                  ) : (
                    <UserMinus className="size-4" aria-hidden />
                  )}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* ---- Outstanding invitations -------------------------------------- */}
      {invitations.length > 0 ? (
        <div className="rounded-field border border-ink-200 bg-ink-50/60 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
            <Clock className="size-3.5" aria-hidden />
            Waiting to join
          </p>
          <ul className="mt-3 divide-y divide-ink-200">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-800">{invitation.email}</p>
                  <p className="text-xs text-ink-500">
                    {invitation.isExpired
                      ? `Lapsed ${formatDate(invitation.expiresAt)}`
                      : `Invited ${formatDate(invitation.invitedAt)} · open until ${formatDate(invitation.expiresAt)}`}
                  </p>
                </div>
                <Badge tone={invitation.isExpired ? 'neutral' : 'info'}>
                  {ORG_MEMBER_ROLE_LABELS[invitation.role]}
                </Badge>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      const formData = new FormData();
                      formData.set('organization_id', organizationId);
                      formData.set('invitation_id', invitation.id);
                      run(() => revokeInvitation(formData), 'Invitation withdrawn');
                    }}
                  >
                    Withdraw
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---- Invite ------------------------------------------------------- */}
      {canManage ? (
        <form ref={formRef} action={inviteAction} className="border-t border-ink-100 pt-5">
          <input type="hidden" name="organization_id" value={organizationId} />

          {inviteState.error ? (
            <div
              role="alert"
              className="mb-4 rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {inviteState.error}
            </div>
          ) : null}

          <p className="text-sm font-semibold text-ink-900">Invite a colleague</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
            <Field label="Their email" htmlFor="invite_email" className="sm:col-span-1">
              <Input
                id="invite_email"
                name="email"
                type="email"
                required
                maxLength={200}
                placeholder="colleague@gmail.com"
                autoComplete="off"
              />
            </Field>

            <Field label="They can" htmlFor="invite_role">
              <Select id="invite_role" name="role" defaultValue="sales_executive">
                {INVITABLE.map((role) => (
                  <option key={role} value={role}>
                    {ORG_MEMBER_ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex items-end">
              <InviteButton />
            </div>
          </div>

          {/*
            Said plainly. No email is sent — there is no mailer — so the only
            thing that makes an invitation work is the person signing in on
            that address. A form that implied it had emailed them would send
            an owner off to wait for something that is never coming.
          */}
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
            <Mail className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
            <span>
              We do not email the invitation. Tell them to sign in with Google using exactly this
              address — they will be on the team as soon as they do. Owner cannot be invited;
              promote someone once they have joined.
            </span>
          </p>
        </form>
      ) : (
        <p className="border-t border-ink-100 pt-5 text-sm text-ink-600">
          Only an owner or admin can change the team. You are{' '}
          {ORG_MEMBER_ROLE_LABELS[myRole].toLowerCase()}.
        </p>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        loading={pending}
        destructive
        title={
          confirmRemove?.isYou
            ? 'Leave this company?'
            : `Remove ${confirmRemove?.name ?? 'this person'}?`
        }
        confirmLabel={confirmRemove?.isYou ? 'Leave' : 'Remove'}
        description={
          confirmRemove?.isYou
            ? 'You will lose access to its projects, inventory and enquiries. An owner can invite you back.'
            : 'They lose access to this company immediately. Leads already assigned to them stay with the company.'
        }
        onConfirm={() => {
          if (!confirmRemove) return;
          const formData = new FormData();
          formData.set('organization_id', organizationId);
          formData.set('member_id', confirmRemove.id);
          run(
            () => removeMember(formData),
            confirmRemove.isYou ? 'You have left the company' : 'Team member removed',
          );
          setConfirmRemove(null);
        }}
      />
    </div>
  );
}
