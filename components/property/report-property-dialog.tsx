'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { entriesOf } from '@/lib/utils';
import { REPORT_REASON_LABELS } from '@/lib/constants';
import { reportProperty } from '@/lib/properties/report-actions';
import { rememberReturnTo } from '@/lib/auth/return-to-actions';

/** §17 — "Report this property". */
export function ReportPropertyDialog({
  propertyId,
  nextPath,
}: {
  propertyId: string;
  nextPath: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!reason) {
      setError('Pick a reason so we know what to look at.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await reportProperty({ propertyId, reason, description });

      switch (result.status) {
        case 'submitted':
          setOpen(false);
          setReason('');
          setDescription('');
          toast({
            tone: 'success',
            title: 'Report submitted',
            description: 'Our team will review this listing. Thank you.',
          });
          break;

        case 'already_reported':
          setOpen(false);
          toast({ tone: 'info', title: 'You have already reported this listing' });
          break;

        case 'sign_in_required':
          await rememberReturnTo(nextPath);
          router.push('/login');
          break;

        default:
          setError(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-red-600"
      >
        <Flag className="size-4" aria-hidden />
        Report this property
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report this property"
        description="Tell us what is wrong and our moderation team will take a look."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submit} loading={busy}>
              Submit report
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
            >
              {error}
            </div>
          ) : null}

          <Field label="What is the problem?" htmlFor="report-reason" required>
            <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason</option>
              {entriesOf(REPORT_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Details"
            htmlFor="report-description"
            required={reason === 'other'}
            hint={
              reason === 'other'
                ? 'Required when the reason is “Something else”.'
                : 'Optional, but specifics help us act faster.'
            }
          >
            <Textarea
              id="report-description"
              rows={4}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. The photos belong to a different building."
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
