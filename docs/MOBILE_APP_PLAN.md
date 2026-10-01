# SNB Hive mobile app delivery plan

## Goal

Ship customer-facing iOS and Android apps without creating a second booking
system. The web app, mobile apps, and admin site will continue to use the same
Supabase data and Edge Functions.

The recommended implementation is to make the existing React app work well as
a mobile application and package its Vite build with Capacitor. Native features
are then added through small adapters rather than by rewriting the product in
React Native or Flutter.

## Principles

1. **One source of truth:** classes, bookings, customers, payments, and capacity
   remain in Supabase.
2. **One customer UI codebase:** mobile and web share React components and
   booking rules.
3. **Native boundaries stay small:** notifications, secure credential storage,
   deep links, calendars, and platform lifecycle events sit behind adapters.
4. **The server confirms important outcomes:** the app never treats a payment
   redirect or local notification as proof that a payment or booking succeeded.
5. **Deliver vertical slices:** every milestone ends with a usable, testable
   customer journey on a real phone.

## Before development starts

The business owner and developer should agree on these items first:

- Apple application name and bundle identifier (suggested identifier:
  `com.snbhive.app`).
- Android application ID, normally the same reverse-domain identifier.
- The domain that will handle verified payment and email deep links.
- Ownership of the Apple Developer and Google Play Console accounts. Both
  accounts should be owned by SNB Hive rather than a contractor.
- Whether customers may browse while signed out. Requiring sign-in only when a
  customer books will usually reduce friction.
- Which notification types are transactional and which are optional marketing.
- A support email, privacy contact, and account-deletion process.

Do not generate the native projects until the identifiers are confirmed. They
become difficult to change after store records and platform credentials exist.

## Milestone 0: baseline and acceptance journeys

Create a short-lived feature branch and record the current baseline:

```bash
npm ci
npm run build
npm run test:booking-utils
npm run test:membership-proration
npm run test:gocardless-checkout
npm run test:gocardless-webhook
npm run check:edge-functions
```

Define the version-one acceptance journeys before changing the UI:

1. A new customer can register, verify their account, and sign in.
2. A customer can browse classes and see live availability.
3. A customer can create a free, PAYG, or membership booking as applicable.
4. GoCardless can leave the app and return the customer to the correct booking.
5. The booking changes only when the server/webhook confirms its status.
6. A customer can see and cancel an eligible booking.
7. A customer can update or delete their account.
8. A booking can be added to the device calendar.
9. A confirmed customer receives an opted-in reminder.

Capture screenshots and results for these journeys at mobile widths before and
after each milestone. Start with 320, 375, 390, and 430 CSS pixels, then verify
on at least one real iPhone and one real Android device.

## Milestone 1: mobile-first web experience

Complete this work before Capacitor is introduced. It keeps UI problems easy to
debug in the browser and improves the existing website immediately.

### Work

- Replace the crowded small-screen header links with a fixed bottom navigation
  bar. Keep the current header navigation on larger screens.
- Add CSS safe-area padding using `env(safe-area-inset-*)`.
- Ensure booking modals remain visible when the software keyboard opens.
- Give interactive controls suitable touch targets and visible focus states.
- Add explicit empty, loading, offline, and retry states.
- Make Android back navigation close a modal or return to the prior app view
  before exiting.
- Audit form labels, screen-reader names, contrast, text scaling, and focus
  order.
- Prefer a real client-side route for shareable screens rather than relying
  solely on component state.

### Definition of done

- All acceptance journeys work in mobile Safari and Chrome.
- No horizontal page scrolling occurs at the target widths.
- Navigation and booking remain usable with 200% text zoom.
- Keyboard, modal, and back-button behaviour is documented and tested.
- Desktop behaviour is unchanged.

## Milestone 2: authentication and data authorization

Do this before a public store release. The current custom member session should
be migrated to Supabase Auth so mobile and web use standard, revocable sessions.

### Work

- Introduce Supabase Auth for sign-up, sign-in, email verification, password
  reset, refresh, sign-out, and account deletion.
- Migrate or reset existing customer credentials through a documented process;
  never attempt to recover plain-text passwords.
- Add Row Level Security policies so a customer can access only their own user
  and booking records.
- Keep administrative operations behind verified server-side authorization.
- Add a small session-storage interface. Web can use the Supabase browser
  implementation; native builds should store sensitive refresh credentials in
  Keychain/Keystore through a maintained secure-storage plugin.
- Test expired, revoked, and concurrent sessions.

### Definition of done

- A customer cannot read or alter another customer's record using the public
  client key.
- Password reset and account deletion work on web and both mobile platforms.
- No service-role key or provider secret appears in the compiled web assets or
  native package.

## Milestone 3: Capacitor shell

Once the application identifiers are confirmed, install the current compatible
Capacitor packages. Pin the selected major version in `package-lock.json` rather
than copying a version number from this document.

```bash
npm install @capacitor/core
npm install --save-dev @capacitor/cli
npm install @capacitor/ios @capacitor/android
npx cap init "SNB Hive" "com.snbhive.app"
npx cap add ios
npx cap add android
npm run build
npx cap sync
```

The generated Capacitor config must use Vite's `dist` directory as `webDir`.
Add repeatable scripts similar to these after generation:

```json
{
  "mobile:sync": "npm run build && cap sync",
  "mobile:ios": "cap open ios",
  "mobile:android": "cap open android"
}
```

Native projects, configuration, icons, and splash assets should be committed.
Developer signing files, certificates, provisioning profiles, keystores, and
local IDE state must not be committed.

### Definition of done

- A clean checkout can build the web assets and sync both platforms.
- Debug builds launch on a physical iPhone and Android phone.
- Production environment variables are supplied by the build pipeline and no
  secrets are embedded.
- External links, email links, telephone links, maps, and the system back button
  behave correctly.

## Milestone 4: payments and verified deep links

GoCardless should open in the system browser rather than an embedded payment
WebView. Use an HTTPS return URL associated with both applications so it works
as an iOS Universal Link, Android App Link, and normal web fallback.

### Required flow

1. Create the pending booking on the server.
2. Request a hosted GoCardless authorization URL.
3. Open that URL in the system browser.
4. Return through the verified HTTPS payment-complete URL.
5. Route the installed app to the relevant booking; otherwise show the web
   payment-complete page.
6. Reload status from Supabase while the webhook remains authoritative.

### Test cases

- Successful authorization.
- Customer cancels or closes the browser.
- App is killed while payment is open.
- App is not installed.
- Return link is opened on a different device.
- Webhook arrives before or after the customer returns.
- Duplicate link and webhook delivery.

Never mark a booking paid solely because the customer followed the success
redirect.

## Milestone 5: useful native capabilities

Release native features as separate vertical slices:

1. **Calendar:** add a confirmed class with venue, map URL, and preparation
   notes after explicit permission.
2. **Transactional push:** booking confirmation, cancellation, material schedule
   change, and reminder. Store device tokens per authenticated installation and
   remove invalid tokens.
3. **Deep navigation:** notification and email links open the relevant booking
   or class.
4. **Biometric convenience:** optionally unlock an existing authenticated
   session; biometrics must not replace server authentication.
5. **Native sharing:** share a public HTTPS class or retreat URL.

Notification permission should be requested in context, not at first launch.
Marketing notifications require a separate, recorded opt-in and unsubscribe
path.

## Milestone 6: beta, observability, and store submission

- Add privacy-conscious crash reporting and release identifiers.
- Provide an in-app support route and diagnostic version number.
- Prepare icons, launch artwork, screenshots, descriptions, privacy disclosures,
  data-safety responses, and reviewer notes.
- Give reviewers a working test account and clear instructions for any hosted
  payment sandbox.
- Test through Apple TestFlight and Google Play internal testing before public
  review.
- Verify account deletion, permission denial, poor network conditions, upgrade
  from the previous build, and fresh installation.
- Roll out gradually and monitor crashes, payment errors, and booking failures.

Store requirements change frequently. Re-check the current Apple, Google, SDK,
and Capacitor requirements at the start of implementation and immediately
before submission.

## Suggested first two-week sprint

### Week 1

- Confirm identifiers, account ownership, domains, and notification scope.
- Run and record the baseline checks.
- Write automated smoke tests for the version-one acceptance journeys.
- Implement small-screen bottom navigation and safe-area handling.
- Fix keyboard, modal, offline, and error states found during device testing.

### Week 2

- Design the Supabase Auth and RLS migration.
- Implement sign-up/sign-in/password-reset behind the storage interface.
- Verify cross-customer isolation with database-level tests.
- Run the complete acceptance suite on the responsive web build.

At the sprint review, decide whether the authentication milestone meets its
security gates. If it does, generate the Capacitor projects in the next sprint.
This avoids hiding unresolved web and authorization problems inside native
tooling.

## Release-one scope

### Include

- Customer registration, verification, sign-in, reset, and deletion.
- Browse classes and view live availability.
- Book and cancel where permitted.
- PAYG/membership GoCardless flow.
- My bookings and account management.
- Studio-hire enquiry.
- Transactional notifications and calendar export.
- Privacy, terms, and support.

### Defer

- A native admin dashboard.
- Chat or a community feed.
- Health data integration.
- Complex offline booking.
- A separate React Native or Flutter implementation.

## Ongoing engineering workflow

For every mobile feature:

1. Write its customer outcome and failure cases.
2. Implement shared behaviour in React or the server first.
3. Put platform-specific behaviour behind a narrow adapter.
4. Add automated tests for business rules and authorization.
5. Test web, iOS, and Android builds.
6. Exercise the feature on real devices.
7. Release it through beta before production.

This sequence keeps the downloadable apps aligned with the website while still
allowing them to feel native where it matters.
