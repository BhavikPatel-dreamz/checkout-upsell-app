import { functionDiscountForPolicy } from "./applyDiscount";

function linePolicy(line) {
  return {
    policyType: (line.upsellPolicy && line.upsellPolicy.value) || "none",
    policyValue: line.upsellPolicyValue && line.upsellPolicyValue.value ? Number(line.upsellPolicyValue.value) : null,
    maxDiscountPercent:
      line.upsellMaxDiscount && line.upsellMaxDiscount.value ? Number(line.upsellMaxDiscount.value) : 15,
    linePrice: line.cost && line.cost.amountPerQuantity ? Number(line.cost.amountPerQuantity.amount) : null,
  };
}

export function cartLinesDiscountsGenerateRun(input) {
  const candidates = [];
  const lines = (input.cart && input.cart.lines) || [];
  for (const line of lines) {
    const op = functionDiscountForPolicy(linePolicy(line));
    if (op.kind === "product_percent") {
      candidates.push({
        message: "Upsell",
        targets: [{ cartLine: { id: line.id } }],
        value: { percentage: { value: String(op.percent) } },
      });
    } else if (op.kind === "product_amount") {
      candidates.push({
        message: "Upsell",
        targets: [{ cartLine: { id: line.id } }],
        value: { fixedAmount: { amount: String(op.amount.toFixed(2)) } },
      });
    }
  }
  if (!candidates.length) return { operations: [] };
  return {
    operations: [
      {
        productDiscountsAdd: {
          selectionStrategy: "FIRST",
          candidates,
        },
      },
    ],
  };
}

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const lines = (input.cart && input.cart.lines) || [];
  const groups = (input.cart && input.cart.deliveryGroups) || [];
  let allowShipping = false;
  for (const line of lines) {
    const op = functionDiscountForPolicy(linePolicy(line));
    if (op.kind === "shipping_percent") allowShipping = true;
  }
  if (!allowShipping || !groups.length) return { operations: [] };
  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          selectionStrategy: "FIRST",
          candidates: groups.map((group) => ({
            message: "Free shipping",
            targets: [{ deliveryGroup: { id: group.id } }],
            value: { percentage: { value: "100.0" } },
          })),
        },
      },
    ],
  };
}
