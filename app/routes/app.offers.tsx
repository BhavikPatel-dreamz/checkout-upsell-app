import { useState, useEffect } from "react";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
  useLocation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";

import { productSyncAction } from "../lib/productSync.server";
import { authenticate } from "../shopify.server";
import { listOffers } from "../models/offer.server";
import { findVariantsByProductIds } from "../models/productVariant.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const offers = await listOffers(session.shop);

  // Collect productIds referenced by offers (productSelection or targetProductIds)
  const productIds = new Set<string>();
  for (const o of offers) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rules = (o.triggerRules as any) ?? {};
      const items = Array.isArray(rules?.productSelection?.items)
        ? rules.productSelection.items
        : Array.isArray(rules?.manualSelections)
        ? rules.manualSelections
        : [];
      for (const it of items) {
        if (it && typeof it.productId === "string") productIds.add(it.productId);
      }
    } catch (e) {
      // ignore malformed triggerRules
    }
    if (Array.isArray(o.targetProductIds)) {
      for (const pid of o.targetProductIds) if (typeof pid === "string") productIds.add(pid);
    }
  }

  const productRows = await findVariantsByProductIds(session.shop, Array.from(productIds));
  const productTitleByProductId: Record<string, string> = {};
  for (const r of productRows) {
    if (r.productId && r.productTitle) productTitleByProductId[r.productId] = r.productTitle;
  }

  return { offers, productTitleByProductId };
}

// Kept for backward compatibility (nothing on this page posts to it anymore —
// the Product Sync dashboard at /app/product-sync owns its own action now).
export async function action(args: ActionFunctionArgs) {
  return productSyncAction(args);
}

export default function OffersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { offers, productTitleByProductId } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const [visibleOffers, setVisibleOffers] = useState(offers);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"Dashboard" | "Help">("Dashboard");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setVisibleOffers(offers);
  }, [offers]);

  // derive product titles per offer on the client from loader-provided maps
  function productTitlesForOffer(offer: any) {
    const titles: string[] = [];
    try {
      const rules = (offer.triggerRules as any) ?? {};
      const items = Array.isArray(rules?.productSelection?.items)
        ? rules.productSelection.items
        : Array.isArray(rules?.manualSelections)
        ? rules.manualSelections
        : [];
      for (const it of items) {
        if (it && typeof it.productId === "string") {
          const t = productTitleByProductId[it.productId] ?? "Product unavailable";
          if (!titles.includes(t)) titles.push(t);
        }
      }
    } catch (e) {
      // ignore
    }
    if (Array.isArray(offer.targetProductIds)) {
      for (const pid of offer.targetProductIds) {
        const t = productTitleByProductId[pid] ?? "Product unavailable";
        if (!titles.includes(t)) titles.push(t);
      }
    }
    return titles;
  }

  const totalViews = 0;
  const totalAdded = 0;
  const activeCount = visibleOffers.filter((o) => Boolean(o.isActive)).length;

  function goToCreate() {
    navigate("/app/offers/new");
  }

  function editUpsell(id: string) {
    const params = new URLSearchParams(location.search);
    params.set("id", id);
    params.delete("type");
    const suffix = params.toString();
    navigate(`/app/offers/new${suffix ? `?${suffix}` : ""}`);
  }

  async function toggleStatus(id: string) {
    const offer = offers.find((item) => item.id === id);
    if (!offer) return;

    const response = await fetch(`/api/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !offer.isActive }),
    });

    if (!response.ok) {
      showToast("Failed to update the offer status");
      return;
    }

    const newActive = !offer.isActive;
    showToast(newActive ? "Upsell activated successfully." : "Upsell deactivated successfully.");
    window.location.reload();
  }

  async function deleteUpsell(id: string) {
    if (!id) {
      showToast("Offer ID is required.");
      return;
    }

    const offer = visibleOffers.find((item) => item.id === id);
    if (!offer) {
      showToast("Offer not found.");
      return;
    }

    setDeleteTarget({ id, title: offer.name ?? "this upsell" });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const { id } = deleteTarget;
    setDeletingId(id);

    try {
      const response = await fetch(`/api/offers/${id}`, { method: "DELETE" });

      if (!response.ok) {
        showToast("Failed to delete the offer");
        return;
      }

      setVisibleOffers((current) => current.filter((offer) => offer.id !== id));
      setDeleteTarget(null);
      showToast("Upsell deleted successfully.");
    } finally {
      setDeletingId((current) => (current === id ? null : current));
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  // Show toast for newly created offers redirected here with ?created=1
  useEffect(() => {
    const created = searchParams.get("created");
    if (created) {
      showToast("Upsell created successfully.");
      const url = new URL(window.location.href);
      url.searchParams.delete("created");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function viewDetails(section: string) {
    document
      .getElementById("active-upsells-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`Showing details for: ${section}`);
  }

  return (
    <div style={styles.page}>
      {/* ---- Top nav ---- */}
      <div style={styles.navBar}>
        <div style={styles.navLeft}>
          <span style={styles.logoMark}>D</span>
          <span style={styles.logoText}>Dynamic Dreamz</span>
        </div>
        <div style={styles.navTabs}>
          <button
            onClick={() => setActiveTab("Dashboard")}
            style={{
              ...styles.navTab,
              ...(activeTab === "Dashboard" ? styles.navTabActive : {}),
            }}
          >
            Dashboard
          </button>
          {/* Product Sync has its own full dashboard route — navigate there
              directly instead of rendering a local placeholder, so there's
              no flash of a bare "Sync Products" button before the real
              stat cards / charts / table page loads. */}
          <button style={styles.navTab} onClick={() => navigate("/app/product-sync")}>
            Product Sync
          </button>
          <button
            onClick={() => setActiveTab("Help")}
            style={{
              ...styles.navTab,
              ...(activeTab === "Help" ? styles.navTabActive : {}),
            }}
          >
            Help
          </button>
        </div>
      </div>

      {activeTab === "Help" ? (
        <div style={styles.placeholderSection}>
          <h2 style={styles.placeholderHeading}>Help</h2>
          <p style={styles.placeholderText}>Help &amp; documentation will appear here.</p>
        </div>
      ) : (
        <>
          {/* ---- Stat cards ---- */}
          <div style={styles.statGrid}>
            <StatCard
              label="Total Upsell Views"
              value={totalViews}
              onViewDetails={() => viewDetails("Total Upsell Views")}
            />
            <StatCard
              label="Upsell Product Added to Checkout"
              value={totalAdded}
              onViewDetails={() => viewDetails("Upsell Product Added to Checkout")}
            />
            <StatCard
              label="Active Upsells"
              value={activeCount}
              onViewDetails={() => viewDetails("Active Upsells")}
            />
          </div>

          {/* ---- Active Upsells section ---- */}
          <div id="active-upsells-section" style={styles.tableSection}>
            <div style={styles.tableSectionHeader}>
              <h2 style={styles.sectionHeading}>Active Upsells</h2>
              <div style={styles.headerButtons}>
                <button
                  style={styles.darkButton}
                  onClick={goToCreate}
                >
                  Create New Upsell Offer
                </button>
              </div>
            </div>

            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Title</th>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Upsell type</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleOffers.length === 0 ? (
                  <tr>
                    <td style={styles.emptyCell} colSpan={5}>
                      There are no data
                    </td>
                  </tr>
                ) : (
                  visibleOffers.map((offer: any) => {
                    const titles = productTitlesForOffer(offer);
                    const productDisplay =
                      titles.length === 0
                        ? "Product unavailable"
                        : titles.length <= 2
                        ? titles.join(", ")
                        : `${titles[0]} + ${titles.length - 1}`;

                    return (
                      <tr key={offer.id} style={styles.tr}>
                        <td style={styles.td}>{offer.name}</td>
                        <td style={styles.td}>{productDisplay}</td>
                        <td style={styles.td}>
                          {offer.placement === "post_purchase" ? "Post-Purchase" : "Pre-Purchase"}
                        </td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.badge,
                              ...(offer.isActive ? styles.badgeActive : styles.badgeDraft),
                            }}
                          >
                            {offer.isActive ? "Active" : "Draft"}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <button
                            style={styles.linkButton}
                            onClick={() => editUpsell(offer.id)}
                          >
                            Edit
                          </button>
                          <button
                            style={styles.linkButton}
                            onClick={() => toggleStatus(offer.id)}
                          >
                            {offer.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            style={{
                              ...styles.linkButton,
                              color: deletingId === offer.id ? "#6b7280" : "#d72c0d",
                              opacity: deletingId === offer.id ? 0.7 : 1,
                              cursor: deletingId === offer.id ? "not-allowed" : "pointer",
                            }}
                            onClick={() => deleteUpsell(offer.id)}
                            disabled={deletingId === offer.id}
                          >
                            {deletingId === offer.id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {deleteTarget && (
        <div style={styles.modalBackdrop} onClick={() => setDeleteTarget(null)}>
          <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}>Delete upsell?</div>
            <div style={styles.modalBody}>
              <div style={styles.modalTitle}>Delete this upsell?</div>
              <div style={styles.modalText}>
                {deleteTarget.title ? `"${deleteTarget.title}" will be permanently removed.` : "This upsell will be permanently removed."}
              </div>
            </div>
            <div style={styles.modalActions}>
              <button style={styles.cancelButton} onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button style={styles.confirmButton} onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function StatCard({
  label,
  value,
  onViewDetails,
}: {
  label: string;
  value: number;
  onViewDetails: () => void;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statCardBody}>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value}</div>
      </div>
      <div style={styles.statCardFooter}>
        <button style={styles.linkButton} onClick={onViewDetails}>
          View Details
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "#f6f6f7",
    minHeight: "100vh",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#202223",
  },
  navBar: {
    background: "#ffffff",
    borderBottom: "1px solid #e1e3e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    height: 56,
  },
  navLeft: { display: "flex", alignItems: "center", gap: 8 },
  logoMark: { color: "#d72c0d", fontWeight: 800, fontSize: 22 },
  logoText: { fontWeight: 600, fontSize: 15 },
  navTabs: { display: "flex", gap: 28, height: "100%" },
  navTab: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "0 4px",
    height: "100%",
    fontSize: 14,
    color: "#616161",
    cursor: "pointer",
  },
  navTabActive: {
    color: "#202223",
    fontWeight: 600,
    borderBottom: "2px solid #d72c0d",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    padding: 24,
  },
  statCard: {
    background: "#ffffff",
    borderRadius: 8,
    border: "1px solid #e1e3e5",
    overflow: "hidden",
  },
  statCardBody: { padding: "20px 20px 24px" },
  statLabel: { fontSize: 13, color: "#616161", marginBottom: 12 },
  statValue: { fontSize: 28, fontWeight: 700 },
  statCardFooter: { background: "#f1f2f3", padding: "10px 20px" },
  tableSection: {
    background: "#ffffff",
    margin: "0 24px 24px",
    borderRadius: 8,
    border: "1px solid #e1e3e5",
    overflow: "hidden",
  },
  tableSectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 20px",
  },
  sectionHeading: { fontSize: 20, fontWeight: 600, margin: 0 },
  headerButtons: { display: "flex", gap: 12 },
  darkButton: {
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    background: "#f1f2f3",
    padding: "12px 20px",
    fontSize: 13,
    fontWeight: 600,
    borderTop: "1px solid #e1e3e5",
    borderBottom: "1px solid #e1e3e5",
  },
  tr: { borderBottom: "1px solid #f1f2f3" },
  td: { padding: "14px 20px", fontSize: 14 },
  emptyCell: {
    padding: "40px 20px",
    textAlign: "center",
    fontSize: 15,
    color: "#4a4a4a",
  },
  badge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
  },
  badgeActive: { background: "#d3f9d8", color: "#1a7f37" },
  badgeDraft: { background: "#f1f2f3", color: "#616161" },
  linkButton: {
    background: "none",
    border: "none",
    color: "#2c6ecb",
    fontSize: 13,
    cursor: "pointer",
    marginRight: 14,
    padding: 0,
  },
  placeholderSection: { padding: 40 },
  placeholderHeading: { margin: "0 0 8px" },
  placeholderText: { color: "#616161" },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(16, 24, 40, 0.28)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1200,
  },
  modalCard: {
    width: "min(420px, calc(100vw - 32px))",
    background: "#ffffff",
    border: "1px solid #dfe3e8",
    borderRadius: 12,
    boxShadow: "0 18px 40px rgba(0, 0, 0, 0.16)",
    overflow: "hidden",
  },
  modalHeader: {
    padding: "16px 20px",
    background: "#f6f6f7",
    borderBottom: "1px solid #e1e3e5",
    fontSize: 15,
    fontWeight: 700,
    color: "#202223",
  },
  modalBody: {
    padding: "20px",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#202223",
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    lineHeight: 1.5,
    color: "#4a4a4a",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 12,
    padding: "0 20px 20px",
  },
  cancelButton: {
    background: "#ffffff",
    border: "1px solid #c4cdd5",
    color: "#202223",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  confirmButton: {
    background: "#d72c0d",
    border: "none",
    color: "#ffffff",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#1a1a1a",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: 6,
    fontSize: 13,
    zIndex: 1100,
  },
};