-- CreateTable
CREATE TABLE "products" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT,
    "show_upsell" BOOLEAN NOT NULL DEFAULT true,
    "is_condition" BOOLEAN,
    "upsell_on" VARCHAR(255),
    "upsell_daterange" VARCHAR(100),
    "product" VARCHAR(255),
    "shop_domain" VARCHAR(255),
    "product_id" TEXT,
    "variant_id" TEXT,
    "offer" INTEGER,
    "is_discount" INTEGER,
    "promotion_title" VARCHAR(255),
    "action" BOOLEAN NOT NULL DEFAULT true,
    "attribute" VARCHAR(100),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upsell_criteria" (
    "id" SERIAL NOT NULL,
    "upsell_id" INTEGER,
    "condition_type" VARCHAR(255),
    "condition_criteria" VARCHAR(255),
    "condition_value" VARCHAR(255),
    "and_or" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upsell_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upsell_history" (
    "id" SERIAL NOT NULL,
    "upsell_id" BIGINT,
    "customer_id" VARCHAR(255),
    "product_id" VARCHAR(255),
    "variant_id" VARCHAR(255),
    "shopdomain" VARCHAR(255),
    "action" TEXT NOT NULL DEFAULT '1',
    "attribute" VARCHAR(255),
    "type" VARCHAR(20),
    "date_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upsell_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" SERIAL NOT NULL,
    "condition_type_id" INTEGER NOT NULL,
    "condition_name" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_type" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condition_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" SERIAL NOT NULL,
    "variant_id" VARCHAR(255) NOT NULL,
    "shop" VARCHAR(255) NOT NULL,
    "discount_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" BIGSERIAL NOT NULL,
    "shop_domain" VARCHAR(255),
    "background_color" VARCHAR(255),
    "button_title" VARCHAR(255),
    "text_color" VARCHAR(255),
    "border_color" VARCHAR(20),
    "title_size" VARCHAR(20),
    "button_border" VARCHAR(20),
    "button_radious" VARCHAR(20),
    "created_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storedetails" (
    "id" SERIAL NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "accesstoken" VARCHAR(255),
    "storefront_token" VARCHAR(255),
    "is_plus" BOOLEAN,
    "name" VARCHAR(150),
    "email" VARCHAR(150),
    "time_zone" VARCHAR(150),
    "money_format" VARCHAR(150),
    "plan_display_name" VARCHAR(50),
    "plan_name" VARCHAR(50),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "storedetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_history" (
    "id" SERIAL NOT NULL,
    "shop" VARCHAR(255),
    "email" VARCHAR(255),
    "is_installed" BOOLEAN,
    "date_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_application_charge" (
    "id" BIGSERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "charge_id" VARCHAR(255),
    "name" VARCHAR(255),
    "price" VARCHAR(10),
    "response" TEXT,
    "is_approve" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_application_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER,
    "webhook_id" VARCHAR(255),
    "topic" VARCHAR(255),
    "address" VARCHAR(255),
    "response" TEXT,
    "created" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modified" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDPR" (
    "id" SERIAL NOT NULL,
    "topic" VARCHAR(25) NOT NULL,
    "response" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDPR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs_history" (
    "id" BIGSERIAL NOT NULL,
    "store" VARCHAR(200),
    "job" VARCHAR(100),
    "status" TEXT NOT NULL DEFAULT '0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency" (
    "id" SERIAL NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL,
    "currency_name" VARCHAR(50) NOT NULL,
    "currency_symbol" VARCHAR(50) NOT NULL,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("id")
);
