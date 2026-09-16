import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { RETENTION_DAY_OPTIONS } from "../config/privacy";
import { authenticate } from "../shopify.server";
import {
  getShopPrivacySettings,
  upsertShopPrivacySettings,
} from "../models/shopPrivacy.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  return getShopPrivacySettings(session.shop);
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const settings = await upsertShopPrivacySettings(session.shop, {
    trackingEnabled: form.get("trackingEnabled") === "true",
    privacyRetentionDays: Number(form.get("privacyRetentionDays")),
  });
  return { ok: true as const, settings };
}

export default function SettingsPage() {
  const loaded = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const settings = actionData?.settings ?? loaded;

  return (
    <s-page heading="Settings">
      <s-section heading="Privacy and retention">
        <s-paragraph>
          Behavioral events (browse and shopper stream) are kept only for the
          selected period, then deleted by the retention job. Storefront
          tracking still requires the shopper’s Shopify analytics consent.
        </s-paragraph>
        <Form method="post">
          <s-stack direction="block" gap="base">
            <label>
              <input
                type="checkbox"
                name="trackingEnabled"
                value="true"
                defaultChecked={settings.trackingEnabled}
              />{" "}
              Enable storefront activity tracking
            </label>
            <label>
              Keep events for{" "}
              <select
                name="privacyRetentionDays"
                defaultValue={String(settings.privacyRetentionDays)}
              >
                {RETENTION_DAY_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </label>
            <s-button type="submit" variant="primary">
              Save
            </s-button>
            {actionData?.ok ? <s-paragraph>Saved.</s-paragraph> : null}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
