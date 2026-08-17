import { useEffect, useMemo, useState} from "react";
import {
  extend,
  render,
  useExtensionInput,
  BlockStack,
  Button,
  CalloutBanner,
  Heading,
  Image,
  Text,
  TextContainer,
  Separator,
  Tiles,
  TextBlock,
  Layout
} from "@shopify/post-purchase-ui-extensions-react";
import config from "./config";

// For local development, replace APP_URL with your local tunnel URL.

const APP_URL =config.api_base_url;

// Preload data from your app server to ensure that the extension loads quickly.

extend(
  "Checkout::PostPurchase::ShouldRender",
  
  async ({ inputData, storage }) => {
   
    const myshopifyDomain= inputData && inputData.shop && inputData.shop.domain;
    const customer_id = inputData && inputData.initialPurchase && inputData.initialPurchase.customerId;
    // console.log('live- inputData', inputData);
    // console.log('live- storage', storage);

    const initialCartData= inputData.initialPurchase.lineItems;
    const initialCartDetails = initialCartData.map((item) => {
      // console.log('live- item', item)
      const purchaseCartData = {
        product_id: "gid://shopify/Product/"+item.product.id,
        variant_id: "gid://shopify/ProductVariant/"+item.product.variant.id,
        quantity: item.quantity,
        totalAmount: item.totalPriceSet.presentmentMoney.amount,
        // currencyCode: item.totalPriceSet.presentmentMoney.currencyCode,
        // customer: "gid://shopify/Customer/"+customer_id
      };
      return purchaseCartData;
    });
   const dd= {
    'data': initialCartDetails
   }
      const postPurchaseOffer = await fetch(APP_URL + `/condition?action=thank_you&shop_domain=${myshopifyDomain}&customer=${customer_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dd)
      })
        .then((response) => response.json())
        .then((result) => {
          // console.log('call offer api', result);
          return fetch(APP_URL+`/offer?action=thank_you&shop_domain=${myshopifyDomain}&customer=${customer_id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result)
          })
            .then((response) => response.json())
            .then((getresp) => {
              // console.log('request to offer api', result);
              // console.log('getrespresponse', getresp);
              storage.update(getresp);
              // return { render: true };
            });
        });
      return { render: true };

  }
);


render("Checkout::PostPurchase::Render", () => <App />);

export function App() {
  
  const { storage, inputData, calculateChangeset, applyChangeset, done } =
    useExtensionInput();
  // console.log('storage',inputData )
  const [loading, setLoading] = useState(true);
  const [calculatedPurchase, setCalculatedPurchase] = useState();
  const [currencySymbol, setCurrencySymbol] = useState();

 
  const dataObject = storage.initialData;
  const offers = dataObject;

  const purchaseOption = offers;
  const myshopifyDomain= inputData && inputData.shop && inputData.shop.domain;
  const customer_id = inputData && inputData.initialPurchase && inputData.initialPurchase.customerId;
  let upsellAdd = {};
  
  // Define the changes that you want to make to the purchase, including the discount to the product.
  useEffect(() => {
    async function calculatePurchase() {
      // Call Shopify to calculate the new price of the purchase, if the above changes are applied.
      const result = await calculateChangeset({
        changes: purchaseOption.changes,
      });
      setCalculatedPurchase(result.calculatedPurchase);
      setLoading(false);
    }

    calculatePurchase();
  }, [purchaseOption]);

  useEffect(()=>{
    if(calculatedPurchase){
      const cs = calculatedPurchase?.totalOutstandingSet.presentmentMoney.currencyCode;
      if(cs){
        async function getCc() {
          const  token= await fetch(`${APP_URL}/get-currency?code=${cs}`, {
            method: 'GET',
            headers: {'Content-Type': 'application/json'},
            // body: JSON.stringify(),
          })
            .then((response) => response.json())
            .then((response) => {response, setCurrencySymbol(response)})
            
            .catch((e)=> console.log(e));
        }
        getCc();
      }
    }
  },[calculatedPurchase])
  
    // console.log('live- calculatedPurchase', calculatedPurchase)
   

   // Extract values from the calculated purchase.
  //  console.log('calculatedPurchase => ', calculatedPurchase);
    // const shipping = calculatedPurchase?.addedShippingLines[0]?.priceSet?.presentmentMoney?.amount? amount : 0;
    // const taxes = calculatedPurchase?.addedTaxLines[0]?.priceSet?.presentmentMoney?.amount? amount : 0;
    // const total = calculatedPurchase?.totalOutstandingSet.presentmentMoney.amount;    //  const currencyCode = calculatedPurchase?.totalOutstandingSet.presentmentMoney.currencyCode;
    // const discountedPrice = calculatedPurchase?.updatedLineItems[0].totalPriceSet.presentmentMoney.amount;
    // const originalPrice = calculatedPurchase?.updatedLineItems[0].priceSet.presentmentMoney.amount;
    const shipping = calculatedPurchase?.addedShippingLines[0]?.priceSet?.presentmentMoney?.amount;
    const taxes = calculatedPurchase?.addedTaxLines[0]?.priceSet?.presentmentMoney?.amount;
    const total = calculatedPurchase?.totalOutstandingSet.presentmentMoney.amount;
    const discountedPrice = calculatedPurchase?.updatedLineItems[0].totalPriceSet.presentmentMoney.amount;
    const originalPrice = calculatedPurchase?.updatedLineItems[0].priceSet.presentmentMoney.amount;
    const ccode = currencySymbol && currencySymbol.currency_symbol;
    // const total = (Number(taxes) + Number(shipping) + Number(totalAmount)).toFixed(2);
    // console.log('final => ', taxes, shipping, total);
    let discountValue = 0;
    // console.log('shipping => ', shipping);
    if('discount' in purchaseOption.changes[0]) {
      discountValue = purchaseOption.changes[0].discount.value;
    }
    
  //  setGetCurrencyCode(currencyCode);
  // if(ccode){

    // console.log('ccode', ccode)
  // }
  // console.log('currency_symbol', currencySymbol.currency_symbol)
  $_addUpsell= {};
  $_addUpsell['product_id']= purchaseOption.product_id;
  $_addUpsell['variant_id']= purchaseOption.variant_id;
  $_addUpsell['customer_id']= customer_id;
  $_addUpsell['myshopifyDomain']= myshopifyDomain;
  upsellAdd['data'] = [$_addUpsell];
  
  // console.log('live- post upsellAdd', upsellAdd)

 async function acceptOffer() {
   setLoading(true);

    // Make a request to your app server to sign the changeset with your app's API secret key.
      // console.log('==|', inputData.initialPurchase.referenceId, '----', purchaseOption.changes, '------',inputData.token);
      // console.log('inputData => ', JSON.stringify(inputData));
      // console.log('purchaseOption => ', JSON.stringify(purchaseOption));
      let response = await fetch(`${APP_URL}/sign-changeset`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          referenceId: inputData.initialPurchase.referenceId,
          changes: purchaseOption.changes,
          token: inputData.token,
        }),
      });

      const token = await response.json();
      // console.log('token token => ', token);

    //   token.then((response) => {
    //   console.log('main response => ', JSON.stringify(response));
    //   response.json()
    // })
    //  .then((response) => {
    //   console.log('response => ', JSON.stringify(response));
    //   response;
    //  })
    //  .catch((e)=> console.log(e));

   // Make a request to Shopify servers to apply the changeset.

   // Save Data 
   await applyChangeset(token).then((action)=> {
    // console.log('token => ', JSON.stringify(token));
    // console.log('action => ', JSON.stringify(action));
    // console.log('upsellAdd => ', JSON.stringify(upsellAdd));
   // Save Data 
    fetch(APP_URL+`/upsell-click?action=thank_you&shop_domain=${myshopifyDomain}&customer=${customer_id}`, {
      method: "POST",
      headers: {
          "Access-Control-Allow-Origin" :"*",
          "Content-Type": "application/json",
      },
      body: JSON.stringify(upsellAdd)
    }).then(response =>  response.json())
    .then(data=> {
      // console.log('thank you upsellAdd Upsell!', JSON.stringify(upsellAdd))
      // console.log('thank you Added Upsell!', JSON.stringify(data))
    }).catch((error) => console.error(error))
    // Save Data End
    });

    // Save Data 

   done();
  }

 function declineOffer() {
   setLoading(true);
   // Redirect to the thank-you page
   done();
 }
 return (
  
   <BlockStack spacing="loose">
     {/* <CalloutBanner>
       <BlockStack spacing="tight">
         <TextContainer>
           <Text size="medium" emphasized>
             It&#39;s not too late to add this to your order
           </Text>
         </TextContainer>
         <TextContainer>
           <Text size="medium">Add the {purchaseOption.productTitle} to your order </Text>
           <Text size="medium" emphasized>
           and {purchaseOption.changes[0].discount? purchaseOption.changes[0].discount.title : ''}
           </Text>
         </TextContainer>
       </BlockStack>
     </CalloutBanner> */}
    
     {purchaseOption.promotionTitle ? 
      <CalloutBanner>
      <BlockStack spacing="tight">
        <TextContainer>
          <Text size="medium">{purchaseOption.promotionTitle} </Text>
        </TextContainer>
      </BlockStack>
    </CalloutBanner>
     : <Text size="medium"> </Text>}
     <Layout
       media={[
         {viewportSize: 'small', sizes: [1, 0, 1], maxInlineSize: 0.9},
         {viewportSize: 'medium', sizes: [532, 0, 1], maxInlineSize: 420},
         {viewportSize: 'large', sizes: [560, 38, 340]},
       ]}
     >
       <Image description="product photo" source={purchaseOption.productImageURL} />
       <BlockStack />
       <BlockStack>
         <Heading>{purchaseOption.productTitle}</Heading>
         <Text>{purchaseOption.variantTitle ? purchaseOption.variantTitle == 'Default Title' ? "" : purchaseOption.variantTitle : ''}</Text>
         <PriceHeader
          //  discountedPrice={discountedPrice}
           discountedPrice={purchaseOption.changes[0].discount? discountedPrice : ''}
           originalPrice={originalPrice}
           loading={!calculatedPurchase}
           discountedIs={purchaseOption.changes[0].discount ? 'discount' : 'deletion'}
           symbol= {ccode && ccode}
           discountValue = {discountValue}
         />
         <ProductDescription textLines={purchaseOption.productDescription} />
         <BlockStack spacing="tight">
           <Separator />
           <MoneyLine
             label="Subtotal"
             amount={discountedPrice}
             loading={!calculatedPurchase}
             symbol= {ccode && ccode}
             discountValue = {discountValue}
           />
           <MoneyLine
             label="Shipping"
             amount={shipping}
             loading={!calculatedPurchase}
             symbol= {ccode && ccode}
           />
           <MoneyLine
             label="Taxes"
             amount={taxes}
             loading={!calculatedPurchase}
             symbol= {ccode && ccode}
           />
           <Separator />
           <MoneySummary
             label="Total"
             amount={total}
             loading={!calculatedPurchase}
             symbol= {ccode && ccode}
           />
         </BlockStack>
         <BlockStack>
           <Button onPress={acceptOffer} submit loading={loading}>
             Pay now · {formatCurrency(total, ccode)}
           </Button>
           <Button onPress={declineOffer} subdued loading={loading}>
             Decline this offer
           </Button>
         </BlockStack>
       </BlockStack>
     </Layout>
   </BlockStack>
 );
}

function PriceHeader({discountedPrice, originalPrice, loading, discountedIs, symbol, discountValue}) {
  // console.log('discountValue => ', discountValue);
 return (
   <TextContainer alignment="leading" spacing="loose">
    {discountedIs === 'discount' ? (
      <Text role="deletion" size="large">
      {!loading && formatCurrency(originalPrice, symbol)}
    </Text>
    ) : (
      <Text  size="large">
      {!loading && formatCurrency(originalPrice, symbol)}
    </Text>
    )}
     {/* <Text role="deletion" size="large">
       {!loading && formatCurrency(originalPrice)}
     </Text> */}
     <Text emphasized size="large" appearance="critical">
       {' '}
          {discountValue == 100 ? 'Free' : !loading && formatCurrency(discountedPrice, symbol)}
     </Text>
   </TextContainer>
 );
}

function ProductDescription({textLines}) {
 return (
   <BlockStack spacing="xtight">
     {textLines.map((text, index) => (
       <TextBlock key={index} subdued>
         {text}
       </TextBlock>
     ))}
   </BlockStack>
 );
}

function MoneyLine({label, amount, symbol, loading = false, discountValue = 0}) {
  // console.log('amount s => ', amount);
 return (
   <Tiles>
     <TextBlock size="small">{label}</TextBlock>
     <TextContainer alignment="trailing">
       <TextBlock emphasized size="small">
       {discountValue == 100 ? 'Free' : amount ? loading ? '-' : formatCurrency(amount, symbol) : 'Free'}
         {/* {loading ? '-' : formatCurrency(amount)} */}
       </TextBlock>
     </TextContainer>
   </Tiles>
 );
}

function MoneySummary({label, amount, symbol}) {
 return (
   <Tiles>
     <TextBlock size="medium" emphasized>
       {label}
     </TextBlock>
     <TextContainer alignment="trailing">
       <TextBlock emphasized size="medium">
         {formatCurrency(amount,symbol)}
       </TextBlock>
     </TextContainer>
   </Tiles>
 );
}

function formatCurrency(amount, ccode) {
  // console.log('ccodeccodeccode', ccode)
 if (!amount || parseInt(amount, 10) === 0) {
   return 'Free';
 }
 if(ccode && ccode){
   return `${ccode}${amount}`;
 }else{
  setTimeout(() => {
    return `$${amount}`;
  }, 1000);
  // return `$${amount}`;
 }
 
}

// function cc(ccode){
//   if(ccode){
//     return console.log('cc', ccode)
//   }
// }