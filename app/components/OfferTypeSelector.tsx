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
      <p style={styles.helpText}>
        Choose the type of offer you want to create, then continue to the offer
        form.
      </p>

      <div style={styles.sectionLabel}>Offer Type</div>
      <div style={styles.cardGrid}>
        {offerTypeOptions().map((option) => {
          const active = option.value === selectedType;
          const disabled = option.value !== "cross_sell" && option.value !== "ai_recommend";
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setSelectedType(option.value)}
              style={{
                ...styles.card,
                ...(active ? styles.cardActive : {}),
                ...(disabled ? styles.cardDisabled : {}),
              }}
              aria-pressed={active}
              aria-disabled={disabled}
            >
              <span style={styles.cardTitle}>{option.label}</span>
              <span style={styles.cardDescription}>{option.description}</span>
            </button>
          );
        })}
      </div>

      <div style={styles.sectionLabel}>Placement</div>
      <div style={styles.checkCol}>
        {CREATE_PLACEMENTS.map((value) => (
          <label key={value} style={styles.radioRow}>
            <input
              type="radio"
              name="placement"
              value={value}
              checked={placement === value}
              onChange={() => setPlacement(value)}
              style={styles.nativeRadio}
            />
            <span style={styles.checkboxLabel}>{PLACEMENT_LABELS[value]}</span>
          </label>
        ))}
      </div>

      <div style={styles.actionsRow}>
        <AdminAppLink to={getContinueUrl()} style={styles.submitButton}>
          Continue
        </AdminAppLink>
        <AdminAppLink to="/app" style={styles.cancelButton}>
          Cancel
        </AdminAppLink>
      </div>

      <p style={styles.typeHint}>
        Selected type: {OFFER_TYPE_CONFIG[selectedType].label} ·{" "}
        {PLACEMENT_LABELS[placement]}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    padding: "24px 0 40px",
    maxWidth: 900,
  },
  helpText: { fontSize: 14, color: "#4a4a4a", margin: "0 0 20px" },
  sectionLabel: {
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 10,
    marginTop: 8,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: 12,
    marginBottom: 24,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    textAlign: "left",
    background: "#ffffff",
    border: "1px solid #c9cccf",
    borderRadius: 8,
    padding: "16px 18px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  cardActive: {
    border: "2px solid #2c6ecb",
    background: "#f0f6ff",
    padding: "15px 17px",
  },
  cardDisabled: {
    cursor: "not-allowed",
    opacity: 0.5,
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#202223" },
  cardDescription: { fontSize: 13, color: "#5C5F62", lineHeight: 1.4 },
  checkCol: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 },
  radioRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    width: "fit-content",
  },
  checkboxLabel: { fontSize: 14 },
  nativeRadio: { width: 18, height: 18, marginRight: 8, cursor: "pointer" },
  actionsRow: { display: "flex", gap: 12 },
  submitButton: {
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  cancelButton: {
    background: "#fff",
    color: "#202223",
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  typeHint: {
    marginTop: 16,
    fontSize: 13,
    color: "#616161",
  },
};
