import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Add it to your Vercel environment variables."
  );
}

export const stripe = new Stripe(secretKey, {
  apiVersion: "2026-05-27.dahlia",
  typescript: true,
});

export const PLAN_AMOUNT_CENTS = 300000; // $3,000
export const PLAN_CURRENCY = "usd";
export const PLAN_LABEL = "Pay When Approved";
