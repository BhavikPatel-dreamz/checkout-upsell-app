import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import {
  PLAN_FEATURE_LABELS,
  PLAN_FEATURE_ORDER,
  discountedAmount,
  listedPlans,
  planById,
  planSelectionUrl,
  subscriptionManageUrl,
} from "../config/billingPlan";
import { ensureCurrentPlanHistory, listSubscriptionHistory, setStorePlan, syncBillingFromShopify } from "../models/billing.server";
import "../styles/billing.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const offer = await syncBillingFromShopify(session.shop, admin);
  await ensureCurrentPlanHistory(session.shop);
  const history = await listSubscriptionHistory(session.shop);
  const appHandle = process.env.SHOPIFY_APP_HANDLE?.trim() || "";
  const current = planById(offer.plan);

  return {
    currentPlan: current.id,
    currentName: current.name,
    discountPercent: offer.discountPercent,
    legacySubscriber: offer.legacySubscriber,
    planUrl: appHandle ? planSelectionUrl(session.shop, appHandle) : null,
    cancelUrl: subscriptionManageUrl(session.shop),
    plans: listedPlans().map((plan) => {
      return {
        id: plan.id,
        name: plan.name,
        summary: plan.summary,
        amount: discountedAmount(plan.amount, plan.id === "free" ? 0 : offer.discountPercent),
        listAmount: plan.amount,
        trialDays: offer.legacySubscriber || plan.id === "free" ? 0 : plan.trialDays,
        offerLimit: plan.offerLimit,
        features: plan.features,
      };
    }),
    history: history.map((row) => ({
      id: row.id,
      name: row.name,
      chargeId: row.chargeId,
      price: row.price,
      approved: row.approved,
      active: row.active,
      chargedAt: row.chargedAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const plan = form.get("plan");
  if (plan !== "free") {
    return { error: "Approve Silver on Shopify’s plan page. This app does not start the charge itself." };
  }
  await setStorePlan(session.shop, "free");
  return { ok: true };
};

function money(amount: number) {
  return amount === 0 ? "$0" : `$${amount.toFixed(2)}`;
}

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const current = data.plans.find((plan) => plan.id === data.currentPlan) ?? data.plans[0];

  return (
    <div className="billingPage">
      <header className="billingHeader">
        <div>
          <h1>Subscription</h1>
          <p>Pick a plan for this store. You can change it or cancel anytime.</p>
        </div>
      </header>

      <section className="billingBanner">
        <div>
          <strong>{current.name} plan</strong>
          <span>
            {current.amount === 0
              ? "No monthly charge."
              : `${money(current.amount)} USD per month.`}
            {data.legacySubscriber ? " This store was already subscribed on the previous app." : ""}
            {data.discountPercent > 0 ? ` ${data.discountPercent}% off paid plans.` : ""}
          </span>
        </div>
        {current.id === "free" || !data.planUrl ? null : (
          <a className="billingCancel" href={data.planUrl} target="_top" rel="noreferrer">
            Switch to Free
          </a>
        )}
      </section>

      <section className="billingGrid">
        {data.plans.map((plan) => {
          const selected = plan.id === data.currentPlan;
          return (
            <article
              key={plan.id}
              className={`planCard${selected ? " planCardCurrent" : ""}${
                plan.id === "silver" ? " planCardPopular" : ""
              }`}
            >
              {selected ? (
                <span className="planBadge">
                  {plan.id === "silver" ? "Current · Most popular" : "Current plan"}
                </span>
              ) : plan.id === "silver" ? (
                <span className="planBadge">Most popular</span>
              ) : null}
              <h2 className="planName">{plan.name}</h2>
              <p className="planPrice">
                {money(plan.amount)}
                <small>{plan.amount === 0 ? "" : "/ month"}</small>
              </p>
              {plan.listAmount > plan.amount ? (
                <p className="planWas">{money(plan.listAmount)} / month</p>
              ) : null}
              {plan.trialDays > 0 ? (
                <p className="planTrial">{plan.trialDays}-day free trial, cancel anytime</p>
              ) : (
                <p className="planTrial">{plan.amount === 0 ? "No trial needed" : "Cancel anytime"}</p>
              )}
              <p className="planSummary">{plan.summary}</p>
              <ul className="planFeatures">
                <li>
                  <span className="planMark">✓</span>
                  {plan.offerLimit == null
                    ? "Unlimited offers"
                    : `Up to ${plan.offerLimit} ${plan.offerLimit === 1 ? "offer" : "offers"}`}
                </li>
                {PLAN_FEATURE_ORDER.map((feature) => {
                  const included = plan.features.includes(feature);
                  return (
                    <li key={feature} className={included ? "" : "missing"}>
                      <span className="planMark">{included ? "✓" : "–"}</span>
                      {PLAN_FEATURE_LABELS[feature]}
                    </li>
                  );
                })}
              </ul>
              {selected ? (
                <button className="planButton planButtonCurrent" type="button" disabled>
                  Current plan
                </button>
              ) : data.planUrl ? (
                <a className={`planButton${plan.id === "free" ? " planButtonSecondary" : ""}`} href={data.planUrl} target="_top" rel="noreferrer">
                  {plan.id === "free" ? "Switch to Free" : `Choose ${plan.name}`}
                </a>
              ) : (
                <button className="planButton" type="button" disabled>
                  Choose {plan.name}
                </button>
              )}
            </article>
          );
        })}
      </section>

      <p className="billingNote">
        Free and Silver are both chosen on Shopify’s plan page, so a paid charge does not stay active after you switch to Free.{" "}
        {data.planUrl ? (
          <>
            {" "}
            <a href={data.planUrl} target="_top" rel="noreferrer">
              Open the Shopify plan page
            </a>
            .
          </>
        ) : null}
      </p>

      <section className="billingHistory">
        <h2>Previous charges</h2>
        {data.history.length === 0 ? (
          <p>No earlier subscription charges are stored for this store.</p>
        ) : (
          <table className="billingTable">
            <thead>
              <tr>
                <th>Charge</th>
                <th>Price</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.name || "Charge"}
                    {row.chargeId ? <div>Charge {row.chargeId}</div> : null}
                  </td>
                  <td>${row.price || "0"}</td>
                  <td>
                    <span className={`statusPill${row.approved && row.active ? " statusPillOn" : ""}`}>
                      {row.approved ? (row.active ? "Approved" : "Approved, inactive") : "Not approved"}
                    </span>
                  </td>
                  <td>{new Date(row.chargedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
