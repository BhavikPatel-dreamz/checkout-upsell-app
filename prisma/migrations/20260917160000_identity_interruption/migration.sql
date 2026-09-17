-- CreateTable
CREATE TABLE "IdentityInterruption" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sessionId" TEXT,
    "lastShownAt" TIMESTAMP(3),
    "sessionShownAt" TIMESTAMP(3),
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shownInWindow" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityInterruption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityInterruption_shop_identityKey_channel_key" ON "IdentityInterruption"("shop", "identityKey", "channel");

-- CreateIndex
CREATE INDEX "IdentityInterruption_shop_identityKey_idx" ON "IdentityInterruption"("shop", "identityKey");
