ALTER TABLE "Payment"
  ADD COLUMN "environment" TEXT,
  ADD COLUMN "transferContent" TEXT,
  ADD COLUMN "bankAccountId" TEXT,
  ADD COLUMN "checkoutData" JSONB,
  ADD COLUMN "providerTransactionId" TEXT,
  ADD COLUMN "providerWebhookId" TEXT;
CREATE UNIQUE INDEX "Payment_transferContent_key" ON "Payment"("transferContent");
CREATE UNIQUE INDEX "Payment_providerTransactionId_key" ON "Payment"("providerTransactionId");
CREATE UNIQUE INDEX "Payment_providerWebhookId_key" ON "Payment"("providerWebhookId");

-- Gateway captures cannot be matched to an independently simulated v2 transfer.
-- Preserve every existing obligation and completed refund; stop unproven retries.
UPDATE "Refund" AS r
SET "status" = 'NEEDS_REVIEW', "lastError" = 'legacy_gateway_requires_review',
    "leaseToken" = NULL, "leaseUntil" = NULL
FROM "Payment" AS p
WHERE r."paymentId" = p."id" AND p."method" = 'SEPAY_BANK_TRANSFER'
  AND r."status" = 'PENDING';
