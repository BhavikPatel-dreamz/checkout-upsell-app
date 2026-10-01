import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Checkout Upsell App</h1>
        <p className={styles.text}>
          Related products in cart, Shopify Checkout, and thank-you. Install and open the
          app from the Shopify App Store or Shopify Admin. Store URLs are not entered here.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Cart, checkout, and thank-you.</strong> Show a related product after a
            trigger item is in the cart.
          </li>
          <li>
            <strong>Merchant-controlled catalog.</strong> You pick trigger products and the
            product to recommend.
          </li>
          <li>
            <strong>Privacy.</strong>{" "}
            <a href="/privacy">How we handle store and shopper data</a>.
          </li>
        </ul>
      </div>
    </div>
  );
}
