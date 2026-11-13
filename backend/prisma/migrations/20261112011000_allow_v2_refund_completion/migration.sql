ALTER TABLE "Refund" DROP CONSTRAINT "Refund_completion_valid";
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_completion_valid" CHECK (
  ("status" <> 'SUCCEEDED' AND "completedAt" IS NULL) OR
  ("status" = 'SUCCEEDED' AND "completedAt" IS NOT NULL AND
    (("method" = 'LOCAL' AND "amount" = 0) OR
     ("method" IN ('SEPAY', 'SEPAY_V2') AND "providerRefundId" IS NOT NULL AND "transactionId" IS NOT NULL)))
);
