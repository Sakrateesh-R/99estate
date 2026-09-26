import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section, List, Callout } from '@/components/legal/legal-page';
import { LEGAL, LEGAL_FACTS } from '@/lib/legal';
import { SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: `The terms governing use of ${SITE_NAME}, a property listing platform.`,
  alternates: { canonical: '/terms' },
};

const F = LEGAL_FACTS;

/** The numbered walkthrough in §11 is a sequence, so it renders as one. */
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink-900 text-[0.6875rem] font-bold text-white">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-sm font-bold text-ink-950">{children}</h3>;
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={
        <>
          {/*
            Carried over from the document as supplied, and deliberately not
            quietly dropped. Removing a notice that says "not yet in force,
            review by a lawyer first" would be promoting a draft into operative
            legal text on the strength of nobody noticing.
          */}
          <Callout tone="warning">
            <strong className="font-semibold">This document is a draft and is not yet in force.</strong>{' '}
            It should be reviewed by a qualified legal professional before being published as the
            final Terms of Use.
          </Callout>

          <p className="mt-5">
            These Terms of Use (&ldquo;Terms&rdquo;) govern your access to and use of {SITE_NAME}{' '}
            (&ldquo;{SITE_NAME}&rdquo;, &ldquo;Platform&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or
            &ldquo;our&rdquo;), operated by {LEGAL.entityName}, a {LEGAL.entityType} of{' '}
            {LEGAL.proprietorName}, with registered office at {LEGAL.registeredAddress}.
          </p>
          <p className="mt-3">
            By creating an account, posting a property, saving a property, unlocking a contact,
            making a payment, or otherwise using {SITE_NAME}, you agree to these Terms. If you do not
            agree to these Terms, you should not use the Platform.
          </p>
        </>
      }
    >
      <Section n={1} title="What 99Estate Is">
        <p>{SITE_NAME} is an online real-estate marketplace that allows:</p>
        <List
          items={[
            'Property owners to publish property listings.',
            'Agents and brokers to advertise properties.',
            'Builders to publish projects and properties.',
            'Buyers and tenants to search and discover properties.',
            'Users to contact property owners, agents, or builders through the Platform.',
          ]}
        />
        <Callout>
          <strong className="font-semibold">
            {SITE_NAME} is a technology platform and intermediary.
          </strong>{' '}
          We are not a property owner, a buyer, a tenant, a real-estate broker or agent acting for
          either party, a property developer, a property valuer, a legal advisor, a financial
          advisor, or a party to any property transaction between users.
        </Callout>
        <p>
          {SITE_NAME} does not own, sell, purchase, lease, rent, inspect, value, or legally transfer
          any property listed on the Platform. Any sale, purchase, lease, rental agreement, deposit,
          advance payment, brokerage arrangement, or other transaction is solely between the relevant
          users.
        </p>
      </Section>

      <Section n={2} title="No Agency or Brokerage Relationship">
        <p>Using {SITE_NAME} does not create:</p>
        <List
          items={[
            'An agency relationship.',
            'A partnership.',
            'An employment relationship.',
            'A joint venture.',
            'A broker-client relationship.',
          ]}
        />
        <p>
          {SITE_NAME} does not negotiate property prices or contractual terms on behalf of users, and
          does not receive a commission from property sales, rentals, deposits, or other property
          transactions unless a separate service or commercial arrangement expressly states
          otherwise.
        </p>
      </Section>

      <Section n={3} title="Eligibility">
        <p>You must:</p>
        <List
          items={[
            <>
              Be at least <strong className="font-semibold">18 years old</strong>.
            </>,
            'Have legal capacity to enter into agreements under applicable Indian law.',
            'Provide accurate information when required.',
            'Use the Platform only for lawful purposes.',
          ]}
        />
        <p>
          {SITE_NAME} is intended for adults. If you are under 18, do not create an account or use
          the Platform.
        </p>
      </Section>

      <Section n={4} title="Accounts">
        <p>
          {SITE_NAME} currently uses <strong className="font-semibold">Google Sign-In</strong> for
          account authentication. After signing in through Google, you may be required to provide a
          valid mobile number before using certain Platform features.
        </p>
        <p>
          Your account information must be accurate and kept reasonably up to date. You are
          responsible for activity performed through your account.
        </p>
        <p>You must not:</p>
        <List
          items={[
            'Share your account with another person.',
            'Sell your account.',
            'Transfer your account.',
            'Create accounts for fraudulent purposes.',
            'Create multiple accounts to bypass Platform limits.',
          ]}
        />
        <p>
          We may restrict or suspend accounts that we reasonably believe are being used to abuse the
          Platform.
        </p>
      </Section>

      <Section n={5} title="Mobile Number Requirement">
        <p>A valid mobile number may be required before you can:</p>
        <List
          items={[
            'Post a property.',
            <>Unlock a seller&rsquo;s contact.</>,
            'Use certain lead-related features.',
          ]}
        />
        <p>
          {SITE_NAME} does not currently use mobile OTP verification for account registration. You
          agree that the mobile number you provide should belong to you or be legitimately under your
          control.
        </p>
      </Section>

      <Section n={6} title="Property Browsing Is Free">
        <p>Users can browse published property listings without paying. Unless otherwise stated:</p>
        <List
          items={[
            'Searching is free.',
            'Filtering is free.',
            'Opening property listings is free.',
            'Viewing property photographs is free.',
            'Viewing property specifications is free.',
            'Viewing publicly available property descriptions is free.',
          ]}
        />
        <Callout>
          <strong className="font-semibold">
            The ₹{F.paidUnlockPrice} charge is not a property-viewing fee.
          </strong>{' '}
          It is a contact-unlock fee.
        </Callout>
      </Section>

      <Section n={7} title="Posting Properties Is Free">
        <p>
          Property owners, agents, and builders may post properties without paying a listing fee.
        </p>
        <p>{SITE_NAME} may introduce optional paid promotional services in the future, such as:</p>
        <List
          items={[
            'Featured listings.',
            'Property boosts.',
            'Priority placement.',
            'Builder promotion.',
            'Other visibility services.',
          ]}
        />
        <p>Any applicable fee will be clearly shown before the relevant service is purchased.</p>
      </Section>

      <Section n={8} title="Daily Free Contact Unlocks">
        <p>Every authenticated user receives:</p>
        <Callout>
          <strong className="font-semibold">
            {F.freeUnlocksPerDay} successful seller-contact unlocks per calendar day,
          </strong>{' '}
          resetting at <strong className="font-semibold">00:00 IST</strong>.
        </Callout>
        <p>
          Unused free contact unlocks do not carry forward to the following day. Viewing a property
          does not consume a free contact unlock — one is consumed only when the seller&rsquo;s
          contact information is successfully disclosed to you.
        </p>
      </Section>

      <Section n={9} title="₹9 Contact Unlock">
        <p>
          After the {F.freeUnlocksPerDay} daily free contact unlocks have been used,{' '}
          <strong className="font-semibold">
            each additional contact unlock costs ₹{F.paidUnlockPrice}
          </strong>
          . The applicable price will be displayed before payment.
        </p>
        <p>
          The ₹{F.paidUnlockPrice} fee is specifically for unlocking the seller&rsquo;s contact
          information. It is not:
        </p>
        <List
          items={[
            'A property booking fee.',
            'A token amount.',
            'An advance.',
            'A deposit.',
            'A brokerage fee.',
            'A property purchase payment.',
            'A rental payment.',
          ]}
        />
        <p>
          {SITE_NAME} does not take the ₹{F.paidUnlockPrice} payment on behalf of the seller as a
          property transaction. It is a Platform service fee for the contact-unlock feature.
        </p>
      </Section>

      <Section n={10} title="Previously Unlocked Contacts">
        <p>
          If you have already unlocked the contact information associated with a particular property:
        </p>
        <List
          items={[
            'You will not be charged again to access the same unlocked contact.',
            'Access to the previously unlocked contact remains associated with your account, subject to applicable Platform rules and data-retention requirements.',
          ]}
        />
        <p>
          The same property cannot be used to repeatedly consume free daily contact allowances.
        </p>
      </Section>

      <Section n={11} title="Contact Unlock Process">
        <p>The contact-unlock process works as follows:</p>
        <Steps
          items={[
            <>
              You select <strong className="font-semibold">Unlock Contact</strong>.
            </>,
            <>
              {SITE_NAME} determines whether you have one of your {F.freeUnlocksPerDay} free daily
              contact unlocks remaining.
            </>,
            'If a free unlock is available, no payment is required.',
            <>
              If your free allowance has been exhausted, you are shown the applicable ₹
              {F.paidUnlockPrice} price.
            </>,
            'If payment is required, payment is processed through the applicable payment gateway.',
            <>
              After successful server-side payment confirmation, the seller&rsquo;s contact is
              disclosed, a contact-unlock record is created, and a lead is created for the seller.
            </>,
          ]}
        />
      </Section>

      <Section n={12} title="Mutual Contact Disclosure">
        <p>
          Contact unlocking is designed as a direct connection between property seekers and property
          providers. When you unlock a seller&rsquo;s contact:
        </p>
        <SubHeading>You may receive</SubHeading>
        <List items={['Seller name.', 'Seller mobile number.', 'Available contact options.']} />
        <SubHeading>The seller may receive</SubHeading>
        <List
          items={[
            'Your name.',
            'Your mobile number.',
            'The property associated with your enquiry.',
            'The date and time of the enquiry.',
          ]}
        />
        <p>
          This allows the seller to understand who has requested their property contact. By using the
          contact-unlock feature, you acknowledge this mutual disclosure.
        </p>
      </Section>

      <Section n={13} title="Contact Usage Rules">
        <p>
          Seller contact information obtained through {SITE_NAME} must be used only for a genuine
          enquiry relating to the relevant property. You must not:
        </p>
        <List
          items={[
            'Spam the seller.',
            'Harass the seller.',
            'Threaten the seller.',
            'Send unsolicited bulk messages.',
            'Use the number for unrelated marketing.',
            'Sell the contact information.',
            'Publish the contact information.',
            'Share the contact information with third parties.',
            <>Create databases of {SITE_NAME} contacts.</>,
            'Use automated systems to collect contacts.',
            'Attempt to circumvent the daily contact limit.',
          ]}
        />
        <p>Violation may result in:</p>
        <List
          items={[
            'Account suspension.',
            'Account termination.',
            'Loss of unused Platform benefits.',
            'Removal of listings.',
            'Further action where appropriate.',
          ]}
        />
      </Section>

      <Section n={14} title="Payment Processing">
        <p>
          Paid contact unlocks are processed through <strong className="font-semibold">Razorpay</strong>
          . {SITE_NAME} does not intentionally collect your UPI PIN, card PIN, banking password, or
          payment authentication credentials — payment processing is handled through the payment
          gateway.
        </p>
        <p>{SITE_NAME} may receive transaction information such as:</p>
        <List
          items={[
            'Order ID.',
            'Payment ID.',
            'Amount.',
            'Currency.',
            'Payment status.',
            'Refund status.',
            'Transaction date.',
          ]}
        />
      </Section>

      <Section n={15} title="Payment Confirmation">
        <p>
          A contact is unlocked only after successful payment confirmation through the applicable
          payment-processing system. A frontend message such as &ldquo;Payment successful&rdquo; is
          not by itself sufficient to unlock a contact.
        </p>
        <p>If payment fails or cannot be verified:</p>
        <List
          items={[
            'The contact will not be unlocked.',
            <>
              The transaction will be handled according to the payment provider&rsquo;s status.
            </>,
            'Any amount actually debited but not successfully processed will be investigated.',
          ]}
        />
      </Section>

      <Section n={16} title="Refunds">
        <p>
          Because the contact information is intended to be disclosed immediately after successful
          payment, a completed contact unlock is generally{' '}
          <strong className="font-semibold">non-refundable</strong>, except where required by law or
          in the situations described below.
        </p>
        <p>A refund may be considered where:</p>
        <List
          items={[
            'You were charged but the contact was not successfully unlocked.',
            'You were charged more than once for the same contact due to a technical error.',
            'A payment was successfully captured but the corresponding Platform service was not delivered.',
            'A refund is required by applicable law.',
            <>
              {SITE_NAME} determines that a refund is appropriate due to a verified technical or
              billing error.
            </>,
          ]}
        />
        <p>
          Where a refund is approved, it will generally be returned through the original payment
          method. Actual refund timing may depend on Razorpay, the relevant bank, card network, UPI
          provider, or other payment institution.
        </p>
      </Section>

      <Section n={17} title="Property Posting Requirements">
        <p>If you publish a property listing, you confirm that:</p>
        <List
          items={[
            'You own the property or have authority from the owner to advertise it.',
            'You are authorised to provide the information contained in the listing.',
            'The information is accurate to the best of your knowledge.',
            'The price is genuine and current.',
            'The location is accurate.',
            'The property status is accurately represented.',
            'The photographs are genuine or you have lawful rights to use them.',
            'You have the right to publish the listing.',
            <>The listing does not knowingly violate another person&rsquo;s rights.</>,
            'The listing is not intentionally duplicated.',
            'You will update or remove the listing when the property is no longer available.',
            'You accurately identify yourself as an owner, agent, broker, builder, or other relevant category.',
          ]}
        />
      </Section>

      <Section n={18} title="Property Listing Information">
        <p>You are responsible for the information contained in your listing. This includes:</p>
        <List
          items={[
            'Price.',
            'Property size.',
            'Location.',
            'BHK.',
            'Bathrooms.',
            'Amenities.',
            'Property age.',
            'Furnishing.',
            'Parking.',
            'Ownership-related representations.',
            'Availability.',
            'Photographs.',
            'Description.',
          ]}
        />
        <p>{SITE_NAME} does not guarantee the accuracy of information supplied by users.</p>
      </Section>

      <Section n={19} title="Property Photographs and Content">
        <p>
          You retain ownership of content that you submit to {SITE_NAME}, subject to applicable
          rights of third parties.
        </p>
        <p>
          By submitting property photographs, descriptions, videos, and related content, you grant{' '}
          {LEGAL.entityName} a non-exclusive, royalty-free licence to:
        </p>
        <List
          items={[
            'Host the content.',
            'Store the content.',
            'Display the content.',
            <>Reproduce the content as reasonably necessary to operate {SITE_NAME}.</>,
            'Format or resize the content for technical purposes.',
            'Promote the relevant listing and Platform.',
          ]}
        />
        <p>
          You represent that you have the necessary rights to provide that content. We may remove
          content that violates these Terms, applicable law, or our Platform policies.
        </p>
      </Section>

      <Section n={20} title="Listing Review and Moderation">
        <p>Listings may be reviewed before publication. We may:</p>
        <List
          items={[
            'Approve a listing.',
            'Reject a listing.',
            'Request additional information.',
            'Pause a listing.',
            'Remove a listing.',
            'Mark a listing as expired.',
            'Suspend an account.',
          ]}
        />
        <p>We may take action where a listing appears:</p>
        <List
          items={[
            'Fraudulent.',
            'Duplicate.',
            'Misleading.',
            'Inaccurate.',
            'Illegal.',
            'Abusive.',
            'In violation of these Terms.',
            'Reported by users.',
          ]}
        />
        <p>
          We are not required to provide prior notice where immediate action is reasonably necessary
          for safety, security, legal compliance, or prevention of abuse.
        </p>
      </Section>

      <Section n={21} title="Listing Duration">
        <p>
          Unless otherwise stated, property listings may remain active for up to{' '}
          <strong className="font-semibold">{F.listingDurationDays} days</strong>. After the listing
          period:
        </p>
        <List
          items={[
            'The listing may expire.',
            'It may be removed from normal search results.',
            'The seller may be allowed to renew it.',
          ]}
        />
        <p>
          Sellers should also mark a property as sold, rented, unavailable, or paused as soon as
          reasonably appropriate.
        </p>
      </Section>

      <Section n={22} title="Property Verification">
        <p>
          {SITE_NAME} may offer verification features. A &ldquo;Verified&rdquo; badge means only that{' '}
          {SITE_NAME} has performed the verification process applicable to that particular badge.
        </p>
        <p>Verification does not guarantee:</p>
        <List
          items={[
            'Legal ownership.',
            'Clear title.',
            'Absence of encumbrances.',
            'RERA compliance.',
            'Government approval.',
            'Building approval.',
            'Structural safety.',
            'Property valuation.',
            'Actual property condition.',
            'Accuracy of every statement in the listing.',
          ]}
        />
        <p>Users must perform their own legal and financial due diligence.</p>
      </Section>

      <Section n={23} title="Buyer and Tenant Due Diligence">
        <p>
          Before entering into any property transaction, you should independently verify:
        </p>
        <List
          items={[
            'Seller identity.',
            'Ownership.',
            'Title documents.',
            'Encumbrances.',
            'Approvals.',
            'RERA registration where applicable.',
            'Property tax information.',
            'Building permissions.',
            'Physical property condition.',
            'Rental terms.',
            'Sale terms.',
            'Payment instructions.',
          ]}
        />
        <Callout>
          <strong className="font-semibold">
            Obtain professional legal advice before making substantial payments or entering into a
            property agreement.
          </strong>{' '}
          {SITE_NAME} does not guarantee the legality or suitability of any property.
        </Callout>
      </Section>

      <Section n={24} title="No Guarantee of Transactions">
        <p>{SITE_NAME} does not guarantee that:</p>
        <List
          items={[
            'A property is available.',
            'A seller will respond.',
            'A buyer is genuine.',
            'A property will be sold.',
            'A property will be rented.',
            'A transaction will complete.',
            'A particular price will be accepted.',
            'A listing will remain active.',
            'A property is accurately described.',
            'A user will achieve any particular outcome.',
          ]}
        />
        <p>Any transaction is between the relevant parties.</p>
      </Section>

      <Section n={25} title="Prohibited Activities">
        <p>You must not use {SITE_NAME} to:</p>
        <List
          items={[
            'Publish fraudulent listings.',
            'Publish duplicate listings intended to manipulate search results.',
            'Impersonate another person.',
            'Misrepresent ownership.',
            'Misrepresent authority.',
            'Manipulate prices deceptively.',
            'Upload unlawful content.',
            'Upload content that infringes intellectual-property rights.',
            'Harass users.',
            'Spam users.',
            'Collect contact information unlawfully.',
            'Scrape or crawl the Platform without authorisation.',
            'Circumvent contact limits.',
            'Circumvent payment systems.',
            <>Attempt to access another user&rsquo;s account.</>,
            'Probe or attack Platform security.',
            'Upload malware.',
            'Interfere with Platform availability.',
            'Launder money.',
            'Commit fraud.',
            'Use the Platform for unlawful purposes.',
          ]}
        />
      </Section>

      <Section n={26} title="Automated Access and Scraping">
        <p>Without our written permission, you must not:</p>
        <List
          items={[
            'Scrape listings.',
            'Crawl the Platform for systematic data collection.',
            <>Build a competing database from {SITE_NAME} data.</>,
            'Use bots to unlock contacts.',
            'Automate account creation.',
            'Circumvent rate limits.',
            'Extract seller or buyer contact information.',
            'Mirror the Platform.',
          ]}
        />
        <p>We may use technical measures to detect and prevent automated abuse.</p>
      </Section>

      <Section n={27} title="Reporting a Property">
        <p>
          Users may report a property through the{' '}
          <strong className="font-semibold">Report this property</strong> feature. Reports may
          concern:
        </p>
        <List
          items={[
            'Fraud.',
            'Fake property.',
            'Duplicate listing.',
            'Wrong price.',
            'Wrong location.',
            'Property already sold.',
            'Wrong contact information.',
            'Misleading information.',
            'Copyright concerns.',
            'Other unlawful or abusive content.',
          ]}
        />
        <p>
          We may request additional information when reviewing a report, and we may remove or
          restrict access to content where appropriate or required by law.
        </p>
      </Section>

      <Section n={28} title="Intermediary and Grievance Handling">
        <p>
          To the extent applicable to {SITE_NAME}, {LEGAL.entityName} will comply with the applicable
          requirements of the Information Technology Act, 2000 and the Information Technology
          (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, as amended from time
          to time.
        </p>
        <p>
          The current IT Rules require intermediaries to prominently publish the name and contact
          details of their Grievance Officer and provide a grievance mechanism. The Rules provide for
          acknowledgment within {F.grievanceAckHours} hours and resolution within{' '}
          {F.grievanceResolutionDays} days, while specified content-removal complaints have a shorter
          applicable timeline.
        </p>
        <p>
          We will handle complaints according to the applicable legal requirements and our grievance
          procedures.
        </p>
      </Section>

      <Section n={29} title="Grievance Officer">
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
        </Callout>
        <p>
          Complaints may be submitted by email with sufficient information to identify the
          complainant, the relevant listing or account where applicable, the nature of the complaint,
          and any supporting information.
        </p>
        <p>
          We will acknowledge complaints within {F.grievanceAckHours} hours and process them in
          accordance with applicable law.
        </p>
      </Section>

      <Section n={30} title="Privacy">
        <p>
          Your use of {SITE_NAME} is also governed by our{' '}
          <Link href="/privacy" className="font-medium text-brand-700 underline underline-offset-2">
            Privacy Policy
          </Link>
          , which explains:
        </p>
        <List
          items={[
            'What personal data we collect.',
            'Why we collect it.',
            'How we use it.',
            'When contact information is disclosed.',
            'How payment information is processed.',
            'Your privacy rights.',
            'How to submit privacy requests.',
          ]}
        />
        <p>Please read it before using the Platform.</p>
      </Section>

      <Section n={31} title="Personal Data and Contact Information">
        <p>
          Users must handle personal information obtained through {SITE_NAME} responsibly. You must
          not:
        </p>
        <List
          items={[
            'Resell contact information.',
            'Publish contact information.',
            'Create contact databases for unrelated purposes.',
            <>Use another user&rsquo;s number for unrelated marketing.</>,
            <>
              Share another user&rsquo;s information without lawful basis or authorisation.
            </>,
          ]}
        />
        <p>
          Misuse of personal information may result in account suspension and may have legal
          consequences.
        </p>
      </Section>

      <Section n={32} title="Platform Availability">
        <p>
          We will make reasonable efforts to keep {SITE_NAME} available. However, the Platform may
          occasionally be unavailable because of:
        </p>
        <List
          items={[
            'Maintenance.',
            'Updates.',
            'Security incidents.',
            'Infrastructure failures.',
            'Internet or network failures.',
            'Third-party service outages.',
            'Payment gateway outages.',
            'Events outside our reasonable control.',
          ]}
        />
        <p>We do not guarantee uninterrupted or error-free availability.</p>
      </Section>

      <Section n={33} title="Third-Party Services">
        <p>{SITE_NAME} may use third-party services including:</p>
        <List
          items={[
            'Google',
            'Supabase',
            'Razorpay',
            'WhatsApp',
            'Maps and location services',
            'Hosting and infrastructure providers',
          ]}
        />
        <p>
          Third-party services operate under their own terms and policies. We are not responsible
          for third-party services outside our reasonable control.
        </p>
      </Section>

      <Section n={34} title="WhatsApp and Phone Calls">
        <p>
          If you use a seller&rsquo;s contact information to call, send a WhatsApp message, send
          another message, or otherwise communicate outside {SITE_NAME}, that communication occurs
          outside the Platform.
        </p>
        <p>
          The third-party service may process your information under its own privacy policy. Users
          remain responsible for lawful and respectful communication.
        </p>
      </Section>

      <Section n={35} title="No Professional Advice">
        <p>{SITE_NAME} does not provide:</p>
        <List
          items={[
            'Legal advice.',
            'Property-title advice.',
            'Tax advice.',
            'Financial advice.',
            'Investment advice.',
            'Valuation advice.',
            'Architectural advice.',
            'Construction advice.',
          ]}
        />
        <p>
          Information displayed on the Platform should not be treated as professional advice.
        </p>
      </Section>

      <Section n={36} title="Intellectual Property">
        <p>
          The {SITE_NAME} name, branding, software, design, user interface, source code, logos,
          graphics, and Platform technology may be protected by applicable intellectual-property
          laws.
        </p>
        <p>
          You may not copy, reproduce, modify, distribute, sell, reverse engineer, or create
          derivative works from the Platform except where permitted by law or expressly authorised by
          us. User-submitted property content remains subject to the rights described in these Terms.
        </p>
      </Section>

      <Section n={37} title="Suspension and Termination">
        <p>We may suspend or terminate an account where we reasonably believe that:</p>
        <List
          items={[
            'These Terms have been violated.',
            'Fraud has occurred.',
            'The Platform is being abused.',
            'Contact information is being misused.',
            'Payment systems are being manipulated.',
            'The account creates a security risk.',
            'The account is being used unlawfully.',
            'We are required to do so by law.',
          ]}
        />
        <p>
          Where appropriate, listings associated with a suspended account may also be removed. You
          may stop using {SITE_NAME} at any time, and you may request account deletion according to
          the{' '}
          <Link href="/privacy" className="font-medium text-brand-700 underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>

      <Section n={38} title="Effect of Account Termination">
        <p>If your account is terminated:</p>
        <List
          items={[
            'Your ability to access the Platform may be restricted.',
            'Active listings may be removed.',
            'Contact-unlock functionality may be disabled.',
            'Unused Platform benefits may be lost, subject to applicable law.',
            'Certain transaction, security, or legal records may be retained where necessary.',
          ]}
        />
        <p>
          Information already disclosed to another user cannot necessarily be retrieved from that
          user&rsquo;s possession.
        </p>
      </Section>

      <Section n={39} title="Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, {LEGAL.entityName} and {SITE_NAME} will
          not be responsible for indirect, incidental, special, consequential, or punitive losses
          arising from:
        </p>
        <List
          items={[
            'Use of the Platform.',
            'Inability to use the Platform.',
            'Property transactions between users.',
            'Incorrect property listings.',
            'Fraud by another user.',
            'Communications between users.',
            'Actions of buyers, sellers, agents, or builders.',
            'Third-party service failures.',
          ]}
        />
        <p>
          Nothing in these Terms excludes liability that cannot lawfully be excluded under applicable
          Indian law.
        </p>
        <p>
          To the maximum extent permitted by law, our aggregate liability for a claim directly
          arising from a paid {SITE_NAME} service will not exceed the amount you paid to {SITE_NAME}{' '}
          for that particular service, except where applicable law requires otherwise.
        </p>
      </Section>

      <Section n={40} title="Indemnity">
        <p>
          To the extent permitted by applicable law, you agree to be responsible for losses, claims,
          liabilities, damages, costs, and reasonable expenses arising from:
        </p>
        <List
          items={[
            'Your violation of these Terms.',
            'Your unlawful use of the Platform.',
            'Your property listing.',
            <>Your infringement of another person&rsquo;s rights.</>,
            <>Your misuse of another user&rsquo;s personal information.</>,
            'Your fraud or intentional misconduct.',
          ]}
        />
        <p>
          This section does not apply to the extent that the relevant claim was caused by our own
          unlawful conduct or negligence.
        </p>
      </Section>

      <Section n={41} title="Governing Law">
        <p>
          These Terms are governed by the laws of India. Subject to applicable law, disputes relating
          to these Terms or the Platform shall be subject to the jurisdiction of the competent courts
          having jurisdiction over{' '}
          <strong className="font-semibold">
            {LEGAL.jurisdictionCity}, {LEGAL.jurisdictionState}, India
          </strong>
          .
        </p>
        <p>
          The parties may also be subject to mandatory jurisdictional requirements under applicable
          law.
        </p>
      </Section>

      <Section n={42} title="Changes to These Terms">
        <p>We may update these Terms from time to time. Changes may be made because of:</p>
        <List
          items={[
            'New features.',
            'Changes in pricing.',
            'Changes in law.',
            'New Platform services.',
            'Security requirements.',
            'Operational changes.',
          ]}
        />
        <p>
          If a change materially affects your rights or obligations, we will provide appropriate
          notice as required by applicable law. The updated Terms will display a new &ldquo;Last
          updated&rdquo; date.
        </p>
        <p>
          Continuing to use {SITE_NAME} after the effective date of updated Terms may constitute
          acceptance of the updated Terms to the extent permitted by applicable law.
        </p>
      </Section>

      <Section n={43} title="Severability">
        <p>
          If any provision of these Terms is found to be invalid, unlawful, or unenforceable, the
          remaining provisions will continue to apply to the extent permitted by law.
        </p>
      </Section>

      <Section n={44} title="Entire Agreement">
        <p>
          These Terms, together with the Privacy Policy and any additional terms specifically
          presented for particular services, form the agreement governing your use of {SITE_NAME},
          subject to applicable law.
        </p>
      </Section>

      <Section n={45} title="Contact Us">
        <p>For questions regarding these Terms:</p>
        <Callout>
          <p>
            <strong className="font-semibold">{LEGAL.entityName}</strong> — a {LEGAL.entityType} of{' '}
            {LEGAL.proprietorName}
            <br />
            {LEGAL.registeredAddress}
            <br />
            {LEGAL.supportEmail}
          </p>
          <p className="mt-2">
            <strong className="font-semibold">Grievance Officer:</strong>{' '}
            {LEGAL.grievanceOfficerName} — {LEGAL.grievanceOfficerEmail}
          </p>
        </Callout>
      </Section>

      <Section n={46} title="Simple Summary">
        <p className="text-ink-500">
          {/*
            Kept as a summary and labelled as one. It is a reading aid, not a
            shorter version of the agreement — if it and a clause above ever
            disagree, the clause is what binds.
          */}
          A plain-language overview of the above. The numbered sections are what
          govern your use of the Platform.
        </p>

        <SubHeading>For buyers</SubHeading>
        <List
          items={[
            'Browse properties for free.',
            <>
              Get {F.freeUnlocksPerDay} seller contacts free every day, resetting at 00:00 IST.
            </>,
            <>Additional contact unlocks cost ₹{F.paidUnlockPrice} each.</>,
            'Your name and mobile number may be shared with a seller when you unlock their contact.',
            'Use seller contact information only for genuine property enquiries.',
          ]}
        />

        <SubHeading>For sellers</SubHeading>
        <List
          items={[
            'Posting properties is free.',
            'Provide accurate information.',
            'You must have authority to advertise the property.',
            'Keep listings updated.',
            <>
              When a buyer unlocks your contact, you receive the buyer&rsquo;s name and mobile number
              as a lead.
            </>,
            'Do not misuse buyer information.',
          ]}
        />

        <SubHeading>For everyone</SubHeading>
        <List
          items={[
            'Do not post fake listings.',
            'Do not scam or harass other users.',
            'Do not scrape the Platform.',
            'Do not bypass contact limits.',
            'Do your own property due diligence.',
            <>
              {SITE_NAME} is a marketplace, not a party to your property transaction.
            </>,
          ]}
        />

        <p className="font-semibold text-ink-900">
          By using {SITE_NAME}, you agree to these Terms of Use.
        </p>
      </Section>
    </LegalPage>
  );
}
