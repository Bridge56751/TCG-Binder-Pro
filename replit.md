# CardVault

## Overview

CardVault is a trading card game (TCG) collection tracker built as a React Native / Expo mobile application with an Express.js backend. It supports three card games: Pokémon, Yu-Gi-Oh!, and Magic: The Gathering. Users can browse card sets, track which cards they own, and scan physical cards using their phone camera with AI-powered identification (OpenAI vision). The app supports user accounts with server-side collection storage for data persistence across devices. Local storage (AsyncStorage) is used as the primary source, with cloud sync available for logged-in users.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with expo-router for file-based routing
- **Navigation structure**: Tab-based layout with four tabs (Collection, Scan, Sets, Settings) plus modal/card presentation screens for set details and card details
- **State management**: React Context (`CollectionProvider`, `AuthProvider`, `PurchaseProvider`) for collection, auth, and premium state, TanStack React Query for server data fetching and caching
- **In-App Purchases**: RevenueCat SDK (`react-native-purchases`) for iOS in-app purchases. `PurchaseContext` wraps the app and manages premium status. Entitlement ID: `TCG Binder Unlimited`. Apple public API key hardcoded in PurchaseContext.tsx (`appl_SSTytUsLoMQInalBawWscUFhGRp`). Backend verification via `REVENUECAT_SECRET_API_KEY`. Works in Expo Go via Preview API Mode.
- **Account Deletion**: Apple-compliant account deletion flow with two-step confirmation, subscription warning (links to Apple subscription management), Apple Sign-In token revocation via `expo-apple-authentication` `refreshAsync` (client-side) and server-side revocation via Apple REST API when `APPLE_CLIENT_SECRET` env var is set, and full local data wipe (all `cardvault_*` AsyncStorage keys). Server deletes user record, collection data, and destroys session.
- **Local storage**: `@react-native-async-storage/async-storage` stores the user's card collection as a JSON structure keyed by game → set → card IDs. Cloud sync available for logged-in users via `/api/collection/sync`.
- **Offline mode**: Card metadata (names, images, prices, set info) cached locally via `lib/card-cache.ts` using AsyncStorage. Card images cached on disk via expo-image `cachePolicy="disk"`. When API calls fail, the app falls back to cached data for prices, sets, and card names. An "Offline mode" banner appears when the API is unreachable.
- **Authentication**: `AuthContext` manages user sessions (login/register/logout/verify/reset). Settings tab provides login/register UI and account management. Email verification via 6-digit code after registration (with skip option). Forgot password flow with email reset codes.
- **Styling**: Plain React Native `StyleSheet` with a custom color system in `constants/colors.ts`. Uses DM Sans font family loaded via `@expo-google-fonts/dm-sans`.
- **Key libraries**: expo-image for optimized image rendering, expo-haptics for tactile feedback, expo-camera/expo-image-picker for card scanning, react-native-reanimated for animations, react-native-chart-kit for card detail charts

### Backend (Express.js)

- **Runtime**: Node.js with TypeScript, compiled via `tsx` for development and `esbuild` for production
- **API pattern**: RESTful JSON APIs under `/api/` prefix. The frontend fetches via a custom `apiRequest` helper and TanStack Query's default query function, both using the `EXPO_PUBLIC_DOMAIN` env var to construct the base URL.
- **Key routes**:
  - `/api/tcg/:game/sets` — list sets for a game
  - `/api/tcg/:game/sets/:id/cards` — list cards in a set
  - `/api/tcg/:game/card/:cardId` — card detail
  - `/api/identify-card` — AI-powered card identification from camera image
  - `/api/auth/register` — user registration
  - `/api/auth/login` — user login
  - `/api/auth/logout` — user logout
  - `/api/auth/me` — get current user session (returns isPremium)
  - `/api/auth/verify-email` — verify email with 6-digit code
  - `/api/auth/resend-verification` — resend verification email
  - `/api/auth/request-reset` — request password reset code via email
  - `/api/auth/reset-password` — reset password with code
  - `/api/auth/upgrade-premium` — mark user as premium after RevenueCat purchase verification
  - `/api/collection/sync` — GET/POST collection sync for logged-in users
- **AI Integration**: OpenAI API (via Replit AI Integrations proxy) for card identification using vision model (gpt-5.2). Configured via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables.
- **CORS**: Dynamic origin allowlist based on environment variables (`ALLOWED_ORIGINS`, Replit domains), plus localhost for Expo web dev. Native mobile apps (no Origin header) are allowed by default.

### Database

- **ORM**: Drizzle ORM configured for PostgreSQL (`drizzle.config.ts`)
- **Schema location**: `shared/schema.ts` (users table, user_collections table) and `shared/models/chat.ts` (conversations and messages tables for chat integration)
- **Current schema**: Users table (id, email, password, appleId, isPremium, isVerified, verificationCode, verificationExpiry, resetCode, resetExpiry) and user_collections table (userId FK, data JSONB, updatedAt) and chat-related tables (conversations, messages). The TCG card/set data comes from external APIs, not the database.
- **Migration management**: Drizzle Kit with `db:push` script for schema sync
- **Connection**: `GOOGLE_CLOUD_DATABASE_URL` environment variable (Google Cloud SQL). All server code uses this exclusively.

### Replit Integrations (Pre-built Modules)

Located in `server/replit_integrations/`, these are pre-built integration modules:
- **Chat**: Conversation/message CRUD with OpenAI streaming responses, stored in PostgreSQL
- **Audio**: Voice chat with speech-to-text, text-to-speech, audio format detection, ffmpeg conversion
- **Image**: Image generation via `gpt-image-1`
- **Batch**: Generic batch processing utility with rate limiting and retries (`p-limit`, `p-retry`)

Client-side integration helpers are in `.replit_integration_files/client/replit_integrations/` (audio playback worklet, voice recording hooks).

### Project Structure

```
app/                    # Expo Router file-based routes
  (tabs)/               # Tab navigator (Collection, Scan, Sets)
  set/[game]/[id].tsx   # Set detail screen
  card/[game]/[cardId].tsx  # Card detail modal
components/             # Reusable UI components
constants/              # Colors and theme
lib/                    # Client-side utilities (types, collection storage, query client, context)
server/                 # Express backend
  routes.ts             # API route registration
  storage.ts            # In-memory user storage (MemStorage)
  replit_integrations/  # Pre-built AI integration modules
shared/                 # Shared code between client/server
  schema.ts             # Drizzle database schema
  models/               # Additional data models
scripts/                # Build scripts for static export
migrations/             # Drizzle migration output
```

### Build & Development

- **Development**: Two processes run simultaneously — Expo dev server (`expo:dev`) and Express server (`server:dev` via tsx)
- **Production**: Static Expo web build (`expo:static:build`) served by Express, server bundled with esbuild (`server:build`)
- **Schema sync**: `npm run db:push` pushes Drizzle schema to PostgreSQL

### Vercel Deployment (Backend)

- **Entry point**: `api/index.ts` exports the Express app for Vercel's `@vercel/node` runtime
- **App setup**: `server/app.ts` creates and configures the Express app (CORS, sessions, routes, error handling) without starting a listener
- **Local dev**: `server/index.ts` imports from `server/app.ts` and adds Expo landing page serving + `httpServer.listen()`
- **Config**: `vercel.json` routes all requests to the serverless function; `tsconfig.server.json` resolves `@shared/*` path aliases
- **Session cookies**: Production uses `secure: true`, `sameSite: "none"` for cross-origin native app requests; `trust proxy` enabled
- **Required Vercel env vars**: `GOOGLE_CLOUD_DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `REVENUECAT_SECRET_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, `ALLOWED_ORIGINS` (comma-separated), `NODE_ENV=production`
- **Frontend config**: Set `EXPO_PUBLIC_API_URL` in app.json or build config to the Vercel deployment URL (e.g., `https://your-app.vercel.app/`)

## External Dependencies

- **Google Cloud SQL (PostgreSQL)**: Primary database, connected via `GOOGLE_CLOUD_DATABASE_URL` environment variable. Used by Drizzle ORM for user data, sessions, and collections.
- **OpenAI API (via Replit AI Integrations)**: Powers card identification from camera images. Requires `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables.
- **External TCG APIs**: The app fetches card/set data from external free APIs — TCGdex (Pokemon), YGOProDeck (Yu-Gi-Oh!), and Scryfall (Magic: The Gathering). No API keys needed. Endpoints under `/api/tcg/:game/sets`. Implementation in `server/routes.ts`. Pokemon routes support `?lang=ja` query parameter for Japanese card data (TCGdex `/ja/` endpoint). Japanese sets use different IDs (e.g., `SV2a` for Pokemon 151 instead of English `sv03.5`). All external API calls use `fetchWithRetry` (15s timeout, 2 retries with exponential backoff) and `response.ok` validation to handle transient failures gracefully.
- **AsyncStorage**: On-device persistence for the card collection (no server-side collection sync).
- **Expo Services**: Used for font loading, camera, image picker, haptics, and other native capabilities.
- **Resend**: Email service for verification and password reset emails. Requires `RESEND_API_KEY`.
- **RevenueCat**: In-app purchase management. Frontend uses `EXPO_PUBLIC_REVENUECAT_API_KEY`, backend uses `REVENUECAT_SECRET_API_KEY` for verification.
- **Meta (Facebook) SDK**: `react-native-fbsdk-next` config plugin for app install ad tracking and conversion optimization. App ID: `903672085924332`. Uses `expo-tracking-transparency` for iOS ATT permission. RevenueCat is connected via `setFBAnonymousID` for subscription attribution. Native-only module — guarded with try/catch `require` to avoid web crashes.