# TSV Greding Finance Dashboard

## Overview

A web-based finance dashboard for a German sports club (TSV Greding e. V.) that replaces manual Excel workflows. The application allows the club treasurer to upload bank CSV statements, store historical transaction data, analyze income and expenses by category, and project future liquidity until year-end.

**Core Features:**
- CSV upload of bank statements with duplicate detection
- Transaction categorization (income/expense types)
- Visual dashboards with charts (bar, line, pie)
- Financial forecasting based on recurring transactions
- User authentication via Replit Auth

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight React router)
- **State Management:** TanStack React Query for server state
- **Styling:** Tailwind CSS with shadcn/ui component library
- **Charts:** Recharts for data visualization
- **Forms:** React Hook Form with Zod validation
- **Build Tool:** Vite with path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Runtime:** Node.js with Express
- **Language:** TypeScript (ESM modules)
- **API Pattern:** RESTful endpoints under /api prefix
- **File Uploads:** Multer for CSV processing
- **CSV Parsing:** csv-parse library

### Data Storage
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM with drizzle-kit for migrations
- **Schema Location:** shared/schema.ts (single source of truth)
- **Session Storage:** connect-pg-simple for session persistence

### Authentication
- **Provider:** Replit Auth (OpenID Connect)
- **Session Management:** Express-session with PostgreSQL store
- **Protected Routes:** isAuthenticated middleware on all /api routes

### Shared Code Pattern
- The `shared/` directory contains code used by both frontend and backend
- `shared/schema.ts` - Database schemas and Zod validation schemas
- `shared/routes.ts` - API contract definitions with input/output types
- `shared/models/auth.ts` - User and session table definitions

### Build System
- Development: `tsx server/index.ts` with Vite dev server middleware
- Production: esbuild bundles server, Vite builds client to dist/

## External Dependencies

### Database
- PostgreSQL (required, uses DATABASE_URL environment variable)
- Drizzle ORM handles schema push via `npm run db:push`

### Authentication
- Replit Auth (OIDC provider at https://replit.com/oidc)
- Requires REPL_ID and SESSION_SECRET environment variables

### UI Components
- shadcn/ui (Radix primitives with Tailwind styling)
- Component configuration in components.json
- Icons from lucide-react

### Key NPM Packages
- @tanstack/react-query - Data fetching and caching
- recharts - Chart visualizations
- date-fns - Date formatting (German locale for currency)
- zod - Runtime validation
- drizzle-orm / drizzle-kit - Database ORM and migrations