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
 */
export async function GET(request: Request) {
  try {
    const successUrl =
      process.env.SUCCESS_URL ??
      "https://www.aventusvisaagents.com/pay-when-approved-thank-you";
    const cancelUrl =
      process.env.CANCEL_URL ??
      "https://www.aventusvisaagents.com/petitioner-signup-page";

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["card"],
      customer_creation: "always",

      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,

      // Show terms checkbox (requires ToS URL configured in Stripe Dashboard)
      consent_collection: {
        terms_of_service: "required",
      },

      // Custom fields the customer fills in alongside their card
      custom_fields: [
        {
          key: "beneficiary_name",
          label: {
            type: "custom",
            custom: "Beneficiary (visa applicant) full name",
          },
          type: "text",
          optional: false,
        },
        {
          key: "case_reference",
          label: {
            type: "custom",
            custom: "Internal case reference (leave blank if unsure)",
          },
          type: "text",
          optional: true,
        },
      ],

      // Metadata for tracking — visible in Stripe Dashboard and webhooks
      metadata: {
        plan: "pay_when_approved",
        amount_due_on_approval: String(PLAN_AMOUNT_CENTS),
        currency: PLAN_CURRENCY,
        plan_label: PLAN_LABEL,
        source: "squarespace",
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