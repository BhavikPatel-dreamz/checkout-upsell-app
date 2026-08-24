import { useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  getOfferAddedToCartMetrics,
  getOfferClickMetrics,
  getOfferPurchaseMetrics,
  getOfferViewMetrics,
} from "../models/offerAnalytics.server";

async function getProductMetaMap(shop: string, productIds: string[]) {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (uniqueProductIds.length === 0) return { titles: {} as Record<string, string>, images: {} as Record<string, string> };

  const rows = await db.productVariant.findMany({
    where: { shop, productId: { in: uniqueProductIds } },
    select: { productId: true, productTitle: true, imageUrl: true },
  });

  return rows.reduce<{ titles: Record<string, string>; images: Record<string, string> }>(
    (acc, row) => {
      acc.titles[row.productId] = row.productTitle || row.productId;
      if (row.imageUrl) acc.images[row.productId] = row.imageUrl;
      return acc;
    },
    { titles: {}, images: {} },
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const viewMetrics = await getOfferViewMetrics(session.shop);
  const clickMetrics = await getOfferClickMetrics(session.shop);
  const addedToCartMetrics = await getOfferAddedToCartMetrics(session.shop);
  const purchaseMetrics = await getOfferPurchaseMetrics(session.shop);

  const productIds = Array.from(
    new Set([
      ...viewMetrics.productBreakdown.map((row) => row.productId),
      ...clickMetrics.productBreakdown.map((row) => row.productId),
      ...addedToCartMetrics.productBreakdown.map((row) => row.productId),
      ...purchaseMetrics.productBreakdown.map((row) => row.productId),
    ]),
  );

  const productMetaMap = await getProductMetaMap(session.shop, productIds);

  return { viewMetrics, clickMetrics, addedToCartMetrics, purchaseMetrics, productMetaMap };
}

/* ---------------------------------- */
/* Design tokens                       */
/* ---------------------------------- */
const colors = {
  border: "#E3E5E7",
  cardBg: "#FFFFFF",
  pageBg: "#F6F6F7",
  text: "#1A1A1A",
  subdued: "#6B7177",
  headBg: "#FAFBFC",
  accent: "#2C6ECB",
};

const iconThemes = {
  blue: { bg: "linear-gradient(135deg,#EAF2FF,#D6E7FF)", fg: "#2C6ECB" },
  green: { bg: "linear-gradient(135deg,#E3F6E9,#CDEFD9)", fg: "#28815A" },
  purple: { bg: "linear-gradient(135deg,#F1E9FE,#E4D4FD)", fg: "#7C3AED" },
};

/* Fixed heights so cards never grow with row count */
const TABLE_CARD_HEIGHT = 300;
const TABLE_SCROLL_HEIGHT = 200;
const STAT_CARD_HEIGHT = 92;

/* ---------------------------------- */
/* Inline SVG icons (zero deps)        */
/* ---------------------------------- */
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

/* ---------------------------------- */
/* Scoped CSS for hover + scrollbars   */
/* (inline styles can't do :hover)     */
/* ---------------------------------- */
function AnalyticsStyles() {
  return (
    <style>{`
      .an-card {
        transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
      }
      .an-card:hover {
        box-shadow: 0 4px 14px rgba(20,20,30,0.07);
        border-color: #D3D8DD;
      }
      .an-scroll::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .an-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .an-scroll::-webkit-scrollbar-thumb {
        background: #D5D9DD;
        border-radius: 10px;
      }
      .an-scroll::-webkit-scrollbar-thumb:hover {
        background: #B8BEC4;
      }
      .an-scroll {
        scrollbar-width: thin;
        scrollbar-color: #D5D9DD transparent;
      }
      .an-row:hover td {
        background: #FAFBFC;
      }
      .an-stat-value {
        background: linear-gradient(90deg,#1A1A1A,#3A3A3A);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
    `}</style>
  );
}

/* ---------------------------------- */
/* Reusable building blocks            */
/* ---------------------------------- */
function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`an-card${className ? ` ${className}` : ""}`}
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "1.1rem",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
      {accent && (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
          }}
        />
      )}
      <h2
        style={{
          fontSize: "0.98rem",
          fontWeight: 650,
          color: colors.text,
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {children}
      </h2>
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: "0.9rem",
        fontWeight: 600,
        color: colors.text,
        margin: "0 0 0.75rem",
      }}
    >
      {children}
    </h3>
  );
}

function StatCard({
  icon,
  theme,
  label,
  value,
  minWidth = "220px",
}: {
  icon: React.ReactNode;
  theme: { bg: string; fg: string };
  label: string;
  value: number | string;
  minWidth?: string;
}) {
  return (
    <Card
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.9rem",
        flex: `1 1 ${minWidth}`,
        minWidth,
        height: `${STAT_CARD_HEIGHT}px`,
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
          flexShrink: 0,
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.03)",
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.82rem",
            color: colors.subdued,
            marginBottom: "0.2rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {label}
        </div>
        <strong className="an-stat-value" style={{ fontSize: "1.65rem", lineHeight: 1, fontWeight: 700 }}>
          {value}
        </strong>
      </div>
    </Card>
  );
}

type Row = {
  key: string;
  label: string;
  subtitle?: string;
  imageSrc?: string;
  value: number;
  image?: boolean;
  action?: React.ReactNode;
};

function BreakdownTable({
  title,
  columns,
  rows,
  emptyText,
  minWidth = "280px",
  accent = colors.accent,
}: {
  title: string;
  columns: [string, string];
  rows: Row[];
  emptyText: string;
  minWidth?: string;
  accent?: string;
}) {
  return (
    <Card
      style={{
        flex: `1 1 ${minWidth}`,
        minWidth,
        height: `${TABLE_CARD_HEIGHT}px`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <CardTitle>{title}</CardTitle>
        {rows.length > 0 && (
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: accent,
              background: `${accent}14`,
              padding: "0.15rem 0.55rem",
              borderRadius: "999px",
              marginBottom: "0.75rem",
              flexShrink: 0,
            }}
          >
            {rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            background: colors.headBg,
            border: `1px dashed ${colors.border}`,
            borderRadius: "8px",
            color: colors.subdued,
            fontSize: "0.85rem",
          }}
        >
          <ImagePlaceholderIcon />
          {emptyText}
        </div>
      ) : (
        <div
          className="an-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "auto",
            border: `1px solid ${colors.headBg}`,
            borderRadius: "8px",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    textAlign: "left",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    color: colors.subdued,
                    background: colors.headBg,
                    borderBottom: `1px solid ${colors.border}`,
                    padding: "0.5rem 0.65rem",
                    whiteSpace: "nowrap",
                    zIndex: 1,
                  }}
                >
                  {columns[0]}
                </th>
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    textAlign: "left",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    color: colors.subdued,
                    background: colors.headBg,
                    borderBottom: `1px solid ${colors.border}`,
                    padding: "0.5rem 0.65rem",
                    whiteSpace: "nowrap",
                    zIndex: 1,
                  }}
                >
                  {columns[1]}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="an-row" key={row.key}>
                  <td
                    style={{
                      padding: "0.55rem 0.65rem",
                      borderBottom: `1px solid ${colors.headBg}`,
                      fontSize: "0.87rem",
                      color: colors.text,
                      transition: "background 0.1s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0, flex: 1 }}>
                        {row.image ? (
                          <>
                            {row.imageSrc ? (
                              <img
                                src={row.imageSrc}
                                alt="Product"
                                style={{
                                  width: "26px",
                                  height: "26px",
                                  borderRadius: "6px",
                                  objectFit: "cover",
                                  border: `1px solid ${colors.border}`,
                                  display: "block",
                                  flexShrink: 0,
                                  background: colors.headBg,
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "26px",
                                  height: "26px",
                                  borderRadius: "6px",
                                  background: colors.headBg,
                                  border: `1px solid ${colors.border}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <ImagePlaceholderIcon />
                              </div>
                            )}
                          </>
                        ) : null}
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                          <span style={{ wordBreak: "break-word", fontWeight: row.action ? 600 : 500 }}>{row.label}</span>
                          {row.subtitle ? (
                            <span style={{ wordBreak: "break-all", fontSize: "0.72rem", color: colors.subdued }}>
                              {row.subtitle}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {row.action ? <div style={{ flexShrink: 0 }}>{row.action}</div> : null}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "0.55rem 0.65rem",
                      borderBottom: `1px solid ${colors.headBg}`,
                      fontSize: "0.87rem",
                      color: colors.text,
                      fontWeight: 600,
                      transition: "background 0.1s ease",
                    }}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Row({
  children,
  gap = "1rem",
}: {
  children: React.ReactNode;
  gap?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "stretch",
        gap,
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------- */
/* Page                                */
/* ---------------------------------- */
export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { viewMetrics, clickMetrics, addedToCartMetrics, purchaseMetrics, productMetaMap } = useLoaderData<typeof loader>();

  const openOfferDetails = (offerId: string) => {
    navigate(`/app/analytics/${encodeURIComponent(offerId)}`);
  };

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
      <AnalyticsStyles />

      <div style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 750,
            color: colors.text,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          Analytics
        </h1>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.87rem", color: colors.subdued }}>
          Checkout upsell performance across views, clicks, carts, and purchases
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
        {/* ---------- Views ---------- */}
        <section>
          <SectionLabel accent={iconThemes.blue.fg}>Upsell view metrics</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Row>
              <StatCard
                icon={<EyeIcon color={iconThemes.blue.fg} />}
                theme={iconThemes.blue}
                label="Total Upsell Views"
                value={viewMetrics.totalViews}
              />
              <StatCard
                icon={<UserIcon color={iconThemes.green.fg} />}
                theme={iconThemes.green}
                label="Unique Logged-in Users"
                value={viewMetrics.uniqueLoggedInUsers}
              />
              <StatCard
                icon={<UsersIcon color={iconThemes.purple.fg} />}
                theme={iconThemes.purple}
                label="Unique Guest Users"
                value={viewMetrics.uniqueGuestUsers}
              />
            </Row>

            <Row>
              <BreakdownTable
                title="Views by offer"
                columns={["Offer", "Views"]}
                emptyText="No offer view data yet."
                minWidth="320px"
                accent={iconThemes.blue.fg}
                rows={viewMetrics.offerBreakdown.map((r) => ({
                  key: r.offerId,
                  label: r.offerName,
                  value: r.views,
                  action: (
                    <button
                      type="button"
                      onClick={() => openOfferDetails(r.offerId)}
                      style={{
                        border: `1px solid ${colors.border}`,
                        background: "#F8FAFC",
                        color: colors.text,
                        borderRadius: "6px",
                        padding: "0.35rem 0.65rem",
                        fontSize: "0.74rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      View
                    </button>
                  ),
                }))}
              />
              <BreakdownTable
                title="Views by product"
                columns={["Product", "Views"]}
                emptyText="No product view data yet."
                minWidth="320px"
                accent={iconThemes.blue.fg}
                rows={viewMetrics.productBreakdown.map((r) => ({
                  key: r.productId,
                  label: productMetaMap.titles[r.productId] ?? r.productId,
                  subtitle: productMetaMap.images[r.productId] ? `Product - ${r.productId}` : undefined,
                  imageSrc: productMetaMap.images[r.productId] ?? undefined,
                  value: r.views,
                  image: true,
                }))}
              />
            </Row>
          </div>
        </section>

        {/* ---------- Clicks ---------- */}
        <section>
          <SectionLabel accent={iconThemes.blue.fg}>Upsell click metrics</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Row>
              <StatCard
                icon={<CursorClickIcon color={iconThemes.blue.fg} />}
                theme={iconThemes.blue}
                label="Total Upsell Clicks"
                value={clickMetrics.totalClicks}
              />
            </Row>
            <Row>
              <BreakdownTable
                title="Clicks by offer"
                columns={["Offer", "Clicks"]}
                emptyText="No offer click data yet."
                minWidth="320px"
                accent={iconThemes.blue.fg}
                rows={clickMetrics.offerBreakdown.map((r) => ({
                  key: r.offerId,
                  label: r.offerName,
                  value: r.clicks,
                }))}
              />
              <BreakdownTable
                title="Clicks by product"
                columns={["Product", "Clicks"]}
                emptyText="No product click data yet."
                minWidth="320px"
                accent={iconThemes.blue.fg}
                rows={clickMetrics.productBreakdown.map((r) => ({
                  key: r.productId,
                  label: productMetaMap.titles[r.productId] ?? r.productId,
                  subtitle: productMetaMap.images[r.productId] ? `Product - ${r.productId}` : undefined,
                  imageSrc: productMetaMap.images[r.productId] ?? undefined,
                  value: r.clicks,
                  image: true,
                }))}
              />
            </Row>
          </div>
        </section>

        {/* ---------- Added to cart ---------- */}
        <section>
          <SectionLabel accent={iconThemes.green.fg}>Upsell added-to-cart metrics</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Row>
              <StatCard
                icon={<CartIcon color={iconThemes.green.fg} />}
                theme={iconThemes.green}
                label="Total Upsells Added to Cart"
                value={addedToCartMetrics.totalAddedToCart}
              />
            </Row>
            <Row>
              <BreakdownTable
                title="Added to Cart by Offer"
                columns={["Offer", "Added to Cart"]}
                emptyText="No offer add-to-cart data yet."
                minWidth="320px"
                accent={iconThemes.green.fg}
                rows={addedToCartMetrics.offerBreakdown.map((r) => ({
                  key: r.offerId,
                  label: r.offerName,
                  value: r.addedToCart,
                }))}
              />
              <BreakdownTable
                title="Added to Cart by Product"
                columns={["Product", "Added to Cart"]}
                emptyText="No product add-to-cart data yet."
                minWidth="320px"
                accent={iconThemes.green.fg}
                rows={addedToCartMetrics.productBreakdown.map((r) => ({
                  key: r.productId,
                  label: productMetaMap.titles[r.productId] ?? r.productId,
                  subtitle: productMetaMap.images[r.productId] ? `Product - ${r.productId}` : undefined,
                  imageSrc: productMetaMap.images[r.productId] ?? undefined,
                  value: r.addedToCart,
                  image: true,
                }))}
              />
            </Row>
          </div>
        </section>

        {/* ---------- Purchases ---------- */}
        <section>
          <SectionLabel accent={iconThemes.purple.fg}>Upsell purchase metrics</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Row>
              <StatCard
                icon={<BagIcon color={iconThemes.purple.fg} />}
                theme={iconThemes.purple}
                label="Total Upsell Purchases"
                value={purchaseMetrics.totalPurchases}
              />
            </Row>
            <Row>
              <BreakdownTable
                title="Purchases by Offer"
                columns={["Offer", "Purchases"]}
                emptyText="No data available"
                minWidth="320px"
                accent={iconThemes.purple.fg}
                rows={purchaseMetrics.offerBreakdown.map((r) => ({
                  key: r.offerId,
                  label: r.offerName,
                  value: r.purchases,
                }))}
              />
              <BreakdownTable
                title="Purchases by Product"
                columns={["Product", "Purchases"]}
                emptyText="No data available"
                minWidth="320px"
                accent={iconThemes.purple.fg}
                rows={purchaseMetrics.productBreakdown.map((r) => ({
                  key: r.productId,
                  label: productMetaMap.titles[r.productId] ?? r.productId,
                  subtitle: productMetaMap.images[r.productId] ? `Product - ${r.productId}` : undefined,
                  imageSrc: productMetaMap.images[r.productId] ?? undefined,
                  value: r.purchases,
                  image: true,
                }))}
              />
            </Row>
          </div>
        </section>
      </div>

      <p
        style={{
          marginTop: "1.75rem",
          fontSize: "0.78rem",
          color: colors.subdued,
          textAlign: "right",
          borderTop: `1px solid ${colors.border}`,
          paddingTop: "0.85rem",
        }}
      >
        All times are in your store&apos;s time zone.
      </p>
    </div>
  );
}