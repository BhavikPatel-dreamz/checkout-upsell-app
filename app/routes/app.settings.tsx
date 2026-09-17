import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { formatProductIdList } from "../config/merchantRules";
import { RETENTION_DAY_OPTIONS } from "../config/privacy";
import { authenticate } from "../shopify.server";
import {
  getMerchantRuleSet,
  merchantRuleSetFromForm,
  upsertMerchantRuleSet,
} from "../models/merchantRuleSet.server";
import {
  getShopPrivacySettings,
  upsertShopPrivacySettings,
} from "../models/shopPrivacy.server";
import {
  configuredLlmProviders,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
} from "../ai/llm/providers";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const [privacy, merchant] = await Promise.all([
    getShopPrivacySettings(session.shop),
    getMerchantRuleSet(session.shop),
  ]);
  return { privacy, merchant, llmConfigured: configuredLlmProviders() };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "privacy");

  if (intent === "rules") {
    const merchant = await upsertMerchantRuleSet(session.shop, merchantRuleSetFromForm(form));
    return { ok: true as const, intent: "rules" as const, merchant };
  }

  const privacy = await upsertShopPrivacySettings(session.shop, {
    trackingEnabled: form.get("trackingEnabled") === "true",
    privacyRetentionDays: Number(form.get("privacyRetentionDays")),
  });
  return { ok: true as const, intent: "privacy" as const, privacy };
}

export default function SettingsPage() {
  const loaded = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const privacy =
    actionData && "privacy" in actionData && actionData.privacy ? actionData.privacy : loaded.privacy;
  const merchant =
    actionData && "merchant" in actionData && actionData.merchant
      ? actionData.merchant
      : loaded.merchant;
  const llmConfigured = loaded.llmConfigured;

  return (
    <s-page heading="Settings">
      <s-section heading="Privacy and retention">
        <s-paragraph>
          Behavioral events (browse and shopper stream) are kept only for the
          selected period, then deleted by the retention job. Storefront
          tracking still requires the shopper’s Shopify analytics consent.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="privacy" />
          <s-stack direction="block" gap="base">
            <label>
              <input
                type="checkbox"
                name="trackingEnabled"
                value="true"
                defaultChecked={privacy.trackingEnabled}
              />{" "}
              Enable storefront activity tracking
            </label>
            <label>
              Keep events for{" "}
              <select
                name="privacyRetentionDays"
                defaultValue={String(privacy.privacyRetentionDays)}
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
            {actionData?.ok && actionData.intent === "privacy" ? (
              <s-paragraph>Saved.</s-paragraph>
            ) : null}
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Recommendation rules">
        <s-paragraph>
          Never-recommend and always-include wrap the hybrid scorer. Min
          margin applies only when a product has cost/margin data. Price band
          uses catalog prices from product sync. Standard shops always review
          these lists; nothing auto-publishes.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="rules" />
          <s-stack direction="block" gap="base">
            <label>
              Never recommend (one product ID or GID per line)
              <textarea
                name="neverProductIds"
                rows={4}
                defaultValue={formatProductIdList(merchant.neverProductIds)}
                style={{ width: "100%" }}
              />
            </label>
            <label>
              Always include when eligible (pinned first, still respects never
              and stock)
              <textarea
                name="alwaysProductIds"
                rows={4}
                defaultValue={formatProductIdList(merchant.alwaysProductIds)}
                style={{ width: "100%" }}
              />
            </label>
            <label>
              Max products shown{" "}
              <input
                type="number"
                name="maxN"
                min={1}
                max={20}
                defaultValue={merchant.maxN}
              />
            </label>
            <label>
              Min margin % (ignored when cost is unknown){" "}
              <input
                type="number"
                name="minMarginPercent"
                step="0.1"
                defaultValue={merchant.minMarginPercent ?? ""}
              />
            </label>
            <label>
              Max discount % (AI offer policies never exceed this)
              <input
                type="number"
                name="maxDiscountPercent"
                min={0}
                max={50}
                step="1"
                defaultValue={merchant.maxDiscountPercent}
              />
            </label>
            <label>
              Always-on holdout % (decide never runs without a holdout; default 10, min 5)
              <input
                type="number"
                name="holdoutPercent"
                min={5}
                max={50}
                step="1"
                defaultValue={merchant.holdoutPercent}
              />
            </label>
            <s-paragraph>
              Experience variants for treated shoppers use a bandit (Thompson
              sampling). Holdout is assigned first and is never an arm — the
              bandit cannot turn holdout off.
            </s-paragraph>
            <label>
              Optimization goal
              <select name="optimizationGoal" defaultValue={merchant.optimizationGoal}>
                <option value="revenue">Incremental revenue</option>
                <option value="aov">Average order value</option>
                <option value="conversion">Conversion</option>
                <option
                  value="profit"
                  disabled={merchant.minMarginPercent == null}
                >
                  Profit (requires min margin %)
                </option>
              </select>
            </label>
            <s-paragraph>
              Profit is available only when min margin % is set so ranking can
              use margin data. Incrementality still reports all metrics; this
              goal highlights the primary one.
            </s-paragraph>
            <label>
              Copilot model provider
              <select name="copilotProvider" defaultValue={merchant.copilotProvider}>
                <option value="auto">{LLM_PROVIDER_LABELS.auto}</option>
                <option value="none">{LLM_PROVIDER_LABELS.none}</option>
                {LLM_PROVIDERS.map((id) => (
                  <option key={id} value={id} disabled={!llmConfigured[id]}>
                    {LLM_PROVIDER_LABELS[id]}
                    {llmConfigured[id] ? "" : " (no API key)"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model id (optional; blank uses the provider default)
              <input
                type="text"
                name="copilotModel"
                defaultValue={merchant.copilotModel}
                placeholder="gpt-4o-mini, grok-2-latest, gemini-2.0-flash"
              />
            </label>
            <s-paragraph>
              Keys stay in the app environment, not in this form: OPENAI_API_KEY,
              XAI_API_KEY or GROK_API_KEY, GEMINI_API_KEY. Copilot and the
              optional recommend picker use these providers. Raw shopper events
              are still never sent to Copilot.
            </s-paragraph>
            <label>
              Price min{" "}
              <input
                type="number"
                name="priceMin"
                step="0.01"
                defaultValue={merchant.priceMin ?? ""}
              />
            </label>
            <label>
              Price max{" "}
              <input
                type="number"
                name="priceMax"
                step="0.01"
                defaultValue={merchant.priceMax ?? ""}
              />
            </label>
            <s-button type="submit" variant="primary">
              Save rules
            </s-button>
            {actionData?.ok && actionData.intent === "rules" ? (
              <s-paragraph>Saved.</s-paragraph>
            ) : null}
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}
