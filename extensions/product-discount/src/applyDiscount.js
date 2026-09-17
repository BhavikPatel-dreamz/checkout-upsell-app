export const FUNCTION_ALLOWED_POLICIES = ["percent", "amount", "free_shipping"];

export function isFunctionAllowedPolicy(value) {
  return FUNCTION_ALLOWED_POLICIES.indexOf(value) !== -1;
}

export function clampPercent(value, maxDiscountPercent) {
  var max = Number(maxDiscountPercent);
  if (!Number.isFinite(max) || max <= 0) return 0;
  var raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, Math.min(50, max));
}

export function functionDiscountForPolicy(input) {
  var policyType = input.policyType || "none";
  var max = Number(input.maxDiscountPercent);
  if (!Number.isFinite(max)) max = 15;
  if (!isFunctionAllowedPolicy(policyType)) return { kind: "none" };
  if (policyType === "percent") {
    var percent = clampPercent(input.policyValue, max);
    if (percent <= 0) return { kind: "none" };
    return { kind: "product_percent", percent: percent };
  }
  if (policyType === "amount") {
    var raw = Number(input.policyValue);
    if (!Number.isFinite(raw) || raw <= 0 || max <= 0) return { kind: "none" };
    var price = Number(input.linePrice);
    var cap = Number.isFinite(price) && price > 0 ? (price * max) / 100 : raw;
    var amount = Math.min(raw, cap);
    if (amount <= 0) return { kind: "none" };
    return { kind: "product_amount", amount: amount };
  }
  if (max <= 0) return { kind: "none" };
  return { kind: "shipping_percent", percent: 100 };
}

export function attrMap(line) {
  var map = {};
  var attrs = line.attribute || line.attributes || [];
  if (!Array.isArray(attrs)) {
    if (line.upsellPolicy) map._upsell_policy = line.upsellPolicy;
    if (line.upsellPolicyValue != null) map._upsell_policy_value = String(line.upsellPolicyValue);
    if (line.upsellMaxDiscount != null) map._upsell_max_discount = String(line.upsellMaxDiscount);
    return map;
  }
  for (var i = 0; i < attrs.length; i++) {
    if (attrs[i] && attrs[i].key) map[attrs[i].key] = attrs[i].value;
  }
  return map;
}
