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

## Decisions still needed

| Topic | Current status | Follow-up |
|---|---|---|
| Product category and description | Not returned by `GET /products`; frontend infers these values from the name, which can misclassify drinks such as soda or matcha. | Triệu and Luân agree whether these fields belong in the API response, then update the frontend/API consistently. |
| Product count in e2e test | API currently returns 10 products; the e2e test still expects 4. | Luân updates the test to match the intended sample data and reruns it. |
| `POST /orders` request/response | Not verified or agreed in the current implementation. | Luân and Lượng agree on cart line fields, size/toppings, quantity, price handling, and response before implementing the integration. |
| Authentication on order creation | Not verified or agreed for the current order endpoint. | Luân and Hùng confirm how the authenticated user is associated with a new order when the order flow is implemented. |

For each decision, record the final field names and an example request/response
here after the responsible members confirm them. Until then, keep dependent
work behind a clearly documented interface or use temporary local fixtures;
do not silently treat guessed fields as final.

## Local verification

Start the backend and frontend using the instructions in the root
[README](../README.md), then verify:

1. `GET http://localhost:3001/products` returns HTTP 200 and a JSON array.
2. Each item has `id`, `name`, `price`, and `imageUrl`.
3. The frontend menu displays the API products and offers a retry if loading
   fails.
4. Confirm category, stock, and description behavior with the team before
   calling those fields part of the backend contract.
