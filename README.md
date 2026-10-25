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

## Current API

`GET /products` returns products from the database. A product currently contains:
`id`, `name`, `price` (integer VND), `imageUrl`, and `stock` (inventory quantity).
It does not yet return category or description. See [the API contract and open decisions](docs/api-contracts.md).

The backend enables CORS for local frontend requests. `POST /orders` creates a
validated `PENDING` order in PostgreSQL, including item and price snapshots.
The order, its items, stock deductions and any promotion usage are saved in one
transaction, and orders survive backend restarts. Insufficient stock rejects the
order; successful checkout reloads the menu inventory. The repository also
contains authentication, payment simulation, and order-history features; these
still need to be verified together in an end-to-end run before they are treated
as accepted. Payments in this project are simulated and must not use real
payment credentials.

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

The backend e2e suite requires the configured PostgreSQL database with migrations
applied and menu data seeded. It covers the product list, order creation,
persistence after closing the app, stock deduction, insufficient stock, transaction
rollback and concurrent promotion checkout. The persistence tests create unique
fixtures and remove them after testing. See
[the API contract](docs/api-contracts.md) for the order payload and validation
rules.

GitHub Actions runs backend build, lint, unit tests, and e2e tests against a
temporary PostgreSQL service, plus frontend lint and production build, for pull
requests and pushes to `main`.

## Environment variables

Set `DATABASE_URL` in `backend/.env` for PostgreSQL and `JWT_SECRET` for login.
`.env.example` contains configuration placeholders. Never commit `.env` files,
passwords, JWT secrets, or payment credentials.

## Team workflow

1. Agree on a task and its acceptance criteria.
2. Coordinate API request/response fields using [the API contract](docs/api-contracts.md).
3. Create a branch for the task; do not commit directly to `main`.
4. Make and test a focused change, then open a pull request for review.
5. Update the progress workbook after the work is verified.

## Kiệt's coordination checklist

- Keep these setup and validation instructions aligned with the repository.
- Track task owners, pull requests, blockers, and test evidence in the progress
  workbook; a merged pull request alone does not mean a task passed acceptance.
- Before a demo, confirm PostgreSQL, migrations, and seed data are ready, then
  run the backend and frontend together through the main customer flow.
- Record remaining issues and who will follow up; do not include local secrets
  or `.env` files in commits.
