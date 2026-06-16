# Pay When Approved — Vercel app

Thin Next.js app that bridges the Squarespace signup page → Stripe-hosted card capture → n8n integration.

## What this does

1. Customer clicks "Choose Pay When Approved" on Squarespace
2. Lands on `/start` here on Vercel
3. This app creates a Stripe Checkout Session (setup mode, $0 charged) and redirects to Stripe
4. Customer saves their card on Stripe's hosted page
5. Stripe redirects them to the Squarespace thank-you page
6. Stripe fires a webhook to `/api/webhooks/stripe` here
7. We verify the signature and forward the customer details to n8n
8. n8n adds a row to Google Sheets with `status=pending`

## File structure

```
app/
├── layout.tsx                       Root layout
├── page.tsx                         Homepage (informational only)
├── start/
│   └── route.ts                     ★ Entry point — creates Checkout & redirects
└── api/
    └── webhooks/
        └── stripe/
            └── route.ts             ★ Receives Stripe webhooks → forwards to n8n
lib/
└── stripe.ts                        Stripe SDK client
```

## Setup steps

### 1. Local development

```bash
npm install
cp .env.example .env.local
# Fill in STRIPE_SECRET_KEY at minimum
npm run dev
# Visit http://localhost:3000/start to test the redirect flow
```

### 2. Deploy to Vercel

```bash
# Push to GitHub, then in Vercel dashboard:
# - Import the repo
# - Set environment variables (see .env.example)
# - Deploy
```

### 3. Configure Stripe

Once deployed:

a. Set your Terms of Service URL in Stripe Dashboard → Settings → Public Details
   (required because we use `consent_collection.terms_of_service`)

b. Add a webhook endpoint:
   - Stripe Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://your-app.vercel.app/api/webhooks/stripe`
   - Events to send: `checkout.session.completed`
   - After creation, reveal the signing secret and add it as `STRIPE_WEBHOOK_SECRET` in Vercel

### 4. Configure n8n

Import the two n8n workflows (separate JSON files) and configure them as
described in the n8n setup guide.

After creating Workflow 1, copy its webhook URL into Vercel as
`N8N_NEW_CUSTOMER_WEBHOOK_URL`.

### 5. Squarespace

Update the "Choose Pay When Approved →" button to link to:
```
https://your-app.vercel.app/start
```

## Environment variables

See `.env.example` for the full list with descriptions.

| Variable | Required | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | `sk_test_...` for testing, `sk_live_...` for production |
| `STRIPE_WEBHOOK_SECRET` | yes | Set after creating webhook in Stripe Dashboard |
| `SUCCESS_URL` | no | Defaults to aventusvisaagents.com thank-you page |
| `CANCEL_URL` | no | Defaults to aventusvisaagents.com signup page |
| `N8N_NEW_CUSTOMER_WEBHOOK_URL` | yes | From n8n Workflow 1's Webhook node |

## Testing the flow end-to-end

1. Visit `https://your-app.vercel.app/start`
2. You should be redirected to a Stripe-hosted page
3. Fill in: card `4242 4242 4242 4242`, exp `12/30`, CVC `123`, ZIP `12345`
4. Fill in custom fields (beneficiary name, case reference)
5. Check the terms checkbox
6. Click Set up
7. You should be redirected to the Squarespace thank-you page
8. Within seconds, a new row should appear in your Google Sheet
9. Check Stripe Dashboard → Customers — a new customer should exist with a saved card

## Going to production

1. Swap `STRIPE_SECRET_KEY` from `sk_test_...` to `sk_live_...`
2. Create a new webhook endpoint in Stripe's live mode (separate from test mode)
3. Update `STRIPE_WEBHOOK_SECRET` with the live webhook's signing secret
4. Set Terms of Service URL in live mode too (separate from test mode)
5. Test once with a real card you control to verify end-to-end
