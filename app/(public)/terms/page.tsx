import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section, List, Callout } from '@/components/legal/legal-page';
import { LEGAL, LEGAL_FACTS } from '@/lib/legal';
import { SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: `The terms governing use of ${SITE_NAME}, a property listing platform.`,
  alternates: { canonical: '/terms' },
};

const F = LEGAL_FACTS;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          These terms govern your use of {SITE_NAME} (&ldquo;the Platform&rdquo;), operated by{' '}
          {LEGAL.entityName}, a {LEGAL.entityType} of {LEGAL.proprietorName},{' '}
          {LEGAL.registeredAddress}. By creating an account, posting a listing, or unlocking a
          seller&rsquo;s contact, you agree to them. If you do not agree, please do not use the
          Platform.
        </p>
      }
    >
      <Section n={1} title="What 99Estate is, and what it is not">
        <p>
          {SITE_NAME} is an online platform where property owners, agents and builders publish
          listings, and where buyers and tenants can find them and choose to contact the person
          behind a listing.
        </p>
        <Callout>
          <strong className="font-semibold">We are an intermediary, not a party to your deal.</strong>{' '}
          We are not a real estate agent or broker, we do not act for either side, we do not
          negotiate, and we take no commission on any sale, rent or deposit. Every transaction is
          strictly between you and the other person.
        </Callout>
        <p>
          We do not own, inspect, value or hold any property listed on the Platform, and we are not
          a party to any agreement you reach with a seller or buyer.
        </p>
      </Section>

      <Section n={2} title="Who may use the Platform">
        <List
          items={[
            'You must be at least 18 years old and capable of entering a contract under the Indian Contract Act, 1872.',
            'You must provide a valid Indian mobile number before posting a property or unlocking a contact. This is how the other side reaches you, so it must be genuine and yours.',
            'One account per person. Accounts may not be shared, sold or transferred.',
            'You are responsible for everything done through your account.',
          ]}
        />
      </Section>

      <Section n={3} title="What it costs">
        <p>
          Browsing is free and always will be. You can search, filter, open any listing and read it
          in full — photographs, price, locality and specifications — without an account and without
          paying anything.
        </p>
        <List
          items={[
            <>
              <strong className="font-semibold">Posting a property is free.</strong> There is no
              listing fee, no featured-listing fee and no commission.
            </>,
            <>
              <strong className="font-semibold">
                {F.freeUnlocksPerDay} seller contacts are free every day.
              </strong>{' '}
              The allowance resets at 00:00 IST. Unused contacts do not carry over to the next day.
            </>,
            <>
              <strong className="font-semibold">
                Beyond that, each contact costs ₹{F.paidUnlockPrice}
              </strong>{' '}
              (inclusive of applicable taxes unless stated otherwise at checkout).
            </>,
            <>
              Unlocking a listing you have already unlocked is always free, however long ago that
              was. You are never charged twice for the same seller on the same listing.
            </>,
          ]}
        />
        <Callout>
          The ₹{F.paidUnlockPrice} is payment for disclosure of the seller&rsquo;s contact details.
          It is not a fee to view the property, and it is not a booking, token or advance of any
          kind.
        </Callout>
        <p>
          We may change these prices. Any change applies only to unlocks made after the change, and
          the price shown to you before you pay is the price you pay.
        </p>
      </Section>

      <Section n={4} title="Payments and refunds">
        <p>
          Payments are processed by our payment gateway partner. We do not receive or store your
          card, UPI or bank credentials at any point.
        </p>
        <List
          items={[
            'A contact is unlocked only after the gateway confirms payment to us. If payment fails or is not confirmed, nothing is charged and nothing is unlocked.',
            'Because the contact details are disclosed immediately on successful payment, a completed unlock is not refundable.',
            <>
              <strong className="font-semibold">Exception:</strong> if you are charged for a contact
              you already held, that payment is flagged for refund automatically and returned to the
              original payment method.
            </>,
            'If money leaves your account but the contact does not unlock, write to us and we will either complete the unlock or refund you in full.',
            'Approved refunds are returned to the original payment method. Timing depends on your bank or UPI provider.',
          ]}
        />
      </Section>

      <Section n={5} title="If you are posting a property">
        <p>By publishing a listing you confirm that:</p>
        <List
          items={[
            'You own the property, or you are authorised by the owner to advertise it.',
            'Every detail — price, area, location, age, amenities and status — is accurate and current.',
            'The photographs are of the actual property, and you have the right to use them.',
            'The listing is not a duplicate of another live listing for the same property.',
            'You will mark the listing as sold, rented or paused as soon as it is no longer available.',
            'You have declared honestly whether you are the owner, a broker or a builder.',
          ]}
        />
        <p>
          Listings are reviewed before they go live and run for {F.listingDurationDays} days, after
          which they expire and can be renewed. We may decline, edit, pause or remove any listing
          that appears inaccurate, duplicated, misleading or unlawful.
        </p>
        <p>
          You keep ownership of your photographs and text, and grant us a non-exclusive, royalty-free
          licence to host, display and reproduce them for the purpose of operating and promoting the
          Platform. That licence ends when the listing is deleted, except for copies retained in
          backups or as records we must keep by law.
        </p>
      </Section>

      <Section n={6} title="If you are contacting a seller">
        <p>
          A seller&rsquo;s phone number is disclosed to you for one purpose: to make a genuine
          enquiry about that property. You may not:
        </p>
        <List
          items={[
            'Use the number for marketing, promotion, spam or any unsolicited commercial message.',
            'Collect, store, publish, resell or share contact details with anyone else.',
            'Use automated means to unlock contacts in bulk, or attempt to harvest the Platform’s data.',
            'Contact a seller in a manner that is abusive, threatening, deceptive or harassing.',
          ]}
        />
        <p>
          Breaching this is a serious matter. It may result in immediate suspension without refund,
          and may attract liability under the Information Technology Act, 2000 and the Digital
          Personal Data Protection Act, 2023.
        </p>
      </Section>

      <Section n={7} title="Things you must not do">
        <List
          items={[
            'Post false, fraudulent, duplicate or misleading listings.',
            'Impersonate another person, or misrepresent your relationship to a property.',
            'Scrape, crawl, mirror or systematically extract content from the Platform.',
            'Interfere with the Platform’s operation, probe its security, or attempt to bypass any limit, quota or access control.',
            'Upload anything unlawful, obscene, defamatory, or infringing someone else’s rights.',
            'Use the Platform for money laundering or any unlawful purpose.',
          ]}
        />
      </Section>

      <Section n={8} title="Reporting a listing">
        <p>
          Every listing carries a <strong className="font-semibold">Report this property</strong>{' '}
          link. Reports reach our moderation team directly.
        </p>
        <p>
          In accordance with the Information Technology (Intermediary Guidelines and Digital Media
          Ethics Code) Rules, 2021, we act on reports of fraudulent or unlawful listings within{' '}
          {F.takedownHours} hours of receiving a valid complaint, and we may remove or disable access
          to content without prior notice where required by law.
        </p>
      </Section>

      <Section n={9} title="What we do not promise">
        <p>
          Listings are created by users, not by us. We apply moderation and offer a verification
          badge on some listings, but neither is a guarantee.
        </p>
        <List
          items={[
            'We do not verify title, ownership, encumbrances, approvals, RERA registration, carpet area or the legality of any property.',
            'We do not guarantee that a listing is available, accurately priced, or that the person behind it will respond.',
            'A “Verified” badge means we have reviewed documents supplied to us. It is not a legal opinion, survey or valuation.',
            'The Platform is provided on an “as is” basis, without warranties of any kind to the extent permitted by law.',
          ]}
        />
        <Callout>
          <strong className="font-semibold">Do your own due diligence.</strong> Before paying any
          money to anyone, verify title documents, approvals and identity independently, and take
          professional legal advice. Never transfer a deposit or advance to someone you have not
          verified.
        </Callout>
      </Section>

      <Section n={10} title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, we are not liable for any indirect, incidental or
          consequential loss, or for loss of profit, opportunity or data, arising from your use of
          the Platform or from any dealing with another user.
        </p>
        <p>
          Our total liability to you for any claim is limited to the total amount you paid us in the
          three months before the claim arose.
        </p>
        <p>Nothing in these terms excludes liability that cannot be excluded under Indian law.</p>
      </Section>

      <Section n={11} title="Suspension and closure">
        <p>
          We may suspend or close an account that breaches these terms, that we reasonably believe is
          being used fraudulently, or where we are required to do so by law. Where a seller is
          suspended, their live listings are taken off the market.
        </p>
        <p>
          You may stop using the Platform at any time and ask us to delete your account — see the{' '}
          <Link href="/privacy" className="font-medium text-brand-700 underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section n={12} title="Grievance Officer">
        <p>
          In accordance with the Information Technology Act, 2000 and the Rules made under it, the
          Grievance Officer for the Platform is:
        </p>
        <Callout>
          <p>
            <strong className="font-semibold">{LEGAL.grievanceOfficerName}</strong>
            <br />
            {LEGAL.entityName} — a {LEGAL.entityType} of {LEGAL.proprietorName}
            <br />
            {LEGAL.registeredAddress}
            <br />
            {LEGAL.grievanceOfficerEmail}
          </p>
          <p className="mt-2">
            We acknowledge complaints within {F.grievanceAckHours} hours and aim to resolve them
            within {F.grievanceResolutionDays} days of receipt.
          </p>
        </Callout>
      </Section>

      <Section n={13} title="Governing law">
        <p>
          These terms are governed by the laws of India. The courts at{' '}
          {LEGAL.jurisdictionCity}, {LEGAL.jurisdictionState} have exclusive jurisdiction over any
          dispute arising from them.
        </p>
      </Section>

      <Section n={14} title="Changes to these terms">
        <p>
          We may update these terms. If a change materially affects your rights we will give notice
          on the Platform before it takes effect. Continuing to use {SITE_NAME} after a change means
          you accept the updated terms.
        </p>
        <p>
          Questions about these terms: {LEGAL.supportEmail}
        </p>
      </Section>
    </LegalPage>
  );
}
