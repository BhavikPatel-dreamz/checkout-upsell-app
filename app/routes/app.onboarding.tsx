import { useNavigate } from "react-router";
import "../styles/app._index.css";

const STEPS = [
  {
    id: 1,
    title: "Sync Your Products",
    description: "Import your Shopify product catalog so the app can use them in upsell offers.",
    icon: "sync",
    link: "/app/product-sync",
    linkLabel: "Go to Product Sync",
  },
  {
    id: 2,
    title: "Create Your First Offer",
    description: "Set up a cross-sell, bundle, discount, or free gift offer to show customers.",
    icon: "offer",
    link: "/app/offers/new",
    linkLabel: "Create an Offer",
  },
    {
    id: 3,
    title: "Add Theme Extension",
    description: "Enable the cart upsell, thank-you upsell, and the activity pixel so smart ranking can use browse data.",
    icon: "theme",
    link: null,
    linkLabel: "View Instructions",
  },
  {
    id: 4,
    title: "Track Performance",
    description: "Monitor views, clicks, conversions, and revenue from your upsell offers.",
    icon: "analytics",
    link: "/app/analytics",
    linkLabel: "View Analytics",
  },
];

const OFFER_TYPES = [
  {
    type: "Cross-Sell",
    description: "Suggest related products when a customer adds items to their cart. Best for increasing average order value.",
    example: "Customer adds a phone case → offer a screen protector.",
    placement: "Checkout / Cart",
  },
  {
    type: "Bundle",
    description: "Offer multiple products together at a discounted price. Great for moving complementary inventory.",
    example: "Customer buys a shampoo → offer a shampoo + conditioner bundle.",
    placement: "Checkout / Cart",
  },
  {
    type: "Quantity Discount",
    description: "Reward customers for buying more with tiered pricing. Ideal for consumable products.",
    example: "Buy 2 get 10% off, buy 3 get 20% off.",
    placement: "Checkout / Cart",
  },
  {
    type: "Free Gift",
    description: "Surprise customers with a free product when they meet a minimum order value. Builds loyalty.",
    example: "Order over $50 → get a free travel-size product.",
    placement: "Thank You Page",
  },
  {
    type: "Subscription",
    description: "Convert one-time buyers into recurring customers with subscription upsells.",
    example: "Buy a coffee bag → subscribe for monthly delivery at 15% off.",
    placement: "Checkout / Cart",
  },
];

const FAQ_ITEMS = [
  {
    question: "Do I need to sync products before creating offers?",
    answer:
      "Yes. The product sync imports your Shopify catalog into the app so you can pick trigger and upsell products when creating offers. Without synced products, the product picker in the offer form will be empty.",
  },
  {
    question: "How do offers appear to customers?",
    answer:
      "Cart upsells are a theme app block: add Cart Upsell in the Theme Editor (Online Store → Themes → Customize → cart template). Thank-you upsells are a checkout UI extension: add Thank You Upsell in the Checkout Editor (Settings → Checkout → Customize). Cart offers show on the cart page; post-purchase offers show on the thank-you page.",
  },
  {
    question: "Can I edit or disable an offer after creating it?",
    answer:
      "Yes. Go to the Dashboard to see all your active offers. You can toggle them on/off, edit their settings, or delete them at any time.",
  },
  {
    question: "How do I track if my offers are working?",
    answer:
      "The Analytics page shows the full funnel: views → clicks → add to cart → purchases, plus view→purchase. Optional browse→offer shows how often storefront browsing later led to an offer view. Smart ranking uses browse activity and these offer stats to reorder eligible offers — it does not create a separate AI conversion event.",
  },
  {
    question: "What is smart ranking?",
    answer:
      "You still pick trigger products and upsell products. Eligibility stays trigger-based. Smart ranking only reorders (and caps) those eligible offers using recent browse activity and shop-wide offer conversion. If there is no browse data, offers stay in the current eligibility order.",
  },
  {
    question: "What permissions does this app need?",
    answer:
      "The app requires write access to products (for syncing) and read access to orders (for tracking purchases via webhooks). These are requested during app installation.",
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  return (
    <div className="appPageShell" style={styles.page}>
      <div className="appPageContent" style={styles.content}>
        {/* Welcome Banner */}
        <div style={styles.welcomeBanner}>
          <div style={styles.welcomeContent} className="onboardingWelcomeContent">
            <div style={styles.welcomeIcon}>
              <WelcomeIcon />
            </div>
            <div>
              <h1 style={styles.welcomeTitle}>Welcome to Checkout Upsell</h1>
              <p style={styles.welcomeSubtitle}>
                Set up your first upsell offer in minutes. Follow the steps below
                to start increasing your average order value.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Start Steps */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Quick Start Guide</h2>
          <p style={styles.sectionSubtitle}>
            Complete these four steps to get up and running.
          </p>

          <div style={styles.stepsGrid} className="onboardingStepsGrid">
            {STEPS.map((step, idx) => (
              <div key={step.id} style={styles.stepCard}>
                <div style={styles.stepHeader}>
                  <div style={styles.stepNumber}>{step.id}</div>
                  <div style={styles.stepConnector}>
                    {idx < STEPS.length - 1 && <div style={styles.connectorLine} />}
                  </div>
                </div>
                <div style={styles.stepIcon}>
                  <StepIcon name={step.icon} />
                </div>
                <h3 style={styles.stepTitle}>{step.title}</h3>
                <p style={styles.stepDescription}>{step.description}</p>
                {step.link ? (
                  <button
                    type="button"
                    onClick={() => navigate(step.link)}
                    style={{ ...styles.stepLink, textDecoration: "none", }}
                  >
                    {step.linkLabel} →
                  </button>
                ) : (
                  <button
                    type="button"
                    style={styles.stepLink}
                    onClick={() => {
                      const el = document.getElementById("theme-extension-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    {step.linkLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Product Sync Guide */}
        <div style={styles.section}>
          <div style={styles.guideCard}>
              <div style={styles.guideHeader} className="onboardingGuideHeader">
              <div style={styles.guideIcon}><SyncIcon /></div>
              <div>
                <h2 style={styles.guideTitle}>Step 1: Sync Your Products</h2>
                <p style={styles.guideSubtitle}>Import your store catalog into the app</p>
              </div>
            </div>
            <div style={styles.guideBody}>
              <div style={styles.guideSteps}>
                <GuideStep
                  number={1}
                  title="Navigate to Product Sync"
                  description='Click "Product Sync" in the top navigation bar, or use the button below.'
                />
                <GuideStep
                  number={2}
                  title="Start the Sync"
                  description='Click the "Sync Products Now" button. The app will import all products and variants from your Shopify store.'
                />
                <GuideStep
                  number={3}
                  title="Wait for Completion"
                  description="The sync processes products in chunks of 25. You can stop and resume at any time. Progress is saved automatically."
                />
                <GuideStep
                  number={4}
                  title="Verify Synced Products"
                  description="Once complete, check that your products appear in the synced list. You can re-sync at any time to pick up new products."
                />
              </div>
              <div style={styles.guideNote}>
                <strong>Tip:</strong> You don't need to sync every product. Only the products you want to use as trigger or upsell products need to be synced.
              </div>
              <button
                type="button"
                onClick={() => navigate("/app/product-sync")}
                style={{ ...styles.primaryButton, textDecoration: "none" }}
              >
                Go to Product Sync
              </button>
            </div>
          </div>
        </div>

        {/* Create Offer Guide */}
        <div style={styles.section}>
          <div style={styles.guideCard}>
              <div style={styles.guideHeader} className="onboardingGuideHeader">
              <div style={styles.guideIcon}><OfferIcon /></div>
              <div>
                <h2 style={styles.guideTitle}>Step 2: Create Your First Offer</h2>
                <p style={styles.guideSubtitle}>Choose an offer type and configure it</p>
              </div>
            </div>
            <div style={styles.guideBody}>
              <div style={styles.guideSteps}>
                <GuideStep
                  number={1}
                  title="Choose Offer Type"
                  description="Select from Cross-Sell, Bundle, Quantity Discount, Free Gift, or Subscription."
                />
                <GuideStep
                  number={2}
                  title="Pick Placement"
                  description="Choose where the offer appears: Pre-Purchase (Checkout/Cart) or Post-Purchase (Thank You Page)."
                />
                <GuideStep
                  number={3}
                  title="Configure the Offer"
                  description="Set a title, select trigger products (what the customer buys), choose an upsell product, and set the deal type (free, discount, or as-is)."
                />
                <GuideStep
                  number={4}
                  title="Set Schedule (Optional)"
                  description="You can set a date range for when the offer is active, or leave it to run indefinitely."
                />
                <GuideStep
                  number={5}
                  title="Save and Activate"
                  description='Click "Save Offer" to create it. The offer starts showing to customers immediately based on your settings.'
                />
              </div>

              {/* Offer Types Reference */}
              <h3 style={styles.subHeading}>Offer Types at a Glance</h3>
              <div style={styles.offerTypeGrid} className="onboardingOfferTypeGrid">
                {OFFER_TYPES.map((ot) => (
                  <div key={ot.type} style={styles.offerTypeCard}>
                    <div style={styles.offerTypeHeader}>
                      <span style={styles.offerTypeBadge}>{ot.placement}</span>
                    </div>
                    <h4 style={styles.offerTypeName}>{ot.type}</h4>
                    <p style={styles.offerTypeDesc}>{ot.description}</p>
                    <p style={styles.offerTypeExample}>
                      <strong>Example:</strong> {ot.example}
                    </p>
                  </div>
                ))}
              </div>

              <div style={styles.guideNote}>
                <strong>Note:</strong> Currently, Cross-Sell is fully supported. Other offer types are available in the form but will be expanded with additional features in future updates.
              </div>

              <button
                type="button"
                onClick={() => navigate("/app/offers/new")}
                style={{ ...styles.primaryButton, textDecoration: "none" }}
              >
                Create Your First Offer
              </button>
            </div>
          </div>
        </div>

        {/* Theme Extension Guide */}
        <div style={styles.section} id="theme-extension-section">
          <div style={styles.guideCard}>
              <div style={styles.guideHeader} className="onboardingGuideHeader">
              <div style={styles.guideIcon}><ThemeIcon /></div>
              <div>
                <h2 style={styles.guideTitle}>Step 3: Add storefront upsells</h2>
                <p style={styles.guideSubtitle}>Cart block in Theme Editor; thank-you block in Checkout Editor</p>
              </div>
            </div>
            <div style={styles.guideBody}>
              <div style={styles.guideSteps}>
                <GuideStep
                  number={1}
                  title="Add Cart Upsell in Theme Editor"
                  description='From Shopify Admin, go to Online Store → Themes → Customize. Open the cart template, click Add block, and add Cart Upsell.'
                />
                <GuideStep
                  number={2}
                  title="Add Thank You Upsell in Checkout Editor"
                  description="From Shopify Admin, go to Settings → Checkout → Customize. Open the Thank you page, add the Thank You Upsell app block, and save."
                />
                <GuideStep
                  number={3}
                  title="Connect browse tracking"
                  description="Open the app in Shopify admin once so the Activity Pixel is created (Settings → Customer events should show Connected). Then in Theme Editor → App embeds, enable Upsell activity. That embed records product, collection, search, and cart-add on the storefront even if the pixel is delayed. Tracking respects Shopify analytics consent."
                />
                <GuideStep
                  number={4}
                  title="Position the blocks"
                  description="On cart, place the block near the cart items or checkout button. On thank-you, keep it near the order confirmation so it is easy to see."
                />
                <GuideStep
                  number={5}
                  title="Save and preview"
                  description="Save both editors. Add a trigger product to the cart to test cart upsells, then complete a test order to see thank-you offers."
                />
              </div>

              <div style={styles.infoBox}>
                <h4 style={styles.infoBoxTitle}>Available Extensions</h4>
                <div style={styles.extensionList}>
                  <div style={styles.extensionItem}>
                    <div style={styles.extensionDot} />
                    <div>
                      <strong>Pre-Purchase Upsell</strong>
                      <span style={styles.extensionDesc}> — Cart Upsell theme app block on the cart page (Theme Editor).</span>
                    </div>
                  </div>
                  <div style={styles.extensionItem}>
                    <div style={styles.extensionDot} />
                    <div>
                      <strong>Post-Purchase Upsell</strong>
                      <span style={styles.extensionDesc}> — Thank You Upsell checkout UI extension (Checkout Editor), after the order is placed.</span>
                    </div>
                  </div>
                  <div style={styles.extensionItem}>
                    <div style={styles.extensionDot} />
                    <div>
                      <strong>Product Discount Function</strong>
                      <span style={styles.extensionDesc}> — Automatically applies discounts to qualifying upsell products.</span>
                    </div>
                  </div>
                  <div style={styles.extensionItem}>
                    <div style={styles.extensionDot} />
                    <div>
                      <strong>Activity Pixel</strong>
                      <span style={styles.extensionDesc}> — Web pixel that records browse activity for smart ranking (no extra theme snippet).</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={styles.guideNote}>
                <strong>Tip:</strong> Test your offers by adding a trigger product to your cart and proceeding to checkout. You should see the upsell block appear based on your offer configuration.
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Guide */}
        <div style={styles.section}>
          <div style={styles.guideCard}>
              <div style={styles.guideHeader} className="onboardingGuideHeader">
              <div style={styles.guideIcon}><AnalyticsIcon /></div>
              <div>
                <h2 style={styles.guideTitle}>Step 4: Track Your Performance</h2>
                <p style={styles.guideSubtitle}>Measure the impact of your upsell offers</p>
              </div>
            </div>
            <div style={styles.guideBody}>
              <div style={styles.guideSteps}>
                <GuideStep
                  number={1}
                  title="View the Dashboard"
                  description="The Dashboard shows total views, clicks, add-to-cart events, and purchases across all your offers."
                />
                <GuideStep
                  number={2}
                  title="Drill Into Individual Offers"
                  description="Click on any offer to see its specific performance metrics and revenue attribution."
                />
                <GuideStep
                  number={3}
                  title="Optimize Based on Data"
                  description="If an offer has high views but low clicks, try changing the promotional title. If clicks are high but purchases are low, consider adjusting the deal type or discount."
                />
              </div>

              <h3 style={styles.subHeading}>Metrics Explained</h3>
              <div style={styles.metricsGrid} className="onboardingMetricsGrid">
                <MetricCard
                  label="Views"
                  description="Number of times the upsell offer was displayed to customers."
                  color="#2c6ecb"
                />
                <MetricCard
                  label="Clicks"
                  description="Number of times a customer clicked on the upsell offer."
                  color="#0f6a4c"
                />
                <MetricCard
                  label="Add to Cart"
                  description="Number of times a customer added the upsell product to their cart."
                  color="#b45f06"
                />
                <MetricCard
                  label="Purchases"
                  description="Number of completed orders that included the upsell product."
                  color="#d72c0d"
                />
              </div>

              <button
                type="button"
                onClick={() => navigate("/app/analytics")}
                style={{ ...styles.primaryButton, textDecoration: "none"}}
              >
                View Analytics
              </button>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Frequently Asked Questions</h2>
          <div style={styles.faqList}>
            {FAQ_ITEMS.map((item, idx) => (
              <FaqItem key={idx} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={styles.bottomCta}>
          <h2 style={styles.ctaTitle}>Ready to Get Started?</h2>
          <p style={styles.ctaSubtitle}>
            Follow the steps above, or jump straight into creating your first offer.
          </p>
          <div style={styles.ctaButtons} className="onboardingCtaButtons">
            <button
              type="button"
              onClick={() => navigate("/app/product-sync")}
              style={{ ...styles.secondaryButton, textDecoration: "none" }}
            >
              Sync Products
            </button>
            <button
              type="button"
              onClick={() => navigate("/app/offers/new")}
              style={{ ...styles.secondaryButton, textDecoration: "none"}}
            >
              Create an Offer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function GuideStep({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div style={styles.guideStep}>
      <div style={styles.guideStepNumber}>{number}</div>
      <div>
        <h4 style={styles.guideStepTitle}>{title}</h4>
        <p style={styles.guideStepDesc}>{description}</p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  description,
  color,
}: {
  label: string;
  description: string;
  color: string;
}) {
  return (
    <div style={styles.metricCard}>
      <div style={{ ...styles.metricDot, background: color }} />
      <div>
        <h4 style={styles.metricLabel}>{label}</h4>
        <p style={styles.metricDesc}>{description}</p>
      </div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div style={styles.faqItem}>
      <h4 style={styles.faqQuestion}>{question}</h4>
      <p style={styles.faqAnswer}>{answer}</p>
    </div>
  );
}

// ── SVG Icons ───────────────────────────────────────────────────────

function WelcomeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0f6a4c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5Z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function StepIcon({ name }: { name: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#4a4a4a",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (name === "sync") {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 1 1-9-9" />
        <path d="M21 3v6h-6" />
      </svg>
    );
  }
  if (name === "offer") {
    return (
      <svg {...common}>
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
        <circle cx="7" cy="7" r="1" fill="#4a4a4a" stroke="none" />
      </svg>
    );
  }
  if (name === "theme") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 3v18h18" />
      <path d="m7 16 4-8 4 4 4-6" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2c6ecb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function OfferIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0f6a4c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1" fill="#0f6a4c" stroke="none" />
    </svg>
  );
}

function ThemeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b45f06" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d72c0d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="m7 16 4-8 4 4 4-6" />
    </svg>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#202223",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },

  // Welcome banner
  welcomeBanner: {
    background: "linear-gradient(135deg, #e9faf1 0%, #f0f7ff 100%)",
    border: "1px solid #d3f2e0",
    borderRadius: 12,
    padding: "28px 32px",
  },
  welcomeContent: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  welcomeIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  welcomeTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#16181d",
  },
  welcomeSubtitle: {
    margin: "6px 0 0",
    fontSize: 14,
    color: "#5b6472",
    lineHeight: 1.5,
  },

  // Sections
  section: {},
  sectionTitle: {
    margin: "0 0 4px",
    fontSize: 18,
    fontWeight: 700,
    color: "#16181d",
  },
  sectionSubtitle: {
    margin: "0 0 20px",
    fontSize: 14,
    color: "#616161",
  },

  // Steps grid
  stepsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
  },
  stepCard: {
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: 10,
    padding: "20px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    position: "relative",
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: "#1a1a1a",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepConnector: {
    flex: 1,
    position: "relative",
    height: 2,
  },
  connectorLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: -16,
    height: 2,
    background: "#e1e3e5",
  },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "#f6f6f7",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 700,
    color: "#16181d",
  },
  stepDescription: {
    margin: 0,
    fontSize: 13,
    color: "#616161",
    lineHeight: 1.5,
    flex: 1,
  },
  stepLink: {
    background: "none",
    border: "none",
    color: "#0f6a4c",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
    textAlign: "left",
  },

  // Guide cards
  guideCard: {
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: 12,
    overflow: "hidden",
  },
  guideHeader: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "20px 24px",
    borderBottom: "1px solid #f1f2f3",
    background: "#fafbfb",
  },
  guideIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  guideTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 700,
    color: "#16181d",
  },
  guideSubtitle: {
    margin: "2px 0 0",
    fontSize: 13,
    color: "#616161",
  },
  guideBody: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  guideSteps: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  guideStep: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
  },
  guideStepNumber: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "#f1f2f3",
    color: "#4a4a4a",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  guideStepTitle: {
    margin: "0 0 2px",
    fontSize: 14,
    fontWeight: 600,
    color: "#16181d",
  },
  guideStepDesc: {
    margin: 0,
    fontSize: 13,
    color: "#616161",
    lineHeight: 1.5,
  },
  guideNote: {
    background: "#f6f6f7",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 13,
    color: "#4a4a4a",
    lineHeight: 1.5,
  },

  // Offer types
  subHeading: {
    margin: "8px 0 12px",
    fontSize: 15,
    fontWeight: 700,
    color: "#16181d",
  },
  offerTypeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  offerTypeCard: {
    background: "#fafbfb",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "16px",
  },
  offerTypeHeader: {
    marginBottom: 8,
  },
  offerTypeBadge: {
    display: "inline-block",
    background: "#eef1fb",
    color: "#2c6ecb",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 4,
  },
  offerTypeName: {
    margin: "0 0 6px",
    fontSize: 14,
    fontWeight: 700,
    color: "#16181d",
  },
  offerTypeDesc: {
    margin: "0 0 8px",
    fontSize: 12,
    color: "#616161",
    lineHeight: 1.5,
  },
  offerTypeExample: {
    margin: 0,
    fontSize: 12,
    color: "#4a4a4a",
    lineHeight: 1.5,
    fontStyle: "italic",
  },

  // Info box
  infoBox: {
    background: "#f6f6f7",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "16px 20px",
  },
  infoBoxTitle: {
    margin: "0 0 12px",
    fontSize: 14,
    fontWeight: 700,
    color: "#16181d",
  },
  extensionList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  extensionItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 13,
    color: "#4a4a4a",
    lineHeight: 1.5,
  },
  extensionDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#0f6a4c",
    flexShrink: 0,
    marginTop: 7,
  },
  extensionDesc: {
    color: "#616161",
  },

  // Metrics
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 14,
  },
  metricCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    background: "#fafbfb",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "14px 16px",
  },
  metricDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
    marginTop: 5,
  },
  metricLabel: {
    margin: "0 0 2px",
    fontSize: 14,
    fontWeight: 700,
    color: "#16181d",
  },
  metricDesc: {
    margin: 0,
    fontSize: 12,
    color: "#616161",
    lineHeight: 1.5,
  },

  // FAQ
  faqList: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  faqItem: {
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 10,
  },
  faqQuestion: {
    margin: "0 0 6px",
    fontSize: 14,
    fontWeight: 700,
    color: "#16181d",
  },
  faqAnswer: {
    margin: 0,
    fontSize: 13,
    color: "#616161",
    lineHeight: 1.6,
  },

  // Bottom CTA
  bottomCta: {
    background: "#1a1a1a",
    borderRadius: 12,
    padding: "32px",
    textAlign: "center" as const,
  },
  ctaTitle: {
    margin: "0 0 6px",
    fontSize: 20,
    fontWeight: 700,
    color: "#ffffff",
  },
  ctaSubtitle: {
    margin: "0 0 20px",
    fontSize: 14,
    color: "#a0a0a0",
  },
  ctaButtons: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
  },

  // Buttons
  primaryButton: {
    background: "#1a1a1a",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    alignItems: "center",
  },
  secondaryButton: {
    background: "#ffffff",
    color: "#1a1a1a",
    border: "1px solid #c9cccf",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  },
};
