# BrewLite API contract and coordination notes

This document separates API behavior verified in the repository from decisions
the team still needs to make. Do not treat a pending item as an agreed contract.

## Confirmed: product menu

| Item | Contract |
|---|---|
| Method and path | `GET /products` |
| Local base URL | `http://localhost:3001` |
| Success response | HTTP `200`; JSON array of products |
| Data source | In-memory sample data |
| CORS | Enabled by the NestJS application |

Each product currently has this shape:

```json
{
  "id": "coffee-milk",
  "name": "Cà phê sữa",
  "price": 35000,
  "imageUrl": "https://example.com/drink.jpg"
}
```

`price` is an integer amount in VND. The backend product type does not currently
include `category`, `stock`, or `description`; the frontend supplies defaults
for those fields. The current sample menu contains 10 products.

## Confirmed: order creation

| Item | Contract |
|---|---|
| Method and path | `POST /orders` |
| Success response | HTTP `201`; created order |
| Authentication | Not required in this task; JWT integration remains separate |
| Persistence | In-memory for this task; orders are lost when the backend restarts |
| Status | New orders start as `PENDING` |
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

## Decisions still needed

| Topic | Current status | Follow-up |
|---|---|---|
| Product category and description | Not returned by `GET /products`; frontend infers these values from the name, which can misclassify drinks such as soda or matcha. | Team agrees whether these fields belong in the API response, then updates the frontend/API consistently. |
| Persistent order storage | Orders are currently in memory and disappear on backend restart. | Add the agreed database and migrations in a later task. |
| Authentication on order creation | Not required for task 6. | Confirm user association and JWT guard when integrating the authentication task. |
| Payment and order-state transitions | A new order is created only as `PENDING`. | Payment outcomes and later transitions are implemented in their respective tasks. |

## Local verification

Start the backend and frontend using the instructions in the root
[README](../README.md), then verify:

1. `GET http://localhost:3001/products` returns HTTP 200 and a JSON array.
2. Each product has `id`, `name`, `price`, and `imageUrl`.
3. `POST /orders` rejects an empty cart, invalid product/option IDs, and invalid
   quantities; valid requests return an order in `PENDING`.
4. The frontend menu displays the API products and offers a retry if loading
   fails.
5. Confirm category, stock, and description behavior with the team before
   calling those fields part of the backend contract.
