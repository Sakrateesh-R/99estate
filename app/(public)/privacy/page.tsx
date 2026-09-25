import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section, List, Callout } from '@/components/legal/legal-page';
import { LEGAL, LEGAL_FACTS } from '@/lib/legal';
import { SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${SITE_NAME} collects, uses and protects your personal data, including when a seller's phone number is disclosed.`,
  alternates: { canonical: '/privacy' },
};

const F = LEGAL_FACTS;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <p>
          This policy explains what personal data {SITE_NAME} collects, why, who it is shared with,
          and the rights you have over it under the Digital Personal Data Protection Act, 2023. The
          data fiduciary is {LEGAL.entityName}, {LEGAL.registeredAddress}.
        </p>
      }
    >
      <Section n={1} title="The short version">
        <List
          items={[
            'You can browse every listing in full without an account and without giving us anything.',
            'We ask for a mobile number only when you post a property or unlock a contact — because the other side needs a way to reach you.',
            'A seller’s phone number is never shown publicly. It is disclosed to one buyer at a time, only when that buyer unlocks it.',
            'When you unlock a seller’s contact, your name and mobile number are shown to that seller as a lead. This is the trade, and it is mutual.',
            'We do not sell your data, and we do not run advertising or tracking cookies.',
          ]}
        />
      </Section>

      <Section n={2} title="What we collect">
        <p>
          <strong className="font-semibold">From your Google account, when you sign in:</strong>
        </p>
        <List
          items={[
            'Your name, email address, Google account identifier and profile picture.',
            'We do not receive your Google password, and we cannot read anything else in your Google account.',
          ]}
        />

        <p className="pt-2">
          <strong className="font-semibold">From you directly:</strong>
        </p>
        <List
          items={[
            'Your mobile number — required before posting a property or unlocking a contact.',
            'Listing details you publish: title, description, price, area, specifications, locality, PIN code, full address, optional map coordinates, and photographs.',
            'Properties you save, listings you report, and the reason you give.',
          ]}
        />

        <p className="pt-2">
          <strong className="font-semibold">Generated as you use the Platform:</strong>
        </p>
        <List
          items={[
            'A record of each contact you unlock — which listing, when, and whether it was free or paid.',
            'Leads created for a seller when their contact is unlocked.',
            'Payment records: amount, currency, status, and the gateway’s order and payment identifiers.',
            <>
              A record that a listing was viewed, stored as a{' '}
              <strong className="font-semibold">salted one-way hash</strong> of your IP address and
              browser user agent. It is used only to avoid counting the same visitor twice in a day
              and cannot be reversed to identify you.
            </>,
            'In-app notifications addressed to you.',
          ]}
        />

        <Callout>
          <strong className="font-semibold">We never see your payment credentials.</strong> Card
          numbers, UPI PINs and bank details are entered on the payment gateway and never reach our
          servers. We store only the amount, the status and the gateway&rsquo;s reference numbers.
        </Callout>
      </Section>

      <Section n={3} title="Why we use it">
        <List
          items={[
            'To operate your account and keep you signed in.',
            'To publish, moderate and expire your listings.',
            'To enforce the daily free-contact allowance and to process payment when you exceed it.',
            'To connect a buyer and a seller once a contact is unlocked — which necessarily means disclosing contact details in both directions.',
            'To notify you about approvals, new leads, payments and expiring listings.',
            'To detect and prevent fraud, fake listings, abuse and misuse of contact details.',
            'To meet our obligations under Indian law, including retaining transaction records.',
          ]}
        />
        <p>
          We do not use your personal data for profiling, automated decision-making with legal
          effect, or advertising.
        </p>
      </Section>

      <Section n={4} title="When contact details are disclosed">
        <p>This is the most important section of this policy, so it is stated plainly.</p>
        <Callout>
          <p>
            <strong className="font-semibold">A seller&rsquo;s phone number</strong> is not shown on
            a listing, in search results, or anywhere in the page a browser receives. It is released
            to a specific buyer at the moment that buyer unlocks that specific listing — using one
            of their {F.freeUnlocksPerDay} free daily contacts, or by paying ₹{F.paidUnlockPrice}.
          </p>
          <p className="mt-2">
            <strong className="font-semibold">In the same moment</strong>, that buyer&rsquo;s name
            and mobile number become visible to the seller as a lead, so the seller knows who is
            asking. Unlocking a contact is therefore a mutual exchange, not a one-way lookup.
          </p>
        </Callout>
        <p>
          This is enforced in our database rather than in the interface, so a seller&rsquo;s number
          cannot be exposed by a page that renders the wrong thing.
        </p>
      </Section>

      <Section n={5} title="Who else processes your data">
        <p>We share personal data only with the service providers needed to run the Platform:</p>
        <List
          items={[
            <>
              <strong className="font-semibold">Supabase</strong> — database, file storage and
              authentication. Your account, listings and photographs are stored here.
            </>,
            <>
              <strong className="font-semibold">Our payment gateway</strong> — processes payments for
              paid contact unlocks and receives the details needed to take that payment.
            </>,
            <>
              <strong className="font-semibold">Google</strong> — only because you choose to sign in
              with a Google account.
            </>,
            'Law enforcement, regulators or courts, where we are legally required to disclose.',
          ]}
        />
        <p>
          <strong className="font-semibold">We do not sell your personal data</strong>, and we do not
          share it with advertisers or data brokers.
        </p>
        <p>
          Some of these providers may process or store data outside India. Where that happens, it is
          done in line with the Digital Personal Data Protection Act, 2023 and any restrictions
          notified by the Central Government.
        </p>
      </Section>

      <Section n={6} title="Cookies">
        <p>
          We use only cookies that are necessary for the site to function. There are no advertising,
          analytics or cross-site tracking cookies.
        </p>
        <List
          items={[
            'A session cookie that keeps you signed in.',
            'A short-lived cookie remembering the page you were heading to before signing in, so we can return you there. It expires in ten minutes.',
            'A short-lived cookie carrying a sign-in error message, so it can be shown once. It expires in one minute.',
          ]}
        />
      </Section>

      <Section n={7} title="How long we keep it">
        <List
          items={[
            'Account data: while your account exists.',
            'Listings: while published, and for a reasonable period afterwards so disputes can be investigated.',
            'Contact unlocks and leads: retained after you delete your account only in the anonymised form needed to keep a seller’s records accurate.',
            'Payment records: retained as long as required by tax and accounting law in India.',
            'View records: retained in hashed form for analytics and are not linked to an identified person.',
          ]}
        />
      </Section>

      <Section n={8} title="Your rights">
        <p>Under the Digital Personal Data Protection Act, 2023 you may:</p>
        <List
          items={[
            'Ask what personal data we hold about you and how it is processed.',
            'Ask us to correct anything inaccurate or incomplete — you can edit your name and mobile number yourself from your profile.',
            'Ask us to erase your personal data, where we are not required to keep it by law.',
            'Withdraw your consent. Note that withdrawing the consent to hold your mobile number means you can no longer post listings or unlock contacts, because both depend on it.',
            'Nominate another person to exercise these rights on your behalf if you are unable to.',
            'Complain to us first, and then to the Data Protection Board of India if you are not satisfied.',
          ]}
        />
        <p>
          To exercise any of these, write to {LEGAL.privacyEmail}. We will respond within the period
          required by law.
        </p>
        <Callout>
          <strong className="font-semibold">One limit worth knowing.</strong> If you have unlocked a
          seller&rsquo;s contact, that seller already holds your name and number as a lead. Deleting
          your account removes it from our systems but cannot retrieve it from them — much as a phone
          call cannot be unmade.
        </Callout>
      </Section>

      <Section n={9} title="How we protect it">
        <List
          items={[
            'All traffic is encrypted in transit.',
            'Access to every record is enforced at the database level, so a page cannot return data the viewer is not entitled to even if it asks for it.',
            'Seller phone numbers are readable only through a restricted view that checks for a completed unlock.',
            'Administrative credentials are held on the server only and are never sent to a browser.',
            'Payment credentials never touch our servers.',
          ]}
        />
        <p>
          No system is perfectly secure. If a breach occurs that is likely to affect you, we will
          notify you and the Data Protection Board of India as required by law.
        </p>
      </Section>

      <Section n={10} title="Children">
        <p>
          {SITE_NAME} is not intended for anyone under 18, and we do not knowingly collect data from
          children. If you believe a child has given us personal data, contact us and we will delete
          it.
        </p>
      </Section>

      <Section n={11} title="Contact and complaints">
        <Callout>
          <p>
            <strong className="font-semibold">Grievance Officer — {LEGAL.grievanceOfficerName}</strong>
            <br />
            {LEGAL.entityName}
            <br />
            {LEGAL.registeredAddress}
            <br />
            {LEGAL.grievanceOfficerEmail}
          </p>
          <p className="mt-2">
            Privacy enquiries: {LEGAL.privacyEmail} · General support: {LEGAL.supportEmail}
          </p>
          <p className="mt-2">
            We acknowledge complaints within {F.grievanceAckHours} hours and aim to resolve them
            within {F.grievanceResolutionDays} days.
          </p>
        </Callout>
        <p>
          If you are not satisfied with our response, you may complain to the Data Protection Board
          of India.
        </p>
      </Section>

      <Section n={12} title="Changes to this policy">
        <p>
          We may update this policy. Where a change materially affects how we use your data, we will
          give notice on the Platform before it takes effect.
        </p>
        <p>
          See also our{' '}
          <Link href="/terms" className="font-medium text-brand-700 underline underline-offset-2">
            Terms of use
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
