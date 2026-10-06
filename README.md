# BrewLite

BrewLite is a cashless drink-ordering application built for the Software
Engineering course project. The MVP covers browsing drinks, choosing options,
managing a cart, placing an order, simulating payment, and viewing confirmation.

## Project structure

- `frontend/` - Next.js and TypeScript web application
- `backend/` - NestJS and TypeScript REST API

PostgreSQL and Prisma (or TypeORM, as agreed by the team) will be added in a
later task. Payments are simulated; do not add real payment credentials.

## Requirements

- Node.js LTS
- npm (on Windows PowerShell, use `npm.cmd` if the `npm` command is blocked)
- Git

## Run locally

Open two terminals from this repository root.

Terminal 1 - backend:

```powershell
npm.cmd --prefix backend run start:dev
```

The API listens on `http://localhost:3001`. Its starter endpoint is
`http://localhost:3001/`.

Terminal 2 - frontend:

```powershell
npm.cmd --prefix frontend run dev
```

Open `http://localhost:3000` in a browser.

## Environment variables

Copy `.env.example` to `backend/.env` when database configuration is introduced.
The example values are placeholders only. Never commit `.env` files, passwords,
JWT secrets, or payment credentials.

## Team workflow

1. Pick an issue/task and agree on its acceptance criteria.
2. Create a branch for the task; do not commit directly to `main`.
3. Make and test a focused change, then commit it with a descriptive message.
4. Open a pull request and ask a teammate to review it before merging.

Keep changes small and coordinate API request/response shapes between frontend
and backend contributors before integrating their work.
