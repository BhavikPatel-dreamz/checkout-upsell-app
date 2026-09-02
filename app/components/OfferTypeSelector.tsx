/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Offer type + placement selection step of the create flow.
 *
 * Rendered at /app/offers/new when the request carries no offer id, type, or
 * placement. The merchant picks an offer type (and a placement), then
 * "Continue" opens the unified offer form pre-configured for that choice.
 */

import { useState } from "react";
import { useSearchParams } from "react-router";
import type { OfferPlacement, OfferType } from "@prisma/client";

import { offerTypeOptions, OFFER_TYPE_CONFIG } from "../config/offerTypes";
import { PLACEMENT_LABELS } from "../types/offer";
import { AdminAppLink } from "./AdminAppLink";

const CREATE_PLACEMENTS: OfferPlacement[] = ["checkout", "post_purchase"];

// Small per-type glyphs — purely decorative, keyed by offer type value so an
// unrecognised/future type still falls back gracefully to the generic icon.
const TYPE_ICONS: Record<string, React.ReactNode> = {
  cross_sell: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 7H15a2 2 0 0 1 2 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  bundle: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 7.5L12 12L20 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 12V21" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  quantity_discount: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 12L12 4H19V11L11 19L4 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="15" cy="8" r="1.4" fill="currentColor" />
    </svg>
  ),
  free_gift: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="9" width="18" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 13H21" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 9V20" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 9C12 9 8.5 9 8.5 6.5C8.5 5.12 9.62 4.5 10.5 4.5C11.88 4.5 12 6.5 12 9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 9C12 9 15.5 9 15.5 6.5C15.5 5.12 14.38 4.5 13.5 4.5C12.12 4.5 12 6.5 12 9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  subscription: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 4V8H16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 20V16H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ai_recommend: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3L13.6 8.4L19 10L13.6 11.6L12 17L10.4 11.6L5 10L10.4 8.4L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M19 15L19.7 17.3L22 18L19.7 18.7L19 21L18.3 18.7L16 18L18.3 17.3L19 15Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ),
};

function TypeIcon({ type }: { type: string }) {
  return (
    TYPE_ICONS[type] ?? (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  );
}

export default function OfferTypeSelector() {
  const [searchParams] = useSearchParams();
  const [selectedType, setSelectedType] = useState<OfferType>("cross_sell");
  const [placement, setPlacement] = useState<OfferPlacement>("checkout");

  function getContinueUrl() {
    const params = new URLSearchParams();
    params.set("offerType", selectedType);
    params.set("placement", placement);
    return `/app/offers/new?${params.toString()}`;
  }

  return (
    <div style={styles.wrapper}>
      <style>{globalCss}</style>

      <SectionRow
        title="Offer Type"
        description="Pick the upsell mechanic this offer will use. More types are on the way."
      >
        <div style={styles.cardGrid}>
          {offerTypeOptions().map((option) => {
            const active = option.value === selectedType;
            const disabled = option.value !== "cross_sell";
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setSelectedType(option.value)}
                className={`of-type-card${active ? " of-type-card-active" : ""}${
                  disabled ? " of-type-card-disabled" : ""
                }`}
                style={{
                  ...styles.card,
                  ...(active ? styles.cardActive : {}),
                  ...(disabled ? styles.cardDisabled : {}),
                }}
                aria-pressed={active}
                aria-disabled={disabled}
              >
                <div style={styles.cardTopRow}>
                  <span
                    style={{
                      ...styles.cardIcon,
                      ...(active ? styles.cardIconActive : {}),
                    }}
                  >
                    <TypeIcon type={option.value} />
                  </span>
                  {active && (
                    <span style={styles.cardCheck} aria-hidden="true">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4L3.5 6.5L9 1"
                          stroke="#fff"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  {disabled && <span style={styles.comingSoonBadge}>Coming soon</span>}
                </div>
                <span style={styles.cardTitle}>{option.label}</span>
                <span style={styles.cardDescription}>{option.description}</span>
              </button>
            );
          })}
        </div>
      </SectionRow>

      <SectionRow
        title="Placement"
        description="Choose where shoppers will see this offer in their journey."
      >
        <div style={styles.placementRow}>
          {CREATE_PLACEMENTS.map((value) => {
            const selected = placement === value;
            return (
              <label
                key={value}
                className={`of-placement-card${selected ? " of-placement-card-selected" : ""}`}
                style={{
                  ...styles.placementCard,
                  ...(selected ? styles.placementCardSelected : {}),
                }}
              >
                <input
                  type="radio"
                  name="placement"
                  value={value}
                  checked={selected}
                  onChange={() => setPlacement(value)}
                  style={styles.visuallyHiddenInput}
                />
                <span
                  style={{
                    ...styles.radioOuter,
                    ...(selected ? styles.radioOuterSelected : {}),
                  }}
                  aria-hidden="true"
                >
                  {selected && <span style={styles.radioDot} />}
                </span>
                <span style={styles.placementLabel}>{PLACEMENT_LABELS[value]}</span>
              </label>
            );
          })}
        </div>
      </SectionRow>

      <div style={styles.actionsRow}>
        <AdminAppLink to={getContinueUrl()} className="of-btn-primary" style={styles.submitButton}>
          Continue
        </AdminAppLink>
        <AdminAppLink to="/app" className="of-btn-secondary" style={styles.cancelButton}>
          Cancel
        </AdminAppLink>
      </div>

      <p style={styles.typeHint}>
        Selected type: <strong style={styles.typeHintStrong}>{OFFER_TYPE_CONFIG[selectedType].label}</strong>
        {" · "}
        {PLACEMENT_LABELS[placement]}
      </p>
    </div>
  );
}

function SectionRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.sectionRow}>
      <div style={styles.sectionRowHeader}>
        <div style={styles.sectionLabel}>{title}</div>
        {description && <div style={styles.sectionDescription}>{description}</div>}
      </div>
      {children}
    </div>
  );
}

const globalCss = `
  .of-type-card {
    transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease, transform 120ms ease;
  }
  .of-type-card:not(.of-type-card-disabled):hover {
    border-color: #9AA1AC;
    transform: translateY(-1px);
  }
  .of-type-card-active:not(.of-type-card-disabled):hover {
    border-color: #008060;
  }
  .of-type-card:focus-visible {
    outline: 2px solid #008060;
    outline-offset: 2px;
  }
  .of-placement-card {
    transition: border-color 120ms ease, background 120ms ease;
  }
  .of-placement-card:hover {
    border-color: #9AA1AC;
  }
  .of-placement-card-selected:hover {
    border-color: #008060;
  }
  .of-btn-primary {
    transition: background 120ms ease, transform 120ms ease;
  }
  .of-btn-primary:hover {
    background: #005C46 !important;
  }
  .of-btn-primary:active {
    transform: translateY(1px);
  }
  .of-btn-secondary {
    transition: border-color 120ms ease, background 120ms ease;
  }
  .of-btn-secondary:hover {
    border-color: #9AA1AC;
    background: #FAFAFB;
  }
`;

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
  padding: "0 0 40px",   // was "24px 0 40px"
  maxWidth: 900,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#1C1E21",
},
  helpText: { fontSize: 14, color: "#6B7280", margin: "0 0 28px", lineHeight: 1.5 },

  sectionRow: { marginBottom: 28 },
  sectionRowHeader: { marginBottom: 14 },
  sectionLabel: { fontWeight: 650, fontSize: 15, color: "#1C1E21" },
  sectionDescription: { marginTop: 4, fontSize: 13, color: "#6B7280", lineHeight: 1.5 },

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 12,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textAlign: "left",
    background: "#ffffff",
    border: "1px solid #D4D6DC",
    borderRadius: 12,
    padding: "16px 18px",
    cursor: "pointer",
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  cardActive: {
    border: "1.5px solid #008060",
    background: "#F0FAF6",
    boxShadow: "0 0 0 1px #008060 inset",
  },
  cardDisabled: {
    cursor: "not-allowed",
    opacity: 0.55,
  },
  cardTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 22,
  },
  cardIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "#F1F2F4",
    color: "#6B7280",
    flexShrink: 0,
  },
  cardIconActive: {
    background: "#008060",
    color: "#fff",
  },
  cardCheck: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#008060",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  comingSoonBadge: {
    fontSize: 10.5,
    fontWeight: 650,
    color: "#8A6D00",
    background: "#FFF6D9",
    border: "1px solid #F3E3A0",
    borderRadius: 999,
    padding: "2px 8px",
    letterSpacing: 0,
    flexShrink: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: 650, color: "#1C1E21" },
  cardDescription: { fontSize: 13, color: "#6B7280", lineHeight: 1.45 },

  placementRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  placementCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid #D4D6DC",
    borderRadius: 10,
    padding: "12px 16px",
    cursor: "pointer",
    background: "#fff",
    userSelect: "none",
    boxSizing: "border-box",
    minWidth: 220,
  },
  placementCardSelected: {
    borderColor: "#008060",
    background: "#F0FAF6",
    boxShadow: "0 0 0 1px #008060 inset",
  },
  placementLabel: { fontSize: 14, color: "#1C1E21", fontWeight: 500 },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "1.5px solid #C7CBD1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "#fff",
  },
  radioOuterSelected: { borderColor: "#008060" },
  radioDot: { width: 8, height: 8, borderRadius: "50%", background: "#008060" },
  visuallyHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  },

  actionsRow: { display: "flex", gap: 12 },
  submitButton: {
    background: "#008060",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "11px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  cancelButton: {
    background: "#fff",
    color: "#1C1E21",
    border: "1px solid #D4D6DC",
    borderRadius: 8,
    padding: "11px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },

  typeHint: { marginTop: 18, fontSize: 13, color: "#6B7280" },
  typeHintStrong: { color: "#005C46", fontWeight: 650 },
};