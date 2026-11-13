ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loyaltyDebt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_loyaltyDebt_nonnegative" CHECK ("loyaltyDebt" >= 0);
