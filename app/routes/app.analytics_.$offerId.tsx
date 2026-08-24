import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";

import { authenticate } from "../shopify.server";
import { getOfferAnalyticsForOffer } from "../models/offerAnalytics.server";

const colors = {
  border: "#E3E5E7",
  cardBg: "#FFFFFF",
  pageBg: "#F6F6F7",
  text: "#1A1A1A",
  subdued: "#6B7177",
  headBg: "#FAFBFC",
  accent: "#2C6ECB",
  green: "#28815A",
  purple: "#7C3AED",
};

const iconThemes = {
  blue: { bg: "linear-gradient(135deg,#EAF2FF,#D6E7FF)", fg: "#2C6ECB" },
  green: { bg: "linear-gradient(135deg,#E3F6E9,#CDEFD9)", fg: "#28815A" },
  purple: { bg: "linear-gradient(135deg,#F1E9FE,#E4D4FD)", fg: "#7C3AED" },
};

const EyeIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" />
  </svg>
);

const UserIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.8" />
    <path d="M4.5 20c1.4-3.5 4.3-5.5 7.5-5.5s6.1 2 7.5 5.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const UsersIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="3.2" stroke={color} strokeWidth="1.8" />
    <path d="M2.8 19.5c1.2-3.1 3.6-4.9 6.2-4.9s5 1.8 6.2 4.9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <path d="M15.5 5.3c1.3.4 2.3 1.6 2.3 3s-1 2.6-2.3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17.5 14.8c1.9.6 3.4 2.1 4.2 4.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const CursorClickIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M6 3l3.5 15L12 13l5-1.5L6 3Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M15.5 15.5l3.5 3.5M18.5 12h2.5M15.5 8.5l1.8-1.8M12 4.5V2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const CartIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M3 4h2l1.6 11.2A2 2 0 0 0 8.6 17h8.8a2 2 0 0 0 2-1.7L21 8H6" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9.5" cy="20.5" r="1.4" fill={color} />
    <circle cx="17" cy="20.5" r="1.4" fill={color} />
  </svg>
);

const BagIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M6 8h12l1 12.5a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 20.5L6 8Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ImagePlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#A7ACB1" strokeWidth="1.6" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="#A7ACB1" />
    <path d="M21 15l-5-5-9 9" stroke="#A7ACB1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function formatRate(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function StatCard({
  icon,
  theme,
  label,
  value,
}: {
  icon: React.ReactNode;
  theme: { bg: string; fg: string };
  label: string;
  value: number | string;
}) {
  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.9rem",
        flex: "1 1 220px",
        minWidth: "220px",
        minHeight: "92px",
      }}
    >
      <div
        style={{
          width: "46px",
          height: "46px",
          borderRadius: "10px",
          background: theme.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.03)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "0.83rem", color: colors.subdued, marginBottom: "0.25rem" }}>{label}</div>
        <div style={{ fontSize: "1.6rem", fontWeight: 700, color: colors.text }}>{value}</div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>{children}</div>;
}

function FunnelBadge({
  label,
  value,
  rate,
}: {
  label: string;
  value: number;
  rate: number | null;
}) {
  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "0.9rem 1rem",
        flex: "1 1 160px",
        minWidth: "140px",
      }}
    >
      <div style={{ fontSize: "0.8rem", color: colors.subdued, marginBottom: "0.3rem" }}>{label}</div>
      <div style={{ fontSize: "1.45rem", fontWeight: 700, color: colors.text }}>{value}</div>
      <div style={{ fontSize: "0.74rem", color: colors.subdued, marginTop: "0.25rem" }}>
        {label === "Views" ? "—" : formatRate(rate)}
      </div>
    </div>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const offerId = params.offerId?.trim();

  if (!session?.shop) {
    return { analytics: null };
  }

  if (!offerId) {
    return { analytics: null };
  }

  const analytics = await getOfferAnalyticsForOffer(session.shop, offerId);
  return { analytics: analytics ?? null };
}

export default function OfferAnalyticsDetailsPage() {
  const navigate = useNavigate();
  const { analytics } = useLoaderData<typeof loader>();

  if (!analytics) {
    return (
      <div
        style={{
          background: colors.pageBg,
          minHeight: "100%",
          padding: "1.5rem",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: "560px",
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            padding: "1.5rem",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.35rem", color: colors.text }}>Offer not found</h2>
          <p style={{ margin: "0 0 1rem", color: colors.subdued, lineHeight: 1.5 }}>
            This offer could not be loaded or no longer exists.
          </p>
          <button
            type="button"
            onClick={() => navigate("/app/analytics")}
            style={{
              background: colors.accent,
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Back to Analytics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: colors.pageBg,
        minHeight: "100%",
        padding: "1.5rem",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.7rem", letterSpacing: "-0.02em", color: colors.text }}>Offer Analytics Details</h1>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.88rem", color: colors.subdued }}>
            {analytics.offer.name}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/analytics")}
          style={{
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: "8px",
            padding: "0.65rem 0.9rem",
            fontSize: "0.84rem",
            fontWeight: 600,
            color: colors.text,
            cursor: "pointer",
          }}
        >
          Back to Analytics
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <section>
          <div style={{ fontSize: "0.95rem", fontWeight: 650, color: colors.text, marginBottom: "0.8rem" }}>Offer information</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <div
              style={{
                background: colors.cardBg,
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                padding: "1rem",
                flex: "1 1 220px",
                minWidth: "220px",
              }}
            >
              <div style={{ fontSize: "0.8rem", color: colors.subdued, marginBottom: "0.3rem" }}>Offer name</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: colors.text }}>{analytics.offer.name}</div>
            </div>
            <div
              style={{
                background: colors.cardBg,
                border: `1px solid ${colors.border}`,
                borderRadius: "12px",
                padding: "1rem",
                flex: "1 1 220px",
                minWidth: "220px",
              }}
            >
              <div style={{ fontSize: "0.8rem", color: colors.subdued, marginBottom: "0.3rem" }}>Products configured</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: colors.text }}>{analytics.offer.configuredProductCount}</div>
            </div>
          </div>
        </section>

        <section>
          <div style={{ fontSize: "0.95rem", fontWeight: 650, color: colors.text, marginBottom: "0.8rem" }}>Views</div>
          <Row>
            <StatCard icon={<EyeIcon color={iconThemes.blue.fg} />} theme={iconThemes.blue} label="Total views" value={analytics.summary.totalViews} />
            <StatCard icon={<UserIcon color={iconThemes.green.fg} />} theme={iconThemes.green} label="Unique logged-in users" value={analytics.summary.uniqueLoggedInUsers} />
            <StatCard icon={<UsersIcon color={iconThemes.purple.fg} />} theme={iconThemes.purple} label="Unique guest users" value={analytics.summary.uniqueGuestUsers} />
          </Row>
        </section>

        <section>
          <div style={{ fontSize: "0.95rem", fontWeight: 650, color: colors.text, marginBottom: "0.8rem" }}>Funnel summary</div>
          <Row>
            <FunnelBadge label="Views" value={analytics.funnel.views} rate={null} />
            <FunnelBadge label="Clicks" value={analytics.funnel.clicks} rate={analytics.funnel.clickThroughRate} />
            <FunnelBadge label="Added to Cart" value={analytics.funnel.addedToCart} rate={analytics.funnel.addToCartRate} />
            <FunnelBadge label="Purchases" value={analytics.funnel.purchases} rate={analytics.funnel.purchaseRate} />
          </Row>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem", marginTop: "1rem" }}>
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "0.8rem 1rem", flex: "1 1 220px" }}>
              <div style={{ fontSize: "0.8rem", color: colors.subdued, marginBottom: "0.2rem" }}>Click-through rate</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{formatRate(analytics.funnel.clickThroughRate)}</div>
            </div>
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "0.8rem 1rem", flex: "1 1 220px" }}>
              <div style={{ fontSize: "0.8rem", color: colors.subdued, marginBottom: "0.2rem" }}>Add-to-cart rate</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{formatRate(analytics.funnel.addToCartRate)}</div>
            </div>
            <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "0.8rem 1rem", flex: "1 1 220px" }}>
              <div style={{ fontSize: "0.8rem", color: colors.subdued, marginBottom: "0.2rem" }}>Purchase rate</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{formatRate(analytics.funnel.purchaseRate)}</div>
            </div>
          </div>
        </section>

        <section>
          <div style={{ fontSize: "0.95rem", fontWeight: 650, color: colors.text, marginBottom: "0.8rem" }}>Product performance</div>
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "12px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: colors.headBg }}>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Product</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Product ID</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Views</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Clicks</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Added to Cart</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Purchases</th>
                </tr>
              </thead>
              <tbody>
                {analytics.products.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", color: colors.subdued }}>
                      No product activity for this offer yet.
                    </td>
                  </tr>
                ) : (
                  analytics.products.map((product) => (
                    <tr key={product.productId} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: "0.8rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.productName} style={{ width: "28px", height: "28px", borderRadius: "6px", objectFit: "cover", border: `1px solid ${colors.border}` }} />
                          ) : (
                            <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: colors.headBg, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <ImagePlaceholderIcon />
                            </div>
                          )}
                          <span style={{ fontWeight: 600 }}>{product.productName}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.8rem 1rem", color: colors.subdued, wordBreak: "break-all" }}>{product.productId}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.views}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.clicks}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.addedToCart}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.purchases}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
