# TSV Greding Finance Dashboard

## Overview

A web-based finance dashboard for a German sports club (TSV Greding e. V.) that replaces manual Excel workflows. The application allows the club treasurer to upload bank CSV statements, store historical transaction data, analyze income and expenses by category, and project future liquidity until year-end.

**Core Features:**
- Multi-bank CSV upload with automatic format detection (VR-Bank, Sparkasse)
- Duplicate detection and transaction categorization
- Visual dashboards with charts (bar, line, pie)
- Financial forecasting based on recurring transactions
- User authentication via Replit Auth
- AI-powered financial assistant chatbot (German language)
- Contracts module with automatic transaction linking
- Multi-select filters for years, categories, and accounts
- Responsive design for desktop, tablet, and mobile

## Supported Bank Formats

The CSV parser automatically detects and handles multiple German bank export formats:

### VR-Bank Format
- Delimiter: Semicolon (;)
- Date format: DD.MM.YYYY
- Columns: IBAN Auftragskonto, Buchungstag, Verwendungszweck, Name Zahlungsbeteiligter, Betrag

### Sparkasse Format
- Delimiter: Semicolon (;)
- Date format: DD.MM.YY (2-digit year)
- Columns: Auftragskonto, Buchungstag, Valutadatum, Buchungstext, Verwendungszweck, Beguenstigter/Zahlungspflichtiger, Betrag
- Description is built from Buchungstext + Verwendungszweck

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
### Authentication
- **None** - Authentication has been removed. All routes are publicly accessible.

### Shared Code Pattern
- The `shared/` directory contains code used by both frontend and backend
- `shared/schema.ts` - Database schemas and Zod validation schemas
- `shared/routes.ts` - API contract definitions with input/output types

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