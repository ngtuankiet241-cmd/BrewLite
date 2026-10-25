# Loyalty points

## Rules

- Each completed 1,000 VND of the amount actually paid earns 1 point. Fractions
  are rounded down per order: a payment of 24,800 VND earns 24 points.
- Each redeemed point discounts the next order by 10 VND.
- Apply the promotion discount first, then the point discount. A 25,000 VND order
  with a 10% promotion and 20 points has a final amount of 22,300 VND.
- Points cannot exceed the customer's available balance or the remaining order
  amount. The backend recalculates the discount; clients only submit the number
  of points they want to use.
- Points are reserved by deducting them when an order is created. Failed order
  creation rolls back the deduction, stock changes and promotion consumption.
  Payment failure leaves the reservation on the same order so payment can be
  retried. Transitioning the order to `CANCELLED` returns redeemed points once.
- An order fully covered by points and/or promotions is immediately `PAID`, has
  a successful zero-amount local payment, and earns 0 points. No external checkout
  is needed for that order.
- Points are awarded when an order transitions to `PAID`, in the same database
  transaction as the payment/order update. Duplicate and concurrent notifications
  cannot award points twice or move a preparing order back to `PAID`.
- Existing paid orders are not retroactively credited by the migration. The new
  fields default to zero. Previously awarded points are not automatically reversed
  on cancellation: cash refund and reward reversal policies are separate work.

The policy is defined in `backend/src/loyalty/loyalty.ts`. The frontend reads the
policy from the API rather than computing the customer's authoritative balance.

## Customer interface

The cart shows the current balance, allows entering a point quantity or choosing
**Dùng tối đa**, and previews the point discount and expected earned points.
The account page retrieves the current balance from the database on entry and
when the browser window regains focus. Payment results and order history show
the points awarded for the order.

## API and storage

- `GET /auth/me`: authenticated profile with `loyaltyPoints` and
  `loyaltyPolicy: { spendPerPoint: 1000, pointValue: 10 }`.
- `POST /orders`: accepts optional integer `pointsToRedeem` (zero or greater).
  The response includes `pointsRedeemed`, `pointsDiscount`, `pointsEarned`, and
  the final `totalAmount`. Its status can be `PENDING` or `PAID` for a free order.
- `GET /orders/history` and `GET /payments/status`: include the order's point
  information. History also indicates whether redeemed points were refunded.
- `User.loyaltyPoints`: available balance.
- `Order.pointsRedeemed`, `pointsDiscount`, `pointsEarned`, `pointsAwardedAt`,
  `pointsRefundedAt`: per-order records and guards against duplicate processing.

Apply the additive migration and generate the client from `backend/`:

```powershell
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

## Verification

```powershell
npm.cmd --prefix backend test
npm.cmd --prefix backend run test:e2e
```

The loyalty e2e tests use uniquely identified fixtures in PostgreSQL and local
HTTP requests with fake payment credentials. They never call SePay. Coverage
includes earning after payment, duplicate/concurrent callbacks, simultaneous
redemption, rollback, promotion stacking, full redemption, cancellation, and
fresh authenticated balances.
