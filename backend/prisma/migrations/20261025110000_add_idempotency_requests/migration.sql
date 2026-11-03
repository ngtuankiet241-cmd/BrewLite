CREATE TABLE "IdempotencyRequest" (
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRequest_pkey" PRIMARY KEY ("userId", "operation", "key")
);

ALTER TABLE "IdempotencyRequest" ADD CONSTRAINT "IdempotencyRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
