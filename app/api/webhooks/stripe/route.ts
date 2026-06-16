import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/webhooks/stripe
 *
 * Receives webhooks from Stripe. We verify the signature, then forward the
 * relevant event to n8n. This indirection lets us keep webhook handling
 * server-side (signature verification) while letting n8n do the
 * Sheets-writing work.
 *
 * Events we forward to n8n:
 *   - checkout.session.completed  (setup mode → new customer + saved card)
 *
 * Events we may want to handle later:
 *   - payment_intent.succeeded
 *   - payment_intent.payment_failed
 *   - setup_intent.setup_failed
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const n8nWebhookUrl = process.env.N8N_NEW_CUSTOMER_WEBHOOK_URL;

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Raw body is required for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // Only forward setup-mode session completions
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.mode !== "setup") {
      // Not our event — acknowledge but don't forward
      return NextResponse.json({ received: true, ignored: "non-setup-mode" });
    }

    if (!n8nWebhookUrl) {
      console.warn("N8N_NEW_CUSTOMER_WEBHOOK_URL not set — event not forwarded");
      return NextResponse.json({ received: true, forwarded: false });
    }

    // Expand the session to include customer + setup_intent details
    let fullSession;
    try {
      fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["customer", "setup_intent", "setup_intent.payment_method"],
      });
    } catch (err) {
      console.error("Failed to expand session", session.id, err);
      return NextResponse.json({ received: true, forwarded: false });
    }

    // Build a clean payload for n8n
    const setupIntent = typeof fullSession.setup_intent === "object" ? fullSession.setup_intent : null;
    const paymentMethod =
      setupIntent && typeof setupIntent.payment_method === "object"
        ? setupIntent.payment_method
        : null;
    const customer =
      typeof fullSession.customer === "object" && fullSession.customer && !("deleted" in fullSession.customer)
        ? fullSession.customer
        : null;

    const customFields = (fullSession.custom_fields || []).reduce<Record<string, string>>(
      (acc, field) => {
        acc[field.key] = field.text?.value ?? "";
        return acc;
      },
      {}
    );

    const payload = {
      event_type: event.type,
      event_id: event.id,
      session_id: fullSession.id,
      created_at: new Date(event.created * 1000).toISOString(),

      customer_id: customer?.id ?? "",
      customer_email: fullSession.customer_details?.email ?? customer?.email ?? "",
      customer_name: fullSession.customer_details?.name ?? customer?.name ?? "",
      customer_phone: fullSession.customer_details?.phone ?? "",

      payment_method_id: paymentMethod?.id ?? "",
      card_brand: paymentMethod?.card?.brand ?? "",
      card_last4: paymentMethod?.card?.last4 ?? "",
      card_exp_month: paymentMethod?.card?.exp_month ?? "",
      card_exp_year: paymentMethod?.card?.exp_year ?? "",

      beneficiary_name: customFields.beneficiary_name ?? "",
      case_reference: customFields.case_reference ?? "",

      amount_due_on_approval_cents: fullSession.metadata?.amount_due_on_approval ?? "300000",
      plan: fullSession.metadata?.plan ?? "pay_when_approved",

      terms_accepted: fullSession.consent?.terms_of_service === "accepted",
    };

    // Forward to n8n
    try {
      const res = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("n8n returned non-OK:", res.status, text);
        // Still return 200 to Stripe so it doesn't retry endlessly;
        // n8n issues can be investigated separately.
      }
    } catch (err) {
      console.error("Failed to forward to n8n:", err);
    }

    return NextResponse.json({ received: true, forwarded: true });
  }

  // Other events — acknowledge but don't act
  return NextResponse.json({ received: true });
}
