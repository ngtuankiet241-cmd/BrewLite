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
- Git
- Windows PowerShell users may need `npm.cmd` instead of `npm`

Install dependencies once from the repository root:

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
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

`GET /products` returns an in-memory sample menu. A product currently contains:
`id`, `name`, `price` (integer VND), and `imageUrl`. It does not yet return
category, stock, or description. See [the API contract and open decisions](docs/api-contracts.md).

The backend enables CORS for local frontend requests. The sample product list
is not persisted in a database. Database selection and order/payment API
contracts remain future team decisions; payments in this project are simulated
and must not use real payment credentials.

## Checks

Run from the repository root:

```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix backend run test:e2e -- --maxWorkers=1
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run build
```

The backend e2e test currently expects 4 products while the sample API returns
10. The `/products` test therefore fails until its expected data is updated.
The frontend lint/build and backend build/lint have been verified separately;
re-run all checks after changing the code.

## Environment variables

No environment file is currently required to run the sample menu. `.env.example`
contains placeholders for future configuration. Copy values only when the
relevant feature needs them; never commit `.env` files, passwords, JWT secrets,
or payment credentials.

## Team workflow

1. Agree on a task and its acceptance criteria.
2. Coordinate API request/response fields using [the API contract](docs/api-contracts.md).
3. Create a branch for the task; do not commit directly to `main`.
4. Make and test a focused change, then open a pull request for review.
5. Update the progress workbook after the work is verified.
