import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { dismissSmartMoment, listSmartMoments } from "../models/smartMoment.server";
import { momentOfferEditPath, momentOfferFormPath } from "../ai/moments/fromMoment";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const moments = await listSmartMoments(session.shop);
  return { moments };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "detect") {
    const { rebuildSmartMoments } = await import("../jobs/smartMoments.server");
    const result = await rebuildSmartMoments(session.shop);
    return { ok: true as const, intent: "detect" as const, result };
  }

  const id = String(form.get("id") ?? "");
  if (!id) return { ok: false as const, error: "Missing moment." };

  if (intent === "dismiss") {
    const dismissed = await dismissSmartMoment(session.shop, id);
    return { ok: dismissed, intent: "dismiss" as const };
  }

  return { ok: false as const, error: "Unknown action." };
}

function kindLabel(kind: string): string {
  if (kind === "complementary_lift") return "Complementary lift";
  if (kind === "similar_affinity") return "Similar affinity";
  return "Frequently bought together";
}

export default function SmartMomentsPage() {
  const { moments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Smart Moments">
      <s-section heading="Detected from affinity and lift">
        <s-paragraph>
          These moments come from product–product co-occurrence (support and
          lift), not an LLM. Activate opens the unified offer form as a
          <strong>draft</strong> campaign. Save there to create the campaign.
          Standard never publishes this live. Enterprise shops can enable
          Autopilot publish in Settings.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="detect" />
          <s-button type="submit" variant="primary">
            Detect moments
          </s-button>
        </Form>
        {actionData && "intent" in actionData && actionData.intent === "detect" && actionData.ok ? (
          <s-paragraph>Updated {actionData.result.upserted} moment(s).</s-paragraph>
        ) : null}
        {actionData && "error" in actionData && actionData.error ? (
          <s-paragraph>{actionData.error}</s-paragraph>
        ) : null}
      </s-section>

      <s-section>
        {moments.length === 0 ? (
          <s-paragraph>
            No moments yet. Run product affinity jobs, then Detect moments.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {moments.map((row) => (
              <s-section
                key={row.id}
                heading={`${kindLabel(row.kind)} · lift ${row.lift.toFixed(2)} · impact ${row.expectedImpact.toFixed(1)}`}
              >
                <s-paragraph>
                  Trigger {row.productId} → recommend {row.relatedProductId}. Support{" "}
                  {row.support}. Status: {row.status}.
                </s-paragraph>
                <s-paragraph>{row.explanation}</s-paragraph>
                {row.status === "detected" ? (
                  <s-stack direction="inline" gap="base">
                    <s-link href={momentOfferFormPath(row.id)}>Activate in offer form</s-link>
                    <Form method="post">
                      <input type="hidden" name="intent" value="dismiss" />
                      <input type="hidden" name="id" value={row.id} />
                      <s-button type="submit">Dismiss</s-button>
                    </Form>
                  </s-stack>
                ) : null}
                {row.status === "activated" && row.offerId ? (
                  <s-link href={momentOfferEditPath(row.offerId)}>Open draft offer</s-link>
                ) : null}
              </s-section>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
