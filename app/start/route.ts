import { NextResponse } from "next/server";
import { stripe, PLAN_AMOUNT_CENTS, PLAN_CURRENCY, PLAN_LABEL } from "@/lib/stripe";

/**
 * GET /start
 *
 * Entry point from the Squarespace "Choose Pay When Approved" button.
 * Creates a Stripe Checkout Session in setup mode (saves card, charges $0)
 * and redirects the user to the Stripe-hosted card page.
 *
 * Stripe will redirect them back to SUCCESS_URL (Squarespace thank-you page)
 * after they save their card.
 *
 * NOTE: Stripe's `setup` mode is intentionally minimal. It does NOT support:
 *   - consent_collection (terms checkbox)
 *   - custom_fields (extra form fields)
 *   - submit_type
 * These all require `mode=payment` or `mode=subscription`. Any additional
 * customer info (beneficiary name, case reference, terms agreement) must be
 * collected on a Squarespace agreement page BEFORE the customer reaches this
 * endpoint. The data can be passed via URL query params and stored in the
 * session metadata.
 */
export async function GET(request: Request) {
  try {
    const successUrl =
      process.env.SUCCESS_URL ??
      "https://www.aventusvisaagents.com/pay-when-approved-thank-you";
    const cancelUrl =
      process.env.CANCEL_URL ??
      "https://www.aventusvisaagents.com/petitioner-signup-page";

    // Read optional pre-filled info from query params
    // Example: /start?email=x@y.com&beneficiary=Jane&case_ref=ABC123
    const url = new URL(request.url);
    const customerEmail = url.searchParams.get("email") ?? undefined;
    const beneficiaryName = url.searchParams.get("beneficiary") ?? "";
    const caseReference = url.searchParams.get("case_ref") ?? "";

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["card"],
      customer_creation: "always",

      // Pre-fill the email field on the Stripe page if provided
      ...(customerEmail ? { customer_email: customerEmail } : {}),

      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,

      // Metadata for tracking — visible in Stripe Dashboard and webhooks
      // This data flows through to n8n and the Google Sheet
      metadata: {
        plan: "pay_when_approved",
        amount_due_on_approval: String(PLAN_AMOUNT_CENTS),
        currency: PLAN_CURRENCY,
        plan_label: PLAN_LABEL,
        source: "squarespace",
        beneficiary_name: beneficiaryName,
        case_reference: caseReference,
      },
    });

    if (!session.url) {
      console.error("Stripe returned a session with no URL", session.id);
      return NextResponse.json(
        { error: "Could not create checkout session" },
        { status: 500 }
      );
    }

    // Redirect the browser to the Stripe-hosted page
    return NextResponse.redirect(session.url, 303);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to create Checkout Session:", message);

    return NextResponse.json(
      {
        error: "Could not start the Pay When Approved flow.",
        details: message,
      },
      { status: 500 }
    );
  }
}