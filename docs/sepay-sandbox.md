# SePay Sandbox setup

The payment flow uses **SePay Payment Gateway Sandbox** (`sepay-pg-node`), with
merchant credentials from **Cổng thanh toán**, rather than the bank transaction
webhook integration. Sandbox payments are simulated.

1. Copy the SePay variables in `.env.example` into `backend/.env` and replace
   the placeholders with your Sandbox merchant ID and merchant secret key.
2. From `backend/`, run `npx.cmd prisma migrate deploy` and
   `npx.cmd prisma generate`. Restart the backend after changing `.env`.
   The order-code migration preserves existing orders by using their IDs as
   invoice codes.
3. Keep the frontend on `http://localhost:3000` and the backend on
   `http://localhost:3001`. Log in before placing an order.
4. Run ngrok against the backend. Inside a Docker container, the upstream is
   `host.docker.internal:3001`. A running container alone does not confirm that
   the public tunnel can reach the backend.
5. In **Cổng thanh toán → Cấu hình → IPN**, set the URL to
   `https://YOUR-NGROK-DOMAIN/payments/ipn`. Select authentication type
   `SECRET_KEY` and use exactly the value of `SEPAY_IPN_SECRET_KEY` from
   `backend/.env`. This is the callback secret; `SEPAY_SECRET_KEY` signs checkout
   requests. Update the IPN URL whenever your ngrok domain changes.
6. Create an order, click the SePay Sandbox payment button, and complete a
   simulated payment. On the result page, click **Kiểm tra lại trạng thái** if
   the IPN has not arrived yet.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot open SePay; API returns `P2022` / HTTP 500 | Apply database migrations. `Order.orderCode`, `Payment.status`, and the order-item option columns must exist. Do not reset a populated database. |
| API returns 401 before checkout | Log in again and retry. |
| SePay shows "Yêu cầu không hợp lệ" | Recopy the Sandbox merchant ID and merchant secret from the integration page. A locally chosen callback secret is not a replacement for the merchant secret. The checkout signature must also follow the API field order. |
| The SePay Sandbox REST API returns 401 | The configured merchant ID and merchant secret were not accepted. Use the pair from the same Sandbox merchant and restart the backend after editing `.env`. |
| SePay completes payment but the order stays pending | Check the public IPN URL, ngrok upstream, `SECRET_KEY` authentication, and the callback secret. Successful IPNs return HTTP 200. |
| IPN returns 401 | Match `SEPAY_IPN_SECRET_KEY` in the SePay dashboard, then restart the backend after editing `.env`. |

Never confirm payment from the browser redirect alone. The backend validates the
IPN secret, invoice code, currency, and amount before marking an order paid.

Checkout retries must reuse the original `Idempotency-Key`. Both order creation
and payment initialization persist successful results in PostgreSQL; repeated
IPNs settle the order once. See [idempotency rules and tests](idempotency.md).

`SEPAY_SECRET_KEY` is the merchant secret supplied by SePay and signs checkout
requests. `SEPAY_IPN_SECRET_KEY` is the callback authentication value configured
in the IPN settings. Setting both variables to a value you invented does not
create a valid merchant credential.

Keep the checkout fields in the order defined by the
[checkout API](https://developer.sepay.vn/vi/cong-thanh-toan/API/don-hang/form-thanh-toan).
SDK v1.0.0 signs JavaScript object insertion order, so the backend supplies the
merchant field explicitly before signing. The frontend must preserve the returned
field order when building its form.

Official references: [Sandbox](https://developer.sepay.vn/vi/cong-thanh-toan/sandbox),
[Node.js SDK](https://developer.sepay.vn/vi/cong-thanh-toan/sdk/nodejs), and
[IPN configuration](https://developer.sepay.vn/vi/cong-thanh-toan/IPN).
