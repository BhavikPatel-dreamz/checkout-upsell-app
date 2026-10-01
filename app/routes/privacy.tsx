import type { CSSProperties } from "react";
import type { MetaFunction } from "react-router";

const OPERATOR = "Dynamic Dreamz";
const APP_NAME = "Checkout Upsell App";
const APP_URL = "https://dynamicdreamz.com";
const CONTACT_EMAIL = "support@dynamicdreamz.com";
const EFFECTIVE_DATE = "1 October 2026";

export const meta: MetaFunction = () => [
  { title: `Privacy policy · ${APP_NAME}` },
  {
    name: "description",
    content: `How ${OPERATOR} handles merchant and shopper data in ${APP_NAME}.`,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main style={styles.page}>
      <article style={styles.article}>
        <p style={styles.kicker}>{APP_NAME}</p>
        <h1 style={styles.h1}>Privacy policy</h1>
        <p style={styles.meta}>Effective date: {EFFECTIVE_DATE}</p>
        <p>
          This notice describes how {OPERATOR} (“we”, “us”) processes information when a
          merchant installs {APP_NAME} from the Shopify App Store or uses {APP_URL}. It is
          written for Shopify’s app listing. It is not legal advice. Have counsel review it
          before you rely on it.
        </p>

        <h2 style={styles.h2}>Who this covers</h2>
        <ul>
          <li>
            <strong>Merchants</strong> who install the app on a Shopify store (including staff
            who open the embedded admin).
          </li>
          <li>
            <strong>Shoppers</strong> on that store who see or interact with an upsell in cart,
            checkout, or thank-you, or whose browse activity is used for ranking.
          </li>
        </ul>

        <h2 style={styles.h2}>Who we are</h2>
        <p>
          {APP_NAME} is operated by {OPERATOR}. Contact:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Hosting: the app runs on
          our servers at {APP_URL} (currently Vercel) and uses a database we control.
        </p>
        <p>
          Shopify is a separate controller for the merchant’s store, checkout, and Admin.
          We receive data through Shopify APIs, session tokens, webhooks, app proxy, and
          checkout / theme / pixel extensions.
        </p>

        <h2 style={styles.h2}>Data we process</h2>
        <h3 style={styles.h3}>Merchant and store</h3>
        <ul>
          <li>Shopify shop domain and offline/online session tokens needed to run the app.</li>
          <li>Offer configuration (names, placements, trigger products, recommended products, schedule, copy).</li>
          <li>Synced catalog fields we store to pick products (product and variant ids, titles, images, amounts).</li>
          <li>Subscription plan stored for the shop (for example Free or Silver) and related billing records from Shopify.</li>
          <li>Admin analytics aggregates derived from events below.</li>
        </ul>
        <h3 style={styles.h3}>Shoppers</h3>
        <ul>
          <li>
            Funnel events for an upsell: viewed, clicked, added to cart, purchased, with shop,
            offer id, product and variant ids, placement, time, and optional order id and
            revenue for purchases.
          </li>
          <li>
            Shopify customer id when the shopper is logged in; otherwise a guest key we generate
            in checkout storage or a similar anonymous key from the storefront. We use these to
            connect events, not as a login for shoppers.
          </li>
          <li>
            Browse activity from our web pixel (product views and similar events) with shop,
            product ids, customer id or guest key, and time, used to rank which product to show
            when that feature is enabled.
          </li>
        </ul>
        <p>
          We do not ask shoppers for payment card numbers. Checkout payments stay on Shopify.
          Our GDPR handlers do not store customer email or phone from compliance webhooks; they
          use Shopify customer and order ids.
        </p>

        <h2 style={styles.h2}>Why we process it</h2>
        <ul>
          <li>Install, authenticate, and operate the embedded admin.</li>
          <li>Show merchant-configured related products in cart, checkout, and thank-you.</li>
          <li>Apply plan limits and Shopify App Pricing.</li>
          <li>Measure upsell performance for the merchant.</li>
          <li>Respond to Shopify mandatory GDPR webhooks and uninstall.</li>
          <li>Secure the service and debug faults.</li>
        </ul>
        <p>
          Legal bases (where GDPR/UK GDPR apply) are typically performance of the merchant
          contract, legitimate interests in running a store app, and legal obligation for
          Shopify compliance webhooks.
        </p>

        <h2 style={styles.h2}>How we share it</h2>
        <ul>
          <li>
            <strong>Shopify</strong> — APIs, webhooks, Billing, Checkout UI, theme app
            extensions, and pixels as required to provide the app.
          </li>
          <li>
            <strong>Infrastructure</strong> — hosting and database providers that process data
            on our instructions (including Vercel and our database host).
          </li>
        </ul>
        <p>
          We do not sell shopper lists. We do not use shopper events to advertise our app to
          those shoppers on other sites.
        </p>

        <h2 style={styles.h2}>Cookies and similar storage</h2>
        <p>
          The embedded admin uses Shopify session tokens (not third-party cookies for auth).
          Checkout UI may store a guest key in extension storage. The storefront pixel and theme
          scripts may use cookies or local storage that Shopify and the merchant’s theme allow,
          to remember a guest key or send activity. Shoppers should review the merchant’s own
          store policy as well.
        </p>

        <h2 style={styles.h2}>Retention</h2>
        <p>
          We keep store and offer data while the app is installed and the merchant’s plan
          allows storage. After Shopify sends <code>shop/redact</code>, we stop keeping that
          shop’s data as implemented in our compliance webhooks. After{" "}
          <code>customers/redact</code>, we remove or detach shopper identifiers we hold for
          that customer as implemented in those webhooks. Uninstall webhooks stop the app for
          that shop. Backups may lag for a short period.
        </p>

        <h2 style={styles.h2}>Shopify mandatory webhooks</h2>
        <p>
          We subscribe to <code>customers/data_request</code>, <code>customers/redact</code>,
          and <code>shop/redact</code>. Merchants can also open Settings in the app for a
          summary of recent compliance events. To request a copy or deletion outside Shopify’s
          flow, email {CONTACT_EMAIL} with the shop domain.
        </p>

        <h2 style={styles.h2}>International transfers</h2>
        <p>
          Servers may be outside the merchant’s country (including the United States). Shopify
          also processes data under its own terms.
        </p>

        <h2 style={styles.h2}>Children</h2>
        <p>
          The app is for merchants. It is not directed at children. We do not knowingly collect
          data from children.
        </p>

        <h2 style={styles.h2}>Your rights</h2>
        <p>
          Merchants and, where law allows, shoppers may request access, correction, deletion, or
          restriction. Shoppers should usually contact the merchant first. We will cooperate
          with Shopify GDPR webhooks. EU/UK representatives are not appointed in this notice; add
          them here if your counsel requires it.
        </p>

        <h2 style={styles.h2}>Changes</h2>
        <p>
          We may update this page. The effective date at the top will change. Continued use after
          a change means the new notice applies to later processing.
        </p>

        <h2 style={styles.h2}>Contact</h2>
        <p>
          {OPERATOR}
          <br />
          {APP_NAME}
          <br />
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <br />
          <a href={APP_URL}>{APP_URL}</a>
        </p>
      </article>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    margin: 0,
    background: "#F6F6F7",
    color: "#1A1A1A",
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    lineHeight: 1.6,
  },
  article: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "2.5rem 1.25rem 4rem",
    background: "#fff",
    borderLeft: "1px solid #E3E5E7",
    borderRight: "1px solid #E3E5E7",
  },
  kicker: {
    fontSize: 13,
    fontWeight: 600,
    color: "#6B7177",
    margin: 0,
  },
  h1: {
    fontSize: "1.75rem",
    margin: "0.35rem 0 0.5rem",
  },
  meta: {
    color: "#6B7177",
    fontSize: 14,
    marginBottom: "1.5rem",
  },
  h2: {
    fontSize: "1.15rem",
    margin: "1.75rem 0 0.5rem",
  },
  h3: {
    fontSize: "1rem",
    margin: "1rem 0 0.35rem",
  },
};
