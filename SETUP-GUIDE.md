# Complete setup guide — Pay When Approved

This guide walks you through wiring up the entire system end-to-end. Estimated time: 2–3 hours for first-time setup.

## What you're building

Five components, in this order:

1. **Google Sheet** — your case database
2. **Vercel app** — handles the Squarespace → Stripe redirect
3. **Stripe** — configuration (webhooks, Terms of Service URL)
4. **n8n** — two workflows that connect Stripe ↔ Sheets
5. **Squarespace** — updated button link

---

## Step 1: Create the Google Sheet

1. Go to https://sheets.google.com → new spreadsheet
2. Name it: **Pay When Approved — Cases**
3. Rename the first tab from "Sheet1" to **Cases**
4. In row 1, add these exact column headers (copy-paste this whole row):

```
case_id	created_at	customer_name	customer_email	customer_phone	beneficiary_name	case_reference	stripe_customer_id	stripe_payment_method_id	card_brand	card_last4	card_exp	amount_due_cents	status	charged_at	payment_intent_id	notes
```

5. Make row 1 bold and freeze it: **View → Freeze → 1 row**
6. Copy the spreadsheet ID from the URL — you'll need it later. URL format:
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_THE_ID`**`/edit`

### Recommended: add data validation for the `status` column

This prevents typos that would break the workflow.

1. Select the entire `status` column (click column header)
2. **Data → Data validation → Add rule**
3. Criteria: **Dropdown** with these values:
   - `pending`
   - `approved`
   - `paid`
   - `payment_failed`
   - `denied`
   - `cancelled`
4. Save

Now you can only set `status` to those values via dropdown.

---

## Step 2: Deploy the Vercel app

### 2a. Get the code

You have two options:

**Option 1 — Push to GitHub (recommended for ongoing development)**
```bash
cd pay-when-approved
git init
git add .
git commit -m "Initial commit"
gh repo create pay-when-approved --private --source=. --push
```

**Option 2 — Drag and drop to Vercel**
- Zip the `pay-when-approved` folder
- Go to vercel.com/new → drag the zip in

### 2b. Connect to Vercel

1. Go to https://vercel.com/new
2. Import your GitHub repo (or upload zip)
3. **Don't deploy yet** — first set environment variables (next step)

### 2c. Set environment variables

In Vercel project settings → Environment Variables, add these for **all three** environments (Production, Preview, Development):

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (your Stripe test secret key) |
| `SUCCESS_URL` | `https://www.aventusvisaagents.com/pay-when-approved-thank-you` |
| `CANCEL_URL` | `https://www.aventusvisaagents.com/petitioner-signup-page` |
| `STRIPE_WEBHOOK_SECRET` | (leave blank for now — we set this in Step 3) |
| `N8N_NEW_CUSTOMER_WEBHOOK_URL` | (leave blank for now — we set this in Step 4) |

### 2d. Deploy

Click **Deploy**. After ~1 minute you'll have a URL like `https://pay-when-approved.vercel.app`.

**Don't test `/start` yet** — it will fail because Stripe needs more config first.

---

## Step 3: Configure Stripe

Make sure you're in **Test mode** in the Stripe Dashboard (orange toggle, top right).

### 3a. Set Terms of Service URL

1. Search for the Terms of Service URL setting (the Dashboard layout shifts around — easiest is to use the search bar in Settings)
2. Set it to your terms page: `https://www.aventusvisaagents.com/terms-pay-when-approved`
3. Save

If you don't have a terms page yet, create one on Squarespace first. See `terms-content-template.md` in this repo for boilerplate.

### 3b. Create webhook endpoint

1. **Developers → Webhooks → + Add endpoint**
2. **Endpoint URL:** `https://your-vercel-url.vercel.app/api/webhooks/stripe`
3. **Events to send:** click "Select events" → search and check:
   - `checkout.session.completed`
4. Click **Add endpoint**
5. On the endpoint detail page, click **Reveal** under "Signing secret"
6. Copy the value starting with `whsec_...`
7. Go back to Vercel → Environment Variables → set `STRIPE_WEBHOOK_SECRET` to this value
8. Redeploy in Vercel (Deployments tab → click "..." on the latest → Redeploy)

### 3c. Verify the Stripe redirect works

Visit `https://your-vercel-url.vercel.app/start` in a browser.

You should be redirected to a Stripe-hosted page asking for a card. Don't fill it in yet — just confirm the redirect works.

If you get an error: check Vercel logs for the actual problem.

---

## Step 4: Set up n8n

### 4a. n8n hosting choice

You need a running n8n instance. Three options:

**Option A: n8n Cloud (easiest)**
- Sign up at https://n8n.cloud — free trial, then ~$20/mo
- Skip self-hosting headaches

**Option B: Self-host on Railway/Render**
- Deploy n8n in ~5 minutes via their templates
- ~$5/mo

**Option C: Self-host on your own server**
- Free if you have a VPS already

For starting out, **Option A** is the right call. Switch later if needed.

### 4b. Import Workflow 1

1. In n8n, click **+ Add workflow** → **Import from file**
2. Select `n8n/workflow-1-new-customer.json`
3. The workflow opens with credentials missing — that's expected

### 4c. Set up Google Sheets credential

1. In n8n, click the **Append row to Google Sheet** node
2. Under "Credential," click **+ Create new credential**
3. Choose **Google Sheets OAuth2 API**
4. Click **Sign in with Google** → authorize → select your Google account
5. Save the credential

### 4d. Configure the sheet target

Still in the **Append row to Google Sheet** node:

1. **Document ID** field → paste your Google Sheet ID (from Step 1, item 6)
2. **Sheet name** → select `Cases` from the dropdown
3. Save

### 4e. Activate Workflow 1

1. Click the **toggle in the top right** to activate the workflow
2. Click the **Webhook (from Vercel)** node
3. Copy the **Production URL** (looks like `https://your-n8n.app.n8n.cloud/webhook/new-customer`)
4. Go to Vercel → Environment Variables → set `N8N_NEW_CUSTOMER_WEBHOOK_URL` to this URL
5. Redeploy Vercel

### 4f. Import Workflow 2

1. In n8n, **+ Add workflow** → **Import from file**
2. Select `n8n/workflow-2-approved-charge.json`

### 4g. Set up Stripe credential

1. Click the **Charge saved card** node
2. Under "Credential," click **+ Create new credential**
3. Choose **Stripe API**
4. Paste your `sk_test_...` key (same one you put in Vercel)
5. Save

### 4h. Set up Gmail credential (for emails)

1. Click any of the email nodes (e.g., "Email customer (success)")
2. Under "Credential," click **+ Create new credential**
3. Choose **Gmail OAuth2**
4. Sign in with the Google account you want to send emails from
5. Save

Update the admin email recipient:
- In nodes "Email admin (success)" and "Email admin (failure)"
- Change `admin@aventusvisaagents.com` to your actual admin email

### 4i. Configure the sheet trigger

1. Click the **On row update in Sheet** node
2. Set **Document ID** to your sheet ID
3. Set **Sheet name** to `Cases`
4. Save

### 4j. Activate Workflow 2

Toggle activation in the top right.

---

## Step 5: Update Squarespace

1. Go to your Squarespace editor → `/petitioner-signup-page`
2. Find the "Choose Pay When Approved →" button
3. Edit its link:
   - **OLD:** `https://www.aventusvisaagents.com/petitioner-signup-page#pwa-agreement`
   - **NEW:** `https://your-vercel-url.vercel.app/start`
4. Save and publish

---

## Step 6: End-to-end test in Stripe test mode

### Test 1: Card capture

1. Visit Squarespace `/petitioner-signup-page` in an incognito window
2. Click "Choose Pay When Approved"
3. You should be redirected through your Vercel `/start` → Stripe hosted page
4. Fill in:
   - **Email:** any (e.g., `test@example.com`)
   - **Card number:** `4242 4242 4242 4242`
   - **Expiry:** `12/30`
   - **CVC:** `123`
   - **Cardholder name:** `Test User`
   - **Country/ZIP:** `12345`
   - **Beneficiary name:** `Jane Test`
   - **Case reference:** `TEST-001`
5. Check the terms checkbox
6. Click **Set up**
7. You should be redirected to your Squarespace thank-you page

### Verify each link in the chain

- **Stripe Dashboard → Customers (test mode):** new customer appears with saved card ✅
- **Stripe Dashboard → Developers → Webhooks → your endpoint:** event delivery shows 200 ✅
- **Vercel → Project → Logs:** shows webhook received and forwarded ✅
- **n8n → Executions:** Workflow 1 shows a successful run ✅
- **Google Sheet:** new row appears with `status=pending` ✅

If any step fails, check the logs of that component.

### Test 2: The "approval" charge

1. In your Google Sheet, find the test row
2. Change `status` from `pending` to `approved` (use the dropdown)
3. Wait up to 1 minute

Within a minute, Workflow 2 should fire and:
- Charge $3,000 in Stripe (visible in Dashboard → Payments)
- Update the sheet row: `status=paid`, `charged_at`, `payment_intent_id`
- Send emails to customer and admin

### Test 3: A failed charge

1. Repeat Test 1 but use card `4000 0000 0000 9995` (declines off-session)
2. Mark approved in the sheet
3. Workflow 2 should run and:
   - Stripe charge fails
   - Sheet row updates: `status=payment_failed`
   - Admin gets failure email

---

## Step 7: Going to production

Once tests pass:

### Stripe

1. In Stripe Dashboard, switch to **Live mode** (toggle off the test mode indicator)
2. Repeat **Step 3** in live mode (Terms URL, webhook endpoint — these are separate from test mode)
3. Get a `sk_live_...` API key
4. Get a new `whsec_...` webhook signing secret for the live endpoint

### Vercel

5. Update environment variables:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → new live `whsec_...`
6. Redeploy

### n8n

7. In Workflow 2 → Stripe credential → swap to your live API key

### Final smoke test

8. Make one real test booking with your own real card
9. Verify the row appears in the sheet
10. Issue a refund in Stripe Dashboard so you don't actually charge yourself $0 today
11. Mark the row `approved` to test the charge → then refund in Stripe again

---

## Daily operations

### When a new customer signs up

Nothing — fully automated. They appear in the sheet with `status=pending`.

### When USCIS approves a case

1. Open the Google Sheet
2. Find the row (search by customer name, email, or beneficiary)
3. Change `status` to `approved`
4. Wait ~1 minute → check that `status` flips to `paid` and you see the receipt in Stripe

### When a charge fails

1. You'll get an email from the workflow with the decline reason
2. Contact the customer to update their card
3. To collect a new card: send them a fresh `/start` link from Vercel
4. After they save the new card, find the new row in the sheet
5. Copy the new `stripe_customer_id` and `stripe_payment_method_id` to the ORIGINAL pending row
6. Set the original row's `status` back to `approved` to retry

### When a case is denied

Change the row's `status` to `denied`. No charge happens. The card-on-file is left in Stripe but never used. You may want to detach it from the customer in Stripe Dashboard for cleanliness.

---

## Troubleshooting

### "Stripe webhook signature verification failed"
- `STRIPE_WEBHOOK_SECRET` in Vercel doesn't match the signing secret in Stripe Dashboard
- You're using a test mode secret with a live mode webhook (or vice versa)

### "n8n workflow 1 never fires"
- Check Stripe Dashboard → Webhooks → recent deliveries — are they reaching Vercel?
- Check Vercel logs — is the webhook being forwarded to n8n?
- Check that `N8N_NEW_CUSTOMER_WEBHOOK_URL` in Vercel is correct
- Check that Workflow 1 is **Active** in n8n

### "n8n workflow 2 never fires when I mark approved"
- Sheets trigger checks once per minute by default — wait at least 60 seconds
- Confirm Workflow 2 is **Active**
- Confirm the column name is exactly `status` (case-sensitive)
- Try editing the row again — sometimes the trigger needs a fresh edit

### "Charge fails with 'No such payment_method'"
- The payment_method_id in the sheet doesn't match a real Stripe payment method
- Could mean you mixed up test and live mode — verify the IDs match the Stripe mode you're operating in

### "Permission denied accessing Google Sheet"
- The Google account connected to n8n doesn't have access to the sheet
- Share the sheet with that Google account (Editor access)
