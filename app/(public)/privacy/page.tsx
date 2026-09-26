import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section, List, Callout } from '@/components/legal/legal-page';
import { LEGAL, LEGAL_FACTS } from '@/lib/legal';
import { SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${SITE_NAME}, operated by ${LEGAL.entityName}, collects, uses and protects personal data — including when a seller's contact is disclosed.`,
  alternates: { canonical: '/privacy' },
};

const F = LEGAL_FACTS;

/** Repeated verbatim in several sections; kept in one place. */
function ContactBlock() {
  return (
    <Callout>
      <p>
        <strong className="font-semibold">{LEGAL.grievanceOfficerName}</strong>
        <br />
        {LEGAL.entityName}
        <br />
        282/9, Rasi Nagar,
        <br />
        Chinna Andan Kovil Road,
        <br />
        Karur, Tamil Nadu, India
        <br />
        <a
          href={`mailto:${LEGAL.privacyEmail}`}
          className="font-medium text-brand-700 underline underline-offset-2"
        >
          {LEGAL.privacyEmail}
        </a>
      </p>
    </Callout>
  );
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <>
          <p>
            This Privacy Policy explains how <strong className="font-semibold">{LEGAL.entityName}</strong>{' '}
            (“{LEGAL.entityName}”, “we”, “us”, or “our”) collects, uses, stores, discloses, and
            protects personal data when you use <strong className="font-semibold">{SITE_NAME}</strong>,
            including the {SITE_NAME} website, platform, services, and related features
            (collectively, the “Platform”).
          </p>
          <p className="mt-3">
            {SITE_NAME} is operated by {LEGAL.entityName}, a {LEGAL.entityType} of{' '}
            {LEGAL.proprietorName}, {LEGAL.registeredAddress}. Privacy, grievance and support
            enquiries: {LEGAL.grievanceOfficerName},{' '}
            <a
              href={`mailto:${LEGAL.privacyEmail}`}
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              {LEGAL.privacyEmail}
            </a>
            .
          </p>
        </>
      }
    >
      <Section n={1} title="About 99Estate">
        <p>{SITE_NAME} is a real-estate marketplace that allows users to:</p>
        <List
          items={[
            'Browse property listings.',
            'Search and filter properties.',
            'Save properties.',
            'Post properties for sale or rent.',
            'Connect property seekers with property owners, agents, and builders.',
            'Unlock seller contact information.',
            'Receive or manage property leads.',
          ]}
        />
        <p>
          Browsing published property listings and viewing property information is generally
          available without payment.
        </p>
        <p>
          For authenticated users, {SITE_NAME} provides{' '}
          <strong className="font-semibold">
            {F.freeUnlocksPerDay} free successful contact unlocks per calendar day
          </strong>
          . After those free contact unlocks have been used, additional seller contact unlocks are
          available for <strong className="font-semibold">₹{F.paidUnlockPrice} per contact</strong>,
          subject to the applicable payment terms.
        </p>
      </Section>

      <Section n={2} title="Who we are">
        <p>
          {SITE_NAME} is operated by {LEGAL.entityName}, a {LEGAL.entityType} owned by{' '}
          {LEGAL.proprietorName}. A {LEGAL.entityType} is not a separate legal entity, so the
          proprietor is personally the party responsible for {SITE_NAME} and for the personal data
          processed through it.
        </p>
        <p>
          For purposes of applicable Indian data-protection law, {LEGAL.entityName} is responsible
          for determining the purposes and means of processing personal data through {SITE_NAME},
          subject to applicable law.
        </p>
        <ContactBlock />
      </Section>

      <Section n={3} title="Information we collect">
        <p>
          We collect only information that is reasonably necessary to provide, secure, and improve
          the Platform and its services.
        </p>
        <p className="font-semibold text-ink-900">3.1 Information received from Google</p>
        <p>
          {SITE_NAME} uses Google Sign-In for account registration and authentication. When you
          choose to sign in using Google, we may receive information made available to us through
          the Google authentication process, including:
        </p>
        <List
          items={[
            'Your name',
            'Email address',
            'Google account identifier',
            'Profile picture, where provided',
          ]}
        />
        <p>We do not receive your Google password.</p>
        <p>
          We do not use your Google account to access unrelated information, Gmail messages, Google
          Drive files, contacts, or other Google services unless a separate authorization is
          explicitly requested and provided.
        </p>
        <p>
          Google’s own privacy terms and policies also apply to Google’s processing of your
          information.
        </p>
      </Section>

      <Section n={4} title="Mobile number">
        <p>
          After signing in with Google, {SITE_NAME} may ask you to provide your mobile number. Your
          mobile number is required for certain Platform functions, including:
        </p>
        <List
          items={[
            'Posting a property.',
            'Unlocking seller contact information.',
            'Receiving or managing property leads.',
            'Supporting communication between users where a contact has been intentionally unlocked.',
          ]}
        />
        <p>
          {SITE_NAME} does <strong className="font-semibold">not currently use mobile OTP
          verification</strong> for account registration.
        </p>
        <p>Your mobile number is not publicly displayed on property listings.</p>
      </Section>

      <Section n={5} title="Information you provide directly">
        <p>Depending on how you use {SITE_NAME}, you may provide:</p>

        <p className="font-semibold text-ink-900">Account information</p>
        <List items={['Name', 'Email address', 'Mobile number', 'Profile image', 'Account preferences']} />

        <p className="font-semibold text-ink-900">Property information</p>
        <p>If you post a property, we may collect:</p>
        <List
          items={[
            'Property title, type, and sale/rent status',
            'Price and negotiation preference',
            'Area, BHK, bathrooms, balconies',
            'Floor information, total floors, property age',
            'Furnishing, parking, facing',
            'Property description and amenities',
            'State, city, locality, PIN code, address',
            'Optional map coordinates',
            'Property photographs',
            'Other information you choose to include in your listing',
          ]}
        />

        <p className="font-semibold text-ink-900">Other information</p>
        <List
          items={[
            'Saved properties',
            'Property reports and report reasons',
            'Feedback and support requests',
            'Information submitted during verification',
            'Information submitted when contacting us',
          ]}
        />
        <p>
          You are responsible for ensuring that information you provide is accurate and that you
          have the right to publish property information, photographs, documents, and other material
          that you upload.
        </p>
      </Section>

      <Section n={6} title="Information generated when you use 99Estate">
        <p>When you use the Platform, we may generate or collect information such as:</p>
        <List
          items={[
            'Properties you view and properties you save',
            'Contact unlocks, free contact unlock usage, and paid contact unlocks',
            'Leads',
            'Payment transaction records',
            'Notifications and listing status',
            'Account activity',
            'Security and fraud-prevention information',
            'Technical information required to operate the Platform',
          ]}
        />
      </Section>

      <Section n={7} title="Property view information">
        <p>
          We may record information about property views to understand listing activity and help
          prevent abuse or duplicate counting. Where technically appropriate, we may use techniques
          such as hashing or other privacy-preserving methods for certain technical identifiers.
        </p>
        <p>Such information may include:</p>
        <List
          items={[
            'IP address or a derived value',
            'Browser information',
            'Device or technical information',
            'Date and time of activity',
            'Property viewed',
          ]}
        />
        <p>We do not use this information for advertising profiling.</p>
        <p>
          Where a technical identifier is capable of being associated with an identifiable user, we
          will treat it as personal data where required by applicable law.
        </p>
      </Section>

      <Section n={8} title="Payment information">
        <p>
          {SITE_NAME} uses <strong className="font-semibold">Razorpay</strong> as its payment gateway
          for paid contact unlocks. When you purchase an additional contact unlock for ₹
          {F.paidUnlockPrice}, the payment is processed through Razorpay. Depending on the payment
          method and applicable requirements, Razorpay may process information necessary to complete
          and secure the transaction.
        </p>
        <p>{SITE_NAME} does not ask you to provide your:</p>
        <List
          items={['Card PIN', 'UPI PIN', 'Net-banking password', 'Payment authentication credentials']}
        />
        <p>directly to {SITE_NAME}. Payment processing is performed through the payment gateway.</p>
        <p>
          We generally receive and retain transaction-related information necessary to operate our
          Platform, such as:
        </p>
        <List
          items={[
            'Amount and currency',
            'Payment status',
            'Order identifier and payment identifier',
            'Refund information, where applicable',
            'Transaction date and time',
          ]}
        />
        <p>
          Razorpay has its own privacy practices and policies governing its processing of
          payment-related information.
        </p>
      </Section>

      <Section n={9} title="Why we collect and use your personal data">
        <p className="font-semibold text-ink-900">Account management</p>
        <List
          items={[
            `Create your ${SITE_NAME} account.`,
            'Authenticate you through Google.',
            'Maintain your account and keep you signed in.',
            'Complete your profile.',
          ]}
        />

        <p className="font-semibold text-ink-900">Property marketplace services</p>
        <List
          items={[
            'Publish property listings.',
            'Allow users to search for properties and display property information.',
            'Allow users to save properties.',
            'Allow sellers to manage their listings.',
            'Facilitate communication between property seekers and sellers.',
          ]}
        />

        <p className="font-semibold text-ink-900">Contact unlocks</p>
        <List
          items={[
            `Maintain the daily ${F.freeUnlocksPerDay}-contact free allowance.`,
            'Determine whether a contact has previously been unlocked.',
            `Process ₹${F.paidUnlockPrice} paid contact unlocks and verify successful payments.`,
            'Reveal seller contact information after an authorized unlock.',
            'Create the corresponding lead.',
          ]}
        />

        <p className="font-semibold text-ink-900">Lead management</p>
        <p>
          When a buyer unlocks a seller’s contact, we create a lead so that the seller knows who
          requested the contact.
        </p>

        <p className="font-semibold text-ink-900">Security and abuse prevention</p>
        <List
          items={[
            'Detect fake accounts and fraudulent activity.',
            'Prevent abuse of free contact unlocks and payment manipulation.',
            'Prevent automated scraping.',
            'Detect duplicate or fraudulent property listings.',
            'Investigate reports and complaints, and protect users and the Platform.',
          ]}
        />

        <p className="font-semibold text-ink-900">Legal and regulatory purposes</p>
        <List
          items={[
            'Comply with applicable Indian law and respond to lawful requests.',
            'Maintain transaction records.',
            'Establish, exercise, or defend legal claims.',
            'Investigate security incidents.',
          ]}
        />
      </Section>

      <Section n={10} title="The 2 free contacts per day">
        <p>
          {SITE_NAME} provides authenticated users with{' '}
          <strong className="font-semibold">
            {F.freeUnlocksPerDay} free successful seller-contact unlocks per calendar day
          </strong>
          . The allowance:
        </p>
        <List
          items={[
            'Applies to successful contact unlocks.',
            'Resets at approximately 12:00 AM India Standard Time (IST).',
            'Does not apply to ordinary property views.',
            'Is not consumed simply by opening a property page.',
            'Is not consumed when viewing a contact that the user has already unlocked.',
          ]}
        />
        <p>
          After the free contact unlocks have been used,{' '}
          <strong className="font-semibold">
            each additional contact unlock costs ₹{F.paidUnlockPrice}
          </strong>
          .
        </p>
        <p>
          {SITE_NAME} may introduce additional contact packages or other pricing options in the
          future. If we do so, the applicable price will be shown before payment.
        </p>
      </Section>

      <Section n={11} title="Contact information disclosure">
        <p>
          Contact information is a core part of the {SITE_NAME} marketplace and is handled
          differently from ordinary listing information.
        </p>

        <p className="font-semibold text-ink-900">Seller contact information</p>
        <p>A seller’s mobile number is not intended to be publicly displayed:</p>
        <List
          items={[
            'On search results',
            'On public property pages',
            'In public property feeds',
            'In public APIs',
          ]}
        />
        <p>
          A seller’s contact information is disclosed to a specific authenticated buyer only when the
          buyer successfully unlocks the contact for that particular property. An unlock may be one
          of the user’s {F.freeUnlocksPerDay} free daily contact unlocks, or a paid ₹
          {F.paidUnlockPrice} contact unlock after the free allowance has been exhausted.
        </p>

        <p className="font-semibold text-ink-900">Buyer information</p>
        <p>
          When a buyer unlocks a seller’s contact, the buyer’s relevant contact information,
          including their name and mobile number, may be provided to the seller as a lead. This is
          necessary so that the seller knows who requested the contact and can respond to the
          enquiry.
        </p>
        <Callout>
          Accordingly, contact unlocking is a{' '}
          <strong className="font-semibold">mutual connection mechanism</strong> rather than an
          anonymous phone-number lookup.
        </Callout>
      </Section>

      <Section n={12} title="Previously unlocked contacts">
        <p>If you have already unlocked a particular property’s contact information:</p>
        <List
          items={[
            'You will not be charged again for the same property solely because you access the unlocked contact again.',
            'The previous unlock remains recorded in your account history, subject to applicable retention requirements.',
            'The corresponding lead may remain available to the seller.',
          ]}
        />
      </Section>

      <Section n={13} title="Who we share personal data with">
        <p>We do not sell your personal data to advertisers or data brokers.</p>
        <p>
          We may share personal data with the following categories of recipients where necessary to
          operate {SITE_NAME}.
        </p>
        <p className="font-semibold text-ink-900">13.1 Supabase</p>
        <p>We use Supabase for services including:</p>
        <List
          items={[
            'Database infrastructure',
            'Authentication',
            'File storage',
            'Application backend services',
          ]}
        />
        <p>
          Account information, property information, photographs, and other Platform data may be
          stored or processed through Supabase.
        </p>
      </Section>

      <Section n={14} title="Google">
        <p>Google is used for account authentication.</p>
        <p>
          When you choose Google Sign-In, information necessary to create and authenticate your{' '}
          {SITE_NAME} account may be exchanged with Google through the OAuth authentication process.
        </p>
        <p>
          Google independently processes information under Google’s own terms and privacy policies.
        </p>
        <p className="font-semibold text-ink-900">Embedded video</p>
        <p>
          {/*
            Stated because an embed is a disclosure the visitor did not ask for.
            The nocookie host and lazy loading are what keep it to "when you
            press play" rather than "when the page opens" — the policy should
            describe the behaviour the code actually has.
          */}
          Where a seller has added a video tour, the listing page embeds a player from YouTube or
          Vimeo. {SITE_NAME} does not host these videos. The player is loaded only as you scroll to
          it, and we use YouTube’s no-cookie embed domain and Vimeo’s do-not-track parameter, so
          those services should not set advertising or tracking cookies before you choose to play.
          When you play a video, information such as your IP address and device details is processed
          by that service under its own privacy policy.
        </p>
      </Section>

      <Section n={15} title="Razorpay">
        <p>Razorpay processes payments for paid contact unlocks.</p>
        <p>
          For a ₹{F.paidUnlockPrice} contact unlock, information necessary to process and verify the
          transaction may be shared with or processed by Razorpay.
        </p>
        <p>
          Razorpay’s privacy policy explains its handling of customer and transaction information.
        </p>
      </Section>

      <Section n={16} title="Sellers and buyers">
        <p>When a contact is successfully unlocked:</p>
        <p className="font-semibold text-ink-900">The buyer may receive:</p>
        <List
          items={[
            'Seller’s name',
            'Seller’s mobile number',
            'Contact options such as call or WhatsApp',
          ]}
        />
        <p className="font-semibold text-ink-900">The seller may receive:</p>
        <List
          items={[
            'Buyer’s name',
            'Buyer’s mobile number',
            'Property associated with the enquiry',
            'Date and time of the enquiry',
          ]}
        />
        <p>
          This disclosure happens because the purpose of the contact-unlock feature is to establish a
          direct property enquiry.
        </p>
        <p>
          Users are responsible for how they use contact information received through the Platform
          and must comply with applicable law and the{' '}
          <Link href="/terms" className="font-medium text-brand-700 underline underline-offset-2">
            {SITE_NAME} Terms of Use
          </Link>
          .
        </p>
      </Section>

      <Section n={17} title="Legal and regulatory disclosures">
        <p>We may disclose personal data when reasonably necessary to:</p>
        <List
          items={[
            'Comply with a legal obligation.',
            'Respond to a lawful government, regulatory, court, or law-enforcement request.',
            'Investigate suspected fraud or unlawful activity.',
            `Protect the rights, property, or safety of ${SITE_NAME}, ${LEGAL.entityName}, users, or others.`,
            'Establish, exercise, or defend legal claims.',
          ]}
        />
        <p>
          We will seek to limit disclosures to what is reasonably necessary for the relevant purpose,
          subject to applicable law.
        </p>
      </Section>

      <Section n={18} title="International processing">
        <p>
          Some service providers used by {SITE_NAME} may process or store information in locations
          outside India.
        </p>
        <p>
          Where personal data is transferred, stored, or processed outside India, we will take steps
          required under applicable Indian data-protection law and applicable contractual or
          technical safeguards.
        </p>
      </Section>

      <Section n={19} title="Cookies and similar technologies">
        <p>
          {SITE_NAME} may use cookies and similar technologies that are necessary to operate the
          Platform. These may include:
        </p>
        <List
          items={[
            'Authentication and session cookies.',
            'Security-related cookies.',
            'Short-lived redirect or state cookies.',
            'Preferences necessary for Platform functionality.',
          ]}
        />
        <p>
          We do not currently use advertising cookies or third-party cross-site tracking cookies.
        </p>
      </Section>

      <Section n={20} title="Analytics">
        <p>At the initial launch, {SITE_NAME} may not use third-party analytics services.</p>
        <p>We may introduce analytics or measurement tools in the future to understand:</p>
        <List
          items={[
            'Platform usage',
            'Property search behaviour',
            'Performance and feature usage',
            'Errors',
            'Conversion and contact-unlock activity',
          ]}
        />
        <p>
          If we introduce analytics that involve personal data or require additional notice or
          consent under applicable law, we will update this Privacy Policy and implement the
          appropriate notice or consent mechanism before or when the relevant processing begins.
        </p>
      </Section>

      <Section n={21} title="Marketing communications">
        <p>
          {SITE_NAME} does not currently intend to send promotional marketing through SMS, WhatsApp
          or promotional email.
        </p>
        <p>We may send communications necessary to operate the Platform, such as:</p>
        <List
          items={[
            'Account-related messages',
            'Property approval notifications',
            'Payment confirmations',
            'Contact-unlock confirmations',
            'Lead notifications',
            'Security notifications and important service notices',
          ]}
        />
        <p>
          If we introduce promotional communications in the future, we will provide appropriate
          choices and comply with applicable law.
        </p>
      </Section>

      <Section n={22} title="Property photographs and user content">
        <p>
          When you upload photographs, descriptions, addresses, or other content as part of a
          property listing, you understand that the information may be displayed publicly as part of
          the listing.
        </p>
        <p>Do not upload:</p>
        <List
          items={[
            'Government IDs',
            'Bank details',
            'Passwords',
            'Private documents',
            'Another person’s confidential information',
          ]}
        />
        <p>
          unless {SITE_NAME} specifically requests such information through an authorized
          verification process.
        </p>
        <p>
          You are responsible for ensuring that your listing content does not infringe another
          person’s rights.
        </p>
      </Section>

      <Section n={23} title="Property verification">
        <p>{SITE_NAME} may introduce property or seller verification features.</p>
        <p>
          Where verification is requested, we may collect additional information reasonably necessary
          to perform the verification. Verification information may include documentation or other
          evidence submitted by the seller.
        </p>
        <p>
          Verification information will be handled for verification, fraud prevention, compliance,
          and marketplace-trust purposes.
        </p>
        <Callout>
          A verification badge does not constitute a guarantee, warranty, title certification, or
          legal confirmation of ownership.
        </Callout>
      </Section>

      <Section n={24} title="Data retention">
        <p>
          We retain personal data only for as long as reasonably necessary for the purposes described
          in this Privacy Policy, or for longer where required or permitted by applicable law.
          Retention may vary depending on the type of information.
        </p>
        <p className="font-semibold text-ink-900">Account information</p>
        <p>Generally retained while your account remains active.</p>

        <p className="font-semibold text-ink-900">Property listings</p>
        <p>
          Retained while published and for a reasonable period after removal or expiry where
          necessary for dispute handling, fraud investigation, legal compliance and marketplace
          records.
        </p>

        <p className="font-semibold text-ink-900">Contact unlocks and leads</p>
        <p>
          May be retained after account deletion where reasonably necessary for seller records,
          transaction history, fraud prevention, dispute resolution and legal compliance. Where
          appropriate, information may be anonymised or otherwise de-identified.
        </p>

        <p className="font-semibold text-ink-900">Payment records</p>
        <p>
          Transaction records may be retained for the period required for accounting, tax, financial
          reporting, fraud prevention and legal and regulatory requirements.
        </p>

        <p className="font-semibold text-ink-900">Security records</p>
        <p>
          Security and abuse-prevention information may be retained for a reasonable period necessary
          to protect the Platform and its users.
        </p>
      </Section>

      <Section n={25} title="Account deletion">
        <p>You may request deletion of your {SITE_NAME} account. Where you delete your account:</p>
        <List
          items={[
            'Your account may be deactivated.',
            'Your active property listings will be removed from public availability.',
            'Your profile will no longer be available as an active Platform profile.',
            'Certain information may be retained where required or reasonably necessary for legal, accounting, security, fraud-prevention, dispute-resolution, or transaction-record purposes.',
          ]}
        />
        <p className="font-semibold text-ink-900">Existing leads</p>
        <Callout>
          If another user has already unlocked your property contact, that user may already have
          received your contact information. Similarly, if you have unlocked another user’s contact,
          that seller may already have received your name and mobile number as a lead. Deleting your{' '}
          {SITE_NAME} account cannot technically retrieve information that has already been disclosed
          to another user.
        </Callout>
        <p>
          We may retain appropriate records of previous transactions or leads as required by
          applicable law or legitimate operational requirements.
        </p>
      </Section>

      <Section n={26} title="Your privacy rights">
        <p>
          Subject to applicable law, you may have rights relating to your personal data, including
          rights to:
        </p>
        <List
          items={[
            'Request information about the personal data we process about you.',
            'Request correction of inaccurate or incomplete personal data.',
            'Request deletion of personal data where applicable.',
            'Withdraw consent where processing is based on consent.',
            'Raise a grievance regarding our processing of your personal data.',
            'Nominate another person to exercise applicable rights on your behalf where permitted by law.',
          ]}
        />
        <p>
          Some requests may be subject to legal or operational limitations. For example, we may need
          to retain certain transaction records even after an account-deletion request where
          retention is required by law.
        </p>
        <p>
          The Digital Personal Data Protection Act, 2023 and applicable Rules establish requirements
          around notice, consent, rights, and grievance mechanisms.
        </p>
      </Section>

      <Section n={27} title="How to exercise your rights">
        <p>To make a privacy request, contact:</p>
        <ContactBlock />
        <p>
          Please provide enough information for us to understand your request and verify that the
          request relates to your account. We may ask for reasonable information necessary to verify
          your identity before processing certain requests.
        </p>
        <p>We will handle requests within the time period required by applicable law.</p>
      </Section>

      <Section n={28} title="Consent withdrawal">
        <p>
          Where we rely on your consent to process personal data, you may withdraw that consent
          through the mechanism we provide or by contacting us. Withdrawing consent may affect your
          ability to use certain {SITE_NAME} features.
        </p>
        <p>For example, your mobile number is necessary for:</p>
        <List
          items={[
            'Posting properties',
            'Unlocking seller contacts',
            'Certain lead and communication features',
          ]}
        />
        <p>Therefore, removing your mobile number may prevent you from using those features.</p>
        <p>
          Withdrawal of consent does not affect processing that was lawfully carried out before
          withdrawal or processing that we are otherwise permitted or required to perform under
          applicable law.
        </p>
      </Section>

      <Section n={29} title="Security">
        <p>
          We take reasonable technical and organisational measures designed to protect personal data
          from unauthorized access, unauthorized disclosure, loss, misuse, alteration and
          destruction. Security measures may include:
        </p>
        <List
          items={[
            'Encryption in transit',
            'Authentication controls',
            'Database access controls',
            'Supabase Row Level Security where applicable',
            'Server-side authorization',
            'Restricted administrative credentials',
            'Payment-provider security controls',
            'Access logging and rate limiting',
            'Fraud prevention mechanisms',
          ]}
        />
        <p>
          Seller contact information is protected using server-side authorization and database-level
          access controls. Payment authentication information such as card PINs and UPI PINs is not
          intentionally collected by {SITE_NAME}.
        </p>
        <p>No internet-based system can guarantee absolute security.</p>
      </Section>

      <Section n={30} title="Payment security">
        <p>
          Payments for ₹{F.paidUnlockPrice} contact unlocks are processed through Razorpay.{' '}
          {SITE_NAME} does not request users to submit their UPI PIN, card PIN, or banking password
          directly to {SITE_NAME}.
        </p>
        <p>
          Payment verification is performed through server-side payment mechanisms and
          payment-provider responses.
        </p>
        <Callout>
          We do not consider a client-side payment-success message alone sufficient to unlock a
          seller’s contact.
        </Callout>
      </Section>

      <Section n={31} title="Children">
        <p>
          {SITE_NAME} is intended for users who are{' '}
          <strong className="font-semibold">18 years of age or older</strong>. We do not knowingly
          design the Platform for children under 18.
        </p>
        <p>
          If you believe that a person under 18 has provided personal data to us, please contact us
          at{' '}
          <a
            href={`mailto:${LEGAL.privacyEmail}`}
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            {LEGAL.privacyEmail}
          </a>
          . We will assess the request and take appropriate action as required by applicable law.
        </p>
      </Section>

      <Section n={32} title="Third-party websites and services">
        <p>{SITE_NAME} may contain links or integrations to third-party services, including:</p>
        <List
          items={[
            'Google',
            'Razorpay',
            'WhatsApp',
            'Maps or location services',
            'Other services introduced in the future',
          ]}
        />
        <p>
          When you interact with a third-party service, that service may process your information
          according to its own privacy policy. {SITE_NAME} is not responsible for the privacy
          practices of third-party services that it does not control.
        </p>
      </Section>

      <Section n={33} title="WhatsApp and calling">
        <p>
          If you choose to contact a seller through a phone call, WhatsApp, or another external
          communication method, the subsequent communication occurs outside the control of{' '}
          {SITE_NAME}. The relevant third-party service may process your personal data according to
          its own policies.
        </p>
        <p>
          Users should exercise reasonable caution when sharing additional personal or financial
          information with another party.
        </p>
      </Section>

      <Section n={34} title="User responsibility after contact unlock">
        <p>
          {SITE_NAME} provides a connection between property seekers and property providers. Once
          contact information has been unlocked and disclosed, users are responsible for their
          subsequent communications.
        </p>
        <p>Users must not:</p>
        <List
          items={[
            'Harass another user.',
            'Spam another user.',
            'Misuse contact information.',
            'Sell or redistribute contact information.',
            'Use contact information for unrelated marketing without appropriate legal basis or consent.',
            'Threaten or impersonate another person.',
            'Engage in fraudulent activity.',
          ]}
        />
        <p>We may suspend or terminate accounts involved in misuse.</p>
      </Section>

      <Section n={35} title="Fraud and abuse prevention">
        <p>We may monitor and analyse Platform activity to identify:</p>
        <List
          items={[
            'Fake listings and duplicate listings',
            'Fraudulent accounts',
            'Payment abuse',
            'Contact scraping and automated abuse',
            'Repeated creation of accounts to bypass daily free-contact limits',
            'Misuse of contact information',
            'Other activity that may harm users or the Platform',
          ]}
        />
        <p>Where appropriate, we may:</p>
        <List
          items={[
            'Restrict access',
            'Suspend an account',
            'Remove a listing',
            'Block a user',
            'Investigate activity',
            'Report activity to appropriate authorities where legally required or appropriate',
          ]}
        />
      </Section>

      <Section n={36} title="Automated decision-making">
        <p>
          {SITE_NAME} does not currently intend to make decisions producing legal or similarly
          significant effects solely through automated processing of personal data.
        </p>
        <p>Automated systems may be used for ordinary Platform functions such as:</p>
        <List
          items={[
            'Spam detection',
            'Fraud detection',
            'Search ranking',
            'Duplicate detection',
            'Security controls',
          ]}
        />
        <p>
          Such systems are not intended to make legally significant decisions about you without
          appropriate human involvement where required.
        </p>
      </Section>

      <Section n={37} title="Changes to this Privacy Policy">
        <p>We may update this Privacy Policy from time to time. Changes may be made because of:</p>
        <List
          items={[
            'New features',
            'New service providers',
            'Changes in law',
            'Changes in our data practices',
            'Security improvements',
            'Operational requirements',
          ]}
        />
        <p>
          When we make material changes to how personal data is processed, we will provide
          appropriate notice as required by applicable law. The updated version will display a new
          “Last Updated” date.
        </p>
      </Section>

      <Section n={38} title="Contact and Grievance Officer">
        <p>For privacy questions, personal-data requests, or grievances, contact:</p>
        <ContactBlock />
        <p>
          We will acknowledge and handle grievances in accordance with applicable law and our
          applicable grievance procedures.
        </p>
        <p>
          Where applicable, users may have the right to escalate unresolved matters to the relevant
          data-protection authority or tribunal established under Indian law.
        </p>
      </Section>

      <Section n={39} title="Important contact information">
        <p className="font-semibold text-ink-900">Privacy and grievances</p>
        <p>
          {LEGAL.grievanceOfficerName}, {LEGAL.entityName} —{' '}
          <a
            href={`mailto:${LEGAL.grievanceOfficerEmail}`}
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            {LEGAL.grievanceOfficerEmail}
          </a>
        </p>
        <p className="font-semibold text-ink-900">General support</p>
        <p>
          <a
            href={`mailto:${LEGAL.supportEmail}`}
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            {LEGAL.supportEmail}
          </a>
        </p>
        <p className="font-semibold text-ink-900">Registered office</p>
        <p>
          {LEGAL.entityName} — a {LEGAL.entityType} of {LEGAL.proprietorName}
          <br />
          {LEGAL.registeredAddress}
        </p>
      </Section>

      <Section n={40} title="Summary">
        <p>In simple terms:</p>
        <List
          items={[
            <>
              <strong className="font-semibold">You can browse.</strong> Published property listings
              are viewable without paying.
            </>,
            <>
              <strong className="font-semibold">You can post.</strong> Property owners can post
              listings without a listing fee.
            </>,
            <>
              <strong className="font-semibold">
                You get {F.freeUnlocksPerDay} free contacts a day.
              </strong>{' '}
              Authenticated users receive {F.freeUnlocksPerDay} free successful seller-contact
              unlocks per calendar day.
            </>,
            <>
              <strong className="font-semibold">
                Additional contacts cost ₹{F.paidUnlockPrice}.
              </strong>
            </>,
            <>
              <strong className="font-semibold">Contact information is private.</strong> A seller’s
              phone number is not publicly displayed.
            </>,
            <>
              <strong className="font-semibold">Contact unlocking is mutual.</strong> You receive the
              seller’s contact information, and the seller receives your name and mobile number as a
              lead.
            </>,
            <>
              <strong className="font-semibold">We don’t sell your data</strong> to advertisers or
              data brokers.
            </>,
            <>
              <strong className="font-semibold">Google</strong> is used to authenticate your account,
              and <strong className="font-semibold">Razorpay</strong> processes paid contact-unlock
              transactions.
            </>,
          ]}
        />
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
