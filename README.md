# BrewLite

BrewLite is a cashless drink-ordering application built for the Software
Engineering course project. The MVP is being developed in small increments:
browsing drinks, choosing options, managing a cart, placing an order, simulating
payment, and viewing confirmation.

## Project structure

- `frontend/` - Next.js and TypeScript web application
- `backend/` - NestJS and TypeScript REST API
- `docs/api-contracts.md` - confirmed API details and decisions still needed
- `BrewLite-Tien-do.xlsx` - team backlog and progress tracker

## Requirements

- Node.js LTS and npm
- PostgreSQL, with a database configured in `backend/.env`
- Git
- Windows PowerShell users may need `npm.cmd` instead of `npm`

Install dependencies once from the repository root:

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

Configure `DATABASE_URL` in `backend/.env`, then apply migrations and generate
the Prisma client from the backend directory:

```powershell
cd backend
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npx.cmd prisma db seed
cd ..
```

## Run locally

Run the backend and frontend in separate PowerShell terminals from the
repository root.

Terminal 1 - backend:

```powershell
npm.cmd --prefix backend run start:dev
```

The API listens at `http://localhost:3001`.

Terminal 2 - frontend:

```powershell
npm.cmd --prefix frontend run dev
```

Open `http://localhost:3000` in a browser. The menu requests products from
`GET http://localhost:3001/products`; keep the backend running while using the
frontend.

### Run with Docker Compose

Docker Desktop is required. From the repository root, copy `.env.example` to
`.env` and set `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, and
`SEPAY_IPN_SECRET_KEY` to your SePay Sandbox configuration. The backend needs
these settings to start; the example values are placeholders and cannot
complete a payment. Use a unique `JWT_SECRET` as well. See the
[SePay setup guide](docs/sepay-sandbox.md) for credentials and callback setup.

Start PostgreSQL, the backend, and the frontend from the repository root:

```powershell
Copy-Item .env.example .env
# Edit .env before starting.
docker compose up --build
```

Open `http://localhost:3000` after the services start. Compose applies database
migrations and seeds the sample data when the backend starts. The database is
available to the backend within the Compose network, but is not exposed on the
host, so it does not conflict with a locally installed PostgreSQL on port 5432.

`NEXT_PUBLIC_API_URL` is the backend URL **as seen by the browser**, not the
Docker service name. It defaults to `http://localhost:3001` and is embedded in
the frontend image at build time. If you change it, rebuild with
`docker compose up --build`. For SePay redirects, set `FRONTEND_URL` to the URL
the browser can reach. A public IPN URL and Sandbox configuration are still
needed for SePay to confirm payments.

Stop the services with `Ctrl+C`, or run `docker compose down` in another
terminal. The database volume is retained.

## Current API

`GET /products` returns products from the database. A product contains `id`,
`name`, `price` (integer VND), `imageUrl`, `category`, `stock` (maximum available quantity
across sizes), and `stockBySize` (estimated number of drinks possible per size).
Inventory is tracked by ingredient in base units (`g`, `ml`, or `unit`) and
converted to drink availability using size and topping recipes. Seed stock and
recipes are illustrative; replace them with the team's agreed recipes and
opening inventory before relying on them. `GET /products/options` returns sizes,
toppings and categories from PostgreSQL; the API does not yet return product
descriptions. See [the API contract and open decisions](docs/api-contracts.md).

The backend enables CORS for local frontend requests. `POST /orders` requires
login and creates a validated order in PostgreSQL, including item and price
snapshots. The order, its items, ingredient deductions and any promotion usage
are saved in one transaction, and orders survive backend restarts. Insufficient
ingredients reject the order; successful checkout reloads menu availability.
The frontend cart keeps its contents if order creation fails. Both order creation and SePay payment
initialization support `Idempotency-Key`; retries reuse the original result.
See [idempotency rules and tests](docs/idempotency.md) for the API rules.
Concurrent orders use per-ingredient stock version checks and retry the
transaction on a conflict. See [concurrent inventory and tests](docs/concurrent-inventory.md).
Payments in this project are
simulated and must not use real payment credentials.

## Checks

Run from the repository root:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix backend test
npm.cmd --prefix backend run test:e2e
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
```

The backend e2e suite requires a **fresh dedicated test PostgreSQL database**,
with migrations applied and menu data seeded. Its assertions expect the default
catalog prices from the migrations. Do not point it at a shared or
production database: tests create, update and delete records, including
inventory. E2E files run sequentially because their fixtures share topping
recipes; the concurrent-order tests still issue simultaneous requests.
It covers the product list, order creation,
persistence after closing the app, ingredient deductions, insufficient
ingredients, transaction rollback, two sequential requests with the same idempotency key,
duplicate payment callbacks, concurrent inventory with optimistic locking and
concurrent promotion checkout. The persistence tests create unique
fixtures and remove them after testing. See
[the API contract](docs/api-contracts.md) for the order payload and validation
rules.

## Environment variables

Set `DATABASE_URL` in `backend/.env` for PostgreSQL and `JWT_SECRET` for login.
`.env.example` contains configuration placeholders. Never commit `.env` files,
passwords, JWT secrets, or payment credentials.

For SePay Sandbox configuration and payment troubleshooting, see
[the SePay setup guide](docs/sepay-sandbox.md).

Customers earn 1 point per 1,000 VND paid and can redeem each point for a 10 VND
discount in the cart. See [the loyalty rules and API](docs/loyalty-points.md).

## Team workflow

1. Agree on a task and its acceptance criteria.
2. Coordinate API request/response fields using [the API contract](docs/api-contracts.md).
3. Create a branch for the task; do not commit directly to `main`.
4. Make and test a focused change, then open a pull request for review.
5. Update the progress workbook after the work is verified.
