import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopDataPolicy, listGdprEvents } from "../models/gdpr.server";

const TOPIC_LABELS: Record<string, string> = {
  "customers/data_request": "Customer data request",
  "customers/redact": "Customer redact",
  "shop/redact": "Shop redact",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const policy = await ensureShopDataPolicy(session.shop);
  const events = await listGdprEvents(session.shop);

  return {
    shop: session.shop,
    dataStorageAllowed: policy.dataStorageAllowed,
    redactedAt: policy.redactedAt?.toISOString() ?? null,
    events: events.map((event) => ({
      id: event.id,
      topic: event.topic,
      status: event.status,
      customerId: event.customerId,
      receivedAt: event.receivedAt.toISOString(),
    })),
  };
};

export default function SettingsPage() {
  const { shop, dataStorageAllowed, redactedAt, events } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings">
      <s-section heading="Store data storage">
        <s-paragraph>
          {shop} is {dataStorageAllowed ? "allowed" : "not allowed"} to keep store data in this app.
        </s-paragraph>
        {redactedAt ? (
          <s-paragraph>
            Shop data was redacted on {new Date(redactedAt).toLocaleString()}.
          </s-paragraph>
        ) : null}
      </s-section>

      <s-section heading="GDPR requests">
        {events.length === 0 ? (
          <s-paragraph>No GDPR requests have been recorded for this store.</s-paragraph>
        ) : (
          <s-unordered-list>
            {events.map((event) => (
              <s-list-item key={event.id}>
                {TOPIC_LABELS[event.topic] ?? event.topic}
                {" · "}
                {event.status}
                {event.customerId ? ` · customer ${event.customerId}` : ""}
                {" · "}
                {new Date(event.receivedAt).toLocaleString()}
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>
    </s-page>
  );
}
