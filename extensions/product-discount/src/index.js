// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").InputQuery} InputQuery
 * @typedef {import("../generated/api").FunctionResult} FunctionResult
 * @typedef {import("../generated/api").Target} Target
 * @typedef {import("../generated/api").ProductVariant} ProductVariant
 */

/**
 * @type {FunctionResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

export default /**
 * @param {InputQuery} input
 * @returns {FunctionResult}
 */
(input) => {
  // Define a type for your configuration, and parse it from the metafield
  /**
   * @type {{
   *  attribute: string
   *  percentage: number
   * }}
   */
  const configuration = JSON.parse(
    input?.discountNode?.metafield?.value ?? "{}"
  );
  const custom_store =input?.cart?._custom_store?.value;

  const hasSubscription = input.cart.lines.some(line => {
    return line.subscription_evrgreen && line.subscription_evrgreen.value;
  });
  
  
  if(custom_store=='cerion'){
    console.log("innn");

    const targets1 = input.cart.lines
    // Filter the line items based on the configured variant ID
    .filter(line => {
      // Check if the 'merchandise' is a 'ProductVariant' and has the desired variant ID
      return (
        line.merchandise.__typename === "ProductVariant" 
      );
    })
    .map(line => {
      const variant = /** @type {ProductVariant} */ (line.merchandise);
      return /** @type {Target} */ ({
        productVariant: {
          id: variant.id
        }
      });
    });
    console.log("targets",JSON.stringify({
      discounts: [
        {
          targets1,
          value: {
            percentage: {
              // Use the configured percentage instead of a hardcoded value
              value: "10"
            }
          }
        }
      ],
      discountApplicationStrategy: DiscountApplicationStrategy.First
    }));      
    const discount = input.cart.lines
  // Filter the line items based on the configured variant ID
  .filter(line => {
    // Check if the 'merchandise' is a 'ProductVariant' and has a valid compare price
    const _compare_price = line._compare_price; // Make sure to access _compare_price from the line
    return (
      line.merchandise.__typename === "ProductVariant" &&
      _compare_price?.value != null && (parseFloat(_compare_price?.value) > 0 && _compare_price?.value !== '')
    );
  })
  .map(line => {
    const variant = /** @type {ProductVariant} */ (line.merchandise);
    const _compare_price = line._compare_price; // Access _compare_price for the value
    return /** @type {Target} */ ({
      targets: [{
        productVariant: {
          id: variant.id
        }
      }],
      value: {
        percentage: {
          // Use the configured percentage instead of a hardcoded value
          value: _compare_price?.value.toString()
        }
      },
      message:"Rabatt"
    });
  });

console.log("discount",JSON.stringify({
  discounts: discount,
  discountApplicationStrategy: DiscountApplicationStrategy.First
}));

return {
  discounts: discount,
  discountApplicationStrategy: "ALL"
};

  }

  if (hasSubscription) {

    const discount = input.cart.lines
      .filter(line => {
        const val = line.subscription_evrgreen?.value ?? "";
  
        return (
          line.merchandise.__typename === "ProductVariant" &&
          val !== ""
        );
      })
      .map(line => {
        const variant = line.merchandise;
        const val = line.subscription_evrgreen?.value ?? "0";
  
        const price = parseFloat(line.cost.amountPerQuantity.amount || "0");
        const subVal = parseFloat(line.subscription_evrgreen?.value ?? "0");
  
  
        // ✅ CORRECT: discount amount calculate karo
        let discountAmount = price - subVal;
  
        // ✅ safety (negative avoid)
        if (discountAmount < 0) {
          discountAmount = 0;
        }
  
        return {
          targets: [
            {
              cartLine: {
                id: line.id
              }
            }
          ],
          value: {
            fixedAmount: {
              amount: discountAmount.toString(), // ✅ correct value
              appliesToEachItem: true
            }
          },
          message: "Subscription Discount"
        };
      });
  
    return {
      discounts: discount,
      discountApplicationStrategy: "ALL"
    };
  }





  if (!configuration.attribute || !configuration.percentage) {
    return EMPTY_DISCOUNT;
  }

  const targets = input.cart.lines
    // Filter the line items based on the configured variant ID
    .filter(line => {
      // Check if the 'merchandise' is a 'ProductVariant' and has the desired variant ID
      return (
        line.merchandise.__typename === "ProductVariant" &&
        line.attribute?.value == configuration.attribute
      );
    })
    .map(line => {
      const variant = /** @type {ProductVariant} */ (line.merchandise);
      return /** @type {Target} */ ({
        productVariant: {
          id: variant.id
        }
      });
    });

  if (!targets.length) {
    console.error("No cart lines qualify for volume discount.");
    return EMPTY_DISCOUNT;
  }

  return {
    discounts: [
      {
        targets,
        value: {
          percentage: {
            // Use the configured percentage instead of a hardcoded value
            value: configuration.percentage.toString()
          }
        }
      }
    ],
    discountApplicationStrategy: DiscountApplicationStrategy.First
  };
};
