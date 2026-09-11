# NOUN Exam Summary Hub

A mobile-first NOUN course-summary website for searching courses, purchasing individual summaries or Premium access, uploading manual-transfer proof, and securely downloading authorized PDFs.

## IMPORTANT: RECOMMENDED DEPLOYMENT DOES NOT REQUIRE NODE.JS ON YOUR COMPUTER

You can deploy the frontend with Vercel and deploy Firebase Cloud Functions through the included GitHub Actions workflows. Node.js runs inside the GitHub cloud runner; you do **not** need Node.js, npm, Git CLI, or Firebase CLI installed locally for the recommended path.

The optional local-developer method is only for developers who already use Node.js.

---

# 1. What is in this project?

- Static frontend: HTML/CSS/vanilla JavaScript
- Firebase Authentication: email/password login
- Firestore: users, courses, payments and payment intents
- Cloudinary: course PDFs
- Cloudinary: course PDFs and manual payment-proof image uploads
- Firebase Cloud Functions: payment verification, admin approval, Firebase role bootstrap, protected PDF URL generation, webhook endpoint
- Vercel: frontend hosting
- GitHub Actions: no-local-Node cloud deployment

---

# 2. Payment architecture

Payment is by **manual bank transfer only**. There is no card or online gateway.

The student transfers the amount to the account shown in the payment popup, uploads a payment screenshot, and taps "I Have Paid". This creates a pending payment request in Firestore.

An administrator reviews the request in the Admin Dashboard and approves or rejects it. Approval happens server-side with the Firebase Admin SDK: the server reads the stored payment document (never browser input) and grants exactly what was paid for — a single course for a course payment, premium for a premium payment. Approval runs in a Firestore transaction, so a payment can only be approved once.

Manual transfer payments: the student uploads proof to Cloudinary and an authenticated administrator approves/rejects the pending payment through a protected Cloud Function.

---

# 3. Prices

- Individual course: **₦500**
- Premium: **₦5,000**
- Currency: **NGN**

The backend determines the expected amount. Do not trust an amount supplied by the browser.

---

# 4. Firebase project

Existing project:

`nounsummaries-4cd16`

Firebase Web configuration is already present in `js/config.js`.

Firebase Web configuration is public client configuration. It is different from Firebase Admin credentials, which must remain private.

---

# 5. Firebase Authentication

In Firebase Console:

1. Open `nounsummaries-4cd16`.
2. Open **Authentication**.
3. Open **Sign-in method**.
4. Enable **Email/Password**.
5. Save.

---

# 6. Making someone an administrator

There is no hardcoded admin email or password anywhere in this app. Anyone can
be an admin — it's controlled by the `role` field on their Firestore user
document.

1. Have the person sign up normally through `signup.html` (any email).
2. Go to **Firebase Console → Firestore Database → `users` collection**.
3. Find their document (match by the `email` field, or ask them for their
   account's UID from Authentication → Users).
4. Edit the `role` field from `"user"` to `"admin"`. Save.
5. A Cloud Function (`syncUserRoleClaim`) fires automatically and sets the
   matching Firebase Authentication custom claim within a few seconds.
6. Have the person reload the site (or sign out/in). `admin.html` and all
   Firestore rules check that custom claim, so they now have full admin
   access.

To remove admin access, set `role` back to `"user"` the same way.

Editing Firestore documents in the Console uses Admin SDK privileges and
bypasses security rules, so this works even though normal users can **not**
edit their own `role` field through the app itself — that's enforced in
`firestore.rules`, which is what keeps this safe.


The browser derives:

```text
isAdmin = token.claims.role === "admin"
```

and the Admin Dashboard is shown only when that value is true.

All privileged backend operations and Firebase Security Rules independently check the same custom claim. Hiding the dashboard is not the security boundary.

If the role is already assigned, the setup function is idempotent and reports that administrator access is already active.

# 8. Firebase service account / deployment

The website itself does not contain Firebase Admin credentials. Firebase Admin SDK runs only inside Cloud Functions.

For deployment you may use the included GitHub Actions workflow, Firebase/Google Cloud tooling, or another secure CI environment. GitHub is **not** required for assigning or using the administrator role.

Never place a Firebase service-account private key in frontend JavaScript.

### Required runtime secrets for this implementation



Do not put either value in `js/config.js` or any frontend file.

---

# 11. GitHub Actions runtime secrets

The deployment workflow expects these GitHub repository secrets:

| GitHub Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Deploy Firebase resources from the cloud runner |

Do not put these values into the frontend.

The workflow creates/updates the Firebase Secret Manager values and then deploys the Functions.

When a Firebase secret changes, redeploy the Functions so the new version is available to the deployed functions.

---

# 12. Cloudinary setup

Existing public configuration:

Cloud name:

`u4njovfm`

Unsigned upload preset:

`ml_default`

These are used for payment-proof images.

Cloudinary unsigned upload does not require a Cloudinary API secret in the frontend.

Do not put a Cloudinary private API secret in the frontend. For course PDFs, uploads are signed server-side and delivered publicly as raw/upload assets (access is enforced by the /api/get-course-pdf-url entitlement check). Store the Cloudinary API credentials only as Firebase Functions secrets/environment configuration.

---

# 13. Bank-transfer details

The bank name, account name and account number are stored in Firestore at `settings/bank` and can be edited by the administrator in Admin Dashboard → Bank Details. Values in `js/config.js` are only fallbacks shown before the admin saves real details.


Edit `js/config.js`:

```js
bank: {
  bankName: "YOUR BANK NAME",
  accountName: "YOUR ACCOUNT NAME",
  accountNumber: "YOUR ACCOUNT NUMBER"
}
```

These are public payment instructions, not API secrets.

The user flow is:

1. Choose a course or Premium.
2. Choose bank transfer.
3. See bank details.
4. Transfer the exact amount.
5. Upload proof.
6. Submit the payment request.
7. Payment remains `pending`.
8. Admin reviews it.
9. Admin approves/rejects through the protected backend.

---

# 14. Frontend configuration

Edit `js/config.js` only for public configuration and deployed Function URLs.

After Firebase Functions are deployed, replace these placeholders:

`approveManualPaymentUrl`

`rejectManualPaymentUrl`

`getCloudinaryUploadSignature
- getCoursePdfUrl`

with the corresponding deployed Firebase Function URLs.


---

# 15. Firestore rules

The production rules are in:

`firestore.rules`

They enforce:

- authenticated user ownership
- admin custom claim authorization
- no user self-granted Premium
- no user self-granted paid courses
- no client-side payment approval/rejection
- fixed manual-payment amounts
- no payment deletion
- admin-only course management

Deploy them through the included GitHub workflow.

---

# 16. Storage rules

The production rules are in:


Course PDFs are stored in **Cloudinary**. Firebase Storage is not used by this project. The backend checks entitlement in Firestore before returning a Cloudinary delivery URL.

Admins upload/delete course PDFs.

The backend `getCloudinaryUploadSignature
- getCoursePdfUrl` function checks the student's entitlement and issues a short-lived signed URL only when access is allowed.

This is important: the frontend's entitlement check is not the security boundary. The backend is.

---

# 17. Course PDF security

New course records store:

- course code
- course name
- `storagePath`
- `isFree`
- `createdAt`

They do not store a permanent Firebase `downloadURL`.

When a student needs a PDF:

Student → Firebase Auth → `getCloudinaryUploadSignature
- getCoursePdfUrl` → entitlement check → short-lived signed URL → PDF

If the student is not entitled, the Function returns an error.

### Existing courses created by the old version

The old project may have course documents containing `pdfURL`.

Before production, remove those legacy fields so public course documents no longer expose old download URLs.

A no-Node GitHub workflow is included:

**Remove Legacy Course PDF URLs**

Run it once from GitHub Actions after uploading the project. It uses the Firebase service-account secret and removes the legacy `pdfURL` field from course documents.

Also confirm that each course has `pdfPublicId`/`pdfURL`. If an old course only has `storagePath`, re-upload its PDF through the Admin Dashboard so the metadata points to Cloudinary.

Do not publish old unrestricted download URLs.

---

# 18. Free-course rule

The project preserves the `freeCoursesUsed` concept as a one-free-course allowance.

The first free course a student opens is recorded as their selected free course using:

`freeCourseCode`

and:

`freeCoursesUsed: 1`

The operation is performed server-side and atomically.

A student cannot simply modify their browser JavaScript or Firestore document to obtain additional free courses.

Premium users bypass the free-course restriction because Premium unlocks all courses.

---

# 20. Manual payment approval flow

The browser does not grant access when an admin clicks Approve.

Instead:

Admin Dashboard → `approveManualPayment` Function → verify admin claim → verify pending payment → Firestore transaction → grant access + approve payment

The same principle applies to rejection.

This prevents partial approval states and duplicate approval races.

---

# 21. Vercel deployment — no Node required locally

Recommended method:

### Step 1
Create a private GitHub repository.

### Step 2
Upload the project files using GitHub's browser interface.

### Step 3
Connect the GitHub repository to Vercel.

### Step 4
Deploy the static frontend.

### Step 5
Configure the public frontend configuration in `js/config.js` with the deployed Function URLs.

### Step 6
Add the GitHub Actions secrets listed above.

### Step 7
Run:

**Deploy Firebase Functions**

from GitHub Actions.

### Step 8

### Step 9
Run:

**Set Firebase Admin Claim**

from GitHub Actions.

### Step 10
Sign in as the administrator and test the dashboard.

---

# 22. What runs where?

| Component | Location |
|---|---|
| Website HTML/CSS/JS | Vercel |
| Firebase Auth | Firebase |
| Firestore | Firebase |
| Course PDF files | Cloudinary |
| Course PDFs | Cloudinary |
| Payment proofs | Cloudinary |
| Payment verification | Firebase Cloud Functions |
| Admin approval | Firebase Cloud Functions |
| PDF entitlement check | Firebase Cloud Functions |
| Webhook | Firebase Cloud Functions |
| Function deployment | GitHub Actions cloud runner |

---

# 23. Optional local developer deployment

Developers who already have Node.js may deploy manually using Firebase CLI.

This is optional.

The recommended production workflow does not require Node.js installed locally.

If using local deployment, install dependencies in `functions/` and deploy using Firebase CLI from the project root.

---

# 24. Important secret rules

NEVER commit:

- Firebase service-account JSON
- administrator password
- private API keys
- access tokens

The repository includes `.env.example` only as documentation for server-side secret names.

The actual runtime secrets are stored in Firebase Secret Manager through the cloud deployment workflow.

---

# 25. Configuration summary

| Value | Location | Secret? |
|---|---|---|
| Firebase Web API key | `js/config.js` | No |
| Firebase project ID | `js/config.js` | No |
| Cloudinary cloud name | `js/config.js` | No |
| Cloudinary upload preset | `js/config.js` | No |
| Firebase Function URLs | `js/config.js` | No |
| Bank details | `js/config.js` | No |
| Firebase service-account JSON | GitHub Actions Secret | YES |
| Admin password | Firebase Authentication | YES |

---

# 26. Troubleshooting

## Admin Dashboard is hidden

Check:

1. The Firebase user exists.
2. The email is correct.
3. The Set Firebase Admin Claim workflow succeeded.
4. The workflow used the correct Firebase project.
5. Sign out and sign in again.
6. Make sure the ID token was refreshed.

## Manual payment remains pending

Check:

1. Payment proof uploaded successfully.
2. Payment document exists.
3. Admin has the Firebase custom claim `role: "admin"`.
4. `approveManualPayment` URL is correct.
5. Firestore rules are deployed.

## PDF says unauthorized

Check:

1. User is logged in.
2. Course is paid and has been approved, or user is Premium.
3. Free-course allowance has not already been used for another course.
4. Course has a valid `pdfPublicId` stored as a public Cloudinary `raw/upload` asset.
5. `getCloudinaryUploadSignature
- getCoursePdfUrl` is deployed.

## Vercel works but backend does not

Vercel and Firebase Functions are separate deployments.

The frontend can load correctly even if Functions are not deployed/configured yet.

Deploy the Firebase Functions through GitHub Actions and then put the correct Function URLs into `js/config.js`.

---

# 27. Final production checklist

- [ ] Firebase Authentication enabled
- [ ] Admin account created
- [ ] Firebase custom claim `role: "admin"` assigned
- [ ] Admin signed out/in after claim assignment
- [ ] Firestore rules deployed
- [ ] Storage rules deployed
- [ ] Cloudinary upload preset works
- [ ] Firebase Functions deployed
- [ ] Function URLs copied into `js/config.js`
- [ ] Bank details configured
- [ ] Vercel deployment working
- [ ] Manual transfer tested
- [ ] Admin approval tested
- [ ] Failed payment tested
- [ ] Wrong amount rejected
- [ ] Duplicate transaction rejected
- [ ] Unpaid course PDF denied
- [ ] Paid course PDF allowed
- [ ] Premium access tested
- [ ] Free-course allowance tested
- [ ] No secrets committed to GitHub

---

# 28. Security reminder

Frontend checks are for user experience only.

Authorization is enforced by Firebase Rules and trusted Cloud Functions.

Never paste secret credentials into frontend files.

Never commit service-account JSON.

Never grant course access solely because a payment callback says successful.

Always verify the transaction server-side before giving the student access.
# noun-summaries
