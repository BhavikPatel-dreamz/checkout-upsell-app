console.log("fdfsdfsdfdf");
import React, { useEffect, useMemo, useState } from "react";
import {
  render,
  Divider,
  Image,
  Banner,
  Heading,
  Button,
  InlineLayout,
  BlockStack,
  Text,
  SkeletonText,
  SkeletonImage,
  useCartLines,
  useApplyCartLinesChange,
  useExtensionApi,
  TextField,
  Link,
  View,
  useApplyDiscountCodeChange
} from "@shopify/checkout-ui-extensions-react";
import config from "./config";
import {Style} from '@shopify/checkout-ui-extensions-react';

// Set up the entry point for the extension
render("Checkout::Dynamic::Render", () => <App />);


// The function that will render the app
function App() {
 
  const api = useExtensionApi();
  const {sessionToken} = useExtensionApi();
  // Use `query` for fetching product data from the Storefront API, and use `i18n` to format
  // currencies, numbers, and translate strings
  const { query, i18n, shop, buyerIdentity } = useExtensionApi();
  // Get a reference to the function that will apply changes to the cart lines from the imported hook
  const applyCartLinesChange = useApplyCartLinesChange();
  const applyDiscountCodeChange= useApplyDiscountCodeChange();
  
  // Set up the states
  const [products, setProducts] = useState([]);
  const [upsellData, setUpsellData] = useState([]);
  const [cartDataForApi, setCartDataForApi] = useState([]);
  const [cartDataForApichecks, setCartDataForApichecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showError, setShowError] = useState(false);
  const [toggles, setToggles] = useState(true);
  const [offer, setOffer] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [storeConfig, setStoreConfig] = useState([]);
  const lines = useCartLines();

  const localURL= config.api_base_url;
  const gql_version= config.shopify_graphql_api_version;

  // Config
  // console.log('shop---', shop)
  // console.log('upsellDataupsellData', upsellData);
  const storeURL = shop.storefrontUrl.replace(/\/$/, "");
  let myshopifyDomain = shop && shop.myshopifyDomain;       /** Shop Domain */
  useEffect(()=>{
    storeConfigFunction();
  }, [])
  
  const storeConfigFunction = async () =>{
    // setLoading(true);
    const configresponse = await fetch(localURL+`/storeConfig?shop_domain=${myshopifyDomain}`, {
      method: "POST",
      headers: {
          "Access-Control-Allow-Origin" :"*",
          "Content-Type": "application/json",
      },
    }).then(response =>  response.json())
    .then(data=> {
      // console.log('data-------------------', data)
      setStoreConfig(data)
    }).catch((error) => console.error(error));
  }
  
  const TOKEN = storeConfig.shopify_token;
  // console.log('live- token', TOKEN)
  const graphQLURL= storeURL+"/admin/api/"+gql_version+"/graphql.json";
  // end

  // Set up variables
  let customer_id= buyerIdentity && buyerIdentity.customer && buyerIdentity.customer.current && buyerIdentity.customer.current.id ? buyerIdentity.customer.current.id : null;        /** Customer Id */

  let renderPrice, imageUrl, exArray= {}, upsellAdd = {}, shopify_variant_url='gid://shopify/ProductVariant/';
  // end

  
  // console.log('live- customer_id', customer_id)
  // console.log('live- lines', lines)
  // console.log('live- add to cart data ', cartDataForApi)

  /** if received data from API */
  useEffect(() => {
    if(toggles){
      if (upsellData && upsellData.length > 0) {
        const getProductById = async () => {
          const productRequests = upsellData.map((item) => {
            const vId = item.variant_id;
            // console.log('upsell-item', item)
            const query = `
              query {
                productVariant(id: "${shopify_variant_url}${vId}") {
                  id
                  title
                  price
                  inventoryPolicy
                  inventoryQuantity
                  product {
                    id
                    title
                    handle
                    images(first: 1) {
                      nodes {
                        url
                      }
                    }
                  }
                }
              }
            `;
            const requestBody = { query };
            return fetch(graphQLURL, {
              method: 'POST',
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": TOKEN,
              },
              body: JSON.stringify(requestBody)
            })
              .then(response => response.json())
              .then(data => ({
                product_id:  data&&data.data && data.data.productVariant && data.data.productVariant.id ? data.data.productVariant.id : '',
                quantity: data && data.data && data.data.productVariant && data.data.productVariant.inventoryQuantity? data.data.productVariant.inventoryQuantity : '',
                policy: data && data.data && data.data.productVariant && data.data.productVariant.inventoryPolicy? data.data.productVariant.inventoryPolicy : '',
                totalAmount: data && data.data && data.data.productVariant &&  data.data.productVariant.price ? data.data.productVariant.price : '',
                // currencyCode: null,
                // customer: null,
                product: data && data.data && data.data.productVariant && data.data.productVariant.product ? data.data.productVariant.product: ''
              }));
          });
    
          Promise.all(productRequests)
            .then(newProducts => {
              const existingProductIds = products.map(product => product.product_id);
              const filteredProducts = newProducts.filter(product => !existingProductIds.includes(product.product_id));
              setProducts([...products, ...filteredProducts]);
            });
        };
    
        getProductById();
      }
    }
  }, [upsellData]);
  
  // console.log('live- upsellData from api', upsellData)
  // console.log('live- products', products)
  /** Get the IDs of all product in the cart */
  useEffect(() => {
    if(lines && lines.length > 0){
      const cartLineProductVariantIds = lines.map((item) => {
        let item_product_id = item && item.merchandise && item.merchandise.product && item.merchandise.product.id;
        let item_variant_id = item && item.merchandise && item.merchandise.id;
        let item_quantity = item && item.quantity;
        let item_totalAmount= item && item.cost && item.cost.totalAmount && item.cost.totalAmount.amount;
        let item_currencyCode= item && item.cost && item.cost.totalAmount && item.cost.totalAmount.currencyCode;
    
        const productVariants1 = {
          product_id: item_product_id,
          variant_id: item_variant_id,
          quantity: item_quantity,
          totalAmount: item_totalAmount.toFixed(2),
          currencyCode: item_currencyCode,
          customer: customer_id,
        };
        const { product_id, ...changes } = productVariants1; 
        const existingData = cartDataForApi.find((event) => event.product_id === product_id);
        if (existingData) {
          Object.keys(changes).map((keyName) => {
            existingData[keyName] = changes[keyName];
          });
        } else {
          setCartDataForApi([...cartDataForApi, productVariants1])
        }
      });
        
      // Send cart details to API
      upsell();
      
    }
  }, [lines]);
  

  // Calling API
  exArray['data']= cartDataForApi;
  const upsell = async () =>{
    setLoading(true);
    const response = await fetch(localURL+`/condition?action=checkout&shop_domain=${myshopifyDomain}&customer=${customer_id}`, {
      method: "POST",
      headers: {
          "Access-Control-Allow-Origin" :"*",
          "Content-Type": "application/json",
      },
      body: JSON.stringify(exArray)
    }).then(response =>  response.json())
    .then(data=> {
      console.log('condition api response', data)
      setUpsellData(data.products)
      // setToggles(false)
    }).catch((error) => console.error(error))
    .finally(() => setLoading(false));
  }

  // Add product to cart
  const productAdd = async (variantid, product_id, vPolicy, vQuantity, attribute, upsellId) =>{
    // console.log('variantid', variantid, product_id, customer_id, myshopifyDomain)
    $_addUpsell= {};
    $_addUpsell['product_id']= product_id;
    $_addUpsell['variant_id']= variantid;
    $_addUpsell['customer_id']= customer_id;
    $_addUpsell['myshopifyDomain']= myshopifyDomain;
    $_addUpsell['attributes']= attribute;
    $_addUpsell['upsell_id']= upsellId;
    upsellAdd['data'] = [$_addUpsell];
    
    // if((vPolicy === "CONTINUE") || (vQuantity > 0)){
      // console.log('live- upsellAdd', upsellAdd)
      setAdding(variantid);
      const result = await applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: variantid,
        quantity: 1,
        attributes: attribute,
      });
      setAdding(false);
      if (result.type === "error") {
        setShowError(true);
      }else{
        
      const $pd =  products.filter((product) => {
        // console.log('product-----', product)
        // console.log('variantid------', variantid)
        return product.product_id !== variantid;
      });
     
      // console.log('pd----', $pd)
      setProducts($pd);
      // Save Data 
      const upsellClick = await fetch(localURL+`/upsell-click?action=checkout&shop_domain=${myshopifyDomain}&customer=${customer_id}`, {
        method: "POST",
        headers: {
            "Access-Control-Allow-Origin" :"*",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(upsellAdd)
      }).then(response =>  response.json())
      .then(data=> {
        // console.log('upsellAdd Upsell!', upsellAdd)
        // console.log('Added Upsell!', data)
      }).catch((error) => console.error(error))
      // Save Data End
      }
    // }else{
    //   setShowError(true);
    // }
  }
 
  // If an offer is added and an error occurs, then show some error feedback using a banner
  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  // Show a loading UI if you're waiting for product variant data
  // Use Skeleton components to keep placement from shifting when content loads
  if (loading) {
    return (
      <BlockStack spacing="loose">
        {/* <Divider /> */}
        <Heading level={2}>You might also like</Heading>
        <BlockStack spacing="loose">
          <InlineLayout
            spacing="base"
            columns={[64, "fill", "auto"]}
            blockAlignment="center"
          >
            <SkeletonImage aspectRatio={1} />
            <BlockStack spacing="none">
              <SkeletonText inlineSize="large" />
              <SkeletonText inlineSize="small" />
            </BlockStack>
            <Button kind="secondary" disabled={true}>
              Add
            </Button>
          </InlineLayout>
        </BlockStack>
      </BlockStack>
    );
  }
  // If product variants can't be loaded, then show nothing

  // Get the IDs of all product variants in the cart
  // const cartLineProductVariantIds = lines.map((item) => {
  //   let item_product_id = item && item.merchandise && item.merchandise.product && item.merchandise.product.id;
  //   let item_quantity = item && item.quantity;
  //   let item_totalAmount= item && item.cost && item.cost.totalAmount && item.cost.totalAmount.amount;
  //   let item_currencyCode= item && item.cost && item.cost.totalAmount && item.cost.totalAmount.currencyCode;

  //   const productVariants1 = {
  //     product_id: item_product_id,
  //     quantity: item_quantity,
  //     totalAmount: item_totalAmount.toFixed(2),
  //     currencyCode: item_currencyCode,
  //     customer:customer_id
  //   };
    
  //   const { product_id, ...changes } = productVariants1; 
  //   const existingData = cartDataForApi.find((event) => event.product_id === product_id);
  //   if (existingData) {
  //     Object.keys(changes).map((keyName) => {
  //       existingData[keyName] = changes[keyName];
  //     });
  //   } else {
  //     setCartDataForApi([...cartDataForApi, productVariants1])
  //   }
  // });
  

 
  // Render Data
  return (
    <>
   
    <BlockStack spacing="loose">
      {/* <Divider /> */}
      {products && products.length > 0 ? (
        <Heading level={2}>You might also like: Test</Heading> 
      ) : ''}
      
      {products &&
        Object.keys(products).slice(currentIndex, currentIndex + 3).map((item, index) => {
          // console.log('products[item]--', products[item])
          // {JSON.stringify(item) }
        const v_id = products[item].product_id;
        const v_quantity = products[item].quantity;
        const v_policy = products[item].policy;
        const p_id = products[item].product.id;
        const p_title = products[item].product.title;
        const image = products[item] && products[item].product && products[item].product.images && products[item].product.images.nodes[0] && products[item].product.images.nodes[0].url;
        // Display the item based on the current index
        renderPrice = i18n.formatCurrency(products[item].totalAmount);
        // Use the first product image or a placeholder if the product has no images
        imageUrl =  image ? image : "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081";

        const upselldataByid = upsellData && upsellData.find((pi)=>shopify_variant_url+pi.variant_id == v_id);
        // console.log('upselldataByid', upselldataByid)
        // console.log('upselldataByid', upselldataByid)
        let upsell_title= upselldataByid && upselldataByid.promotional_title ? upselldataByid.promotional_title : "";
        const attribute= upselldataByid && upselldataByid.attributes ? upselldataByid.attributes : null;
        const upsellId= upselldataByid && upselldataByid.upsell_id ? upselldataByid.upsell_id : null;

        const DiscountPrice = upselldataByid && 
        upselldataByid.changes ? upselldataByid.changes && upselldataByid.changes.discount ?upselldataByid.changes.discount && upselldataByid.changes.discount.value ? upselldataByid.changes.discount.value: '0' : '0' : "0";
        let priceAfterDiscount;
        if(DiscountPrice > 0){
          if(DiscountPrice == 100){
            priceAfterDiscount= 'Free';
          }else{
            priceAfterDiscount= i18n.formatCurrency((products[item].totalAmount*DiscountPrice)/100);
            priceAfterDiscount= i18n.formatCurrency(products[item].totalAmount - ((products[item].totalAmount*DiscountPrice)/100));
          }
          // i18n.formatCurrency(priceAfterDiscount);
        }
        // console.log('asdsaasdsadasd', products[item].totalAmount, DiscountPrice )
        if(products[item] && products[item].product_id){
         
        return(
         
           <BlockStack spacing="loose" key={index}>
            <InlineLayout
              spacing="base"
              columns={[64, "fill", "auto"]}
              blockAlignment="center"
            >
            <Image
              border="base"
              borderWidth="base"
              borderRadius="loose"
              source={imageUrl}
              description={p_title}
              aspectRatio={1}
            />
            <BlockStack spacing="none">
              <Heading level={3}>
                {upsell_title}
              </Heading>
              <Text size="medium" emphasis="strong">
                {p_title}
              </Text>
              {priceAfterDiscount ? 
              // <Text appearance="subdued" accessibilityRole="deletion">{renderPrice}</Text>
              // <Text appearance="subdued">{priceAfterDiscount}</Text>
              <InlineLayout columns={['15%', 'fill']}>
              <View border="none">
                <Text appearance="subdued" accessibilityRole="deletion">{renderPrice}</Text>
              </View>
              <View border="none">
              <Text appearance="subdued">{priceAfterDiscount}</Text>
              </View>
            </InlineLayout>
              : 
              <Text appearance="subdued" >{renderPrice}</Text>
              }
                      
            </BlockStack>
        
            <Button
              kind='secondary'
              loading={adding == v_id ? true : false}
              accessibilityLabel={`Add ${p_title} to cart`}
              onPress={()=> {
                setToggles(false);
                productAdd(v_id, p_id, v_policy, v_quantity, attribute, upsellId)
              }
              }
            >
              Add
            </Button>
            
          </InlineLayout>
    
        </BlockStack>
       
        )
      }
      // }
      })}
      {showError && (
        <Banner status="critical">
          There was an issue adding this product. Please try again.
        </Banner>
      )}
    </BlockStack>
    </>
  );
}
