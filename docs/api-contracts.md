# BrewLite API contract and coordination notes

This document separates API behavior verified in the repository from decisions
the team still needs to make. Do not treat a pending item as an agreed contract.

## Confirmed: product menu

| Item | Contract |
|---|---|
| Method and path | `GET /products` |
| Local base URL | `http://localhost:3001` |
| Success response | HTTP `200`; JSON array of products |
| Data source | Product records in the database, queried through Prisma |
| CORS | Enabled by the NestJS application |

Each product has this shape:

```json
{
  "id": "coffee-milk",
  "name": "Cà phê sữa",
  "price": 35000,
  "imageUrl": "https://example.com/drink.jpg",
  "stock": 62,
  "stockBySize": { "S": 62, "M": 50, "L": 41 }
}
```

`price` is an integer amount in VND. The database stores ingredient quantities
in base units (`g`, `ml`, or `unit`), while `stockBySize` reports the maximum
number of drinks currently possible for each size based on its recipe.
`stock` is a compatibility/display value equal to the largest value in
`stockBySize`; order validation always uses the selected size's recipe and
current ingredient inventory. These counts do not account for optional toppings.
The backend product type does not currently include `category` or `description`;
the frontend supplies defaults for those fields. The seed menu contains 10 products.

Seed recipes and initial ingredient quantities are illustrative placeholders,
not agreed shop recipes or real stock. The team must replace them with its
approved ingredient list, quantities per size, topping quantities, and opening
stock before relying on inventory figures.

## Confirmed: order creation

| Item | Contract |
|---|---|
| Method and path | `POST /orders` |
| Success response | HTTP `201`; created order |
| Authentication | Required; Bearer JWT associates the order with the signed-in user |
| Idempotency | Send `Idempotency-Key` and reuse it with the same body when retrying; replay returns the original result, changed content returns `409` |
| Persistence | PostgreSQL through Prisma; the order, its items, inventory deduction and promotion usage are committed in one transaction |
| Concurrent stock updates | Internal `stockVersion` check and increment; retry the whole transaction up to 5 attempts on a version conflict |
| Status | New orders start as `PENDING`, or `PAID` when discounts/points cover the total |
| Price handling | Backend looks up product prices and validates size/topping IDs; client prices are not accepted |

Request body:

```json
{
  "items": [
    {
      "productId": "coffee-milk",
      "quantity": 2,
      "sizeId": "M",
      "toppingIds": ["cheese"]
    }
  ]
}
```

`items` must contain at least one item. Quantity must be a positive integer.
Valid sizes are `S`, `M`, and `L`; valid toppings are `white_pearl`,
`aloe_vera`, and `cheese`. Product and option IDs are validated by the backend.

The response includes `orderCode`, `status`, a server-priced item snapshot,
`totalAmount`, and `createdAt`. The example request above creates two configured
cà phê sữa items at 50,000 VND each, for a total of 100,000 VND.

`orderCode` is stored as the `Order.id` primary key (and is the value a future
payment will use as `Payment.orderId`). A new order has no payment record yet.
`userId` comes from the JWT and is not accepted from the request body.
The database retains support for legacy orders with a null `userId`.

An optional `promotionCode` applies a validated promotion. Discounted responses
also include `subtotalAmount`, `discountAmount`, and the normalized `promotionCode`.
The database stores subtotal, discount, and payable total even without a code.
Each new `OrderItem.snapshot` preserves the product name, base price, quantity,
size, toppings, unit price, line total, and the ingredient quantities consumed
at checkout, so later catalog or recipe changes do not alter historical order
details. Legacy rows retain their original data and may have null
subtotal/snapshot fields.

Ingredient stock is deducted when a `PENDING` order is created. The backend
calculates each product's ingredient usage from the selected size and adds the
selected topping recipes; repeated usage of the same ingredient is combined
across the entire order. If an ingredient is missing or insufficient,
`POST /orders` returns HTTP `400` with a message identifying it. The cart is
retained on failure; after success, the frontend reloads the menu to display
updated estimated availability.

Ingredient inventory is read and deducted within the same transaction using
optimistic locking. Updates must match the ingredient's stock version and have
sufficient quantity; the version increments with each successful deduction.
A stale version rolls back the whole transaction before retrying. After five
conflicting attempts, the API returns HTTP `409` and asks the client to retry. See
[concurrent inventory and tests](concurrent-inventory.md) for the database
guarantees and test commands.

Creating the order and its items, deducting ingredient stock, and consuming a
promotion share one transaction. A failure rolls back all writes, including
inventory deductions and the promotion usage counter. Whole-VND line totals
and subtotals must fit the existing `DECIMAL(12,2)` database columns
(at most 9,999,999,999 VND); quantity must fit a PostgreSQL `INTEGER`.

See [idempotency](idempotency.md) for payment API rules,
key persistence, conflict responses and tests against PostgreSQL.

## Decisions still needed

| Topic | Current status | Follow-up |
|---|---|---|
| Product category and description | Not returned by `GET /products`; frontend infers these values from the name, which can misclassify drinks such as soda or matcha. | Team agrees whether these fields belong in the API response, then updates the frontend/API consistently. |

## Local verification

Start the backend and frontend using the instructions in the root
[README](../README.md), then verify:

1. `GET http://localhost:3001/products` returns HTTP 200 and a JSON array.
2. Each product has `id`, `name`, `price`, `imageUrl`, `stock`, and `stockBySize`.
3. `POST /orders` rejects an empty cart, invalid product/option IDs, and invalid
   quantities; valid requests return an order in `PENDING`.
4. An order deducts the correct ingredient amounts for its selected sizes and
   toppings; insufficient stock leaves the order and all inventory unchanged.
5. The frontend menu displays estimated availability by size and offers a retry
   if loading fails.
6. Confirm category and description behavior with the team before
   calling those fields part of the backend contract.
