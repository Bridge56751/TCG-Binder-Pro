# CardVault

## Overview

CardVault is a trading card game (TCG) collection tracker built as a React Native / Expo mobile application with an Express.js backend. It supports four card games: Pokémon, Yu-Gi-Oh!, One Piece TCG, and Magic: The Gathering. Users can browse card sets, track which cards they own, and scan physical cards using their phone camera with AI-powered identification (OpenAI vision). The app stores collection data locally on-device via AsyncStorage, while the backend provides TCG data APIs and AI card identification.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with expo-router for file-based routing
- **Navigation structure**: Tab-based layout with three tabs (Collection, Scan, Sets) plus modal/card presentation screens for set details and card details
- **State management**: React Context (`CollectionProvider`) for collection state, TanStack React Query for server data fetching and caching
- **Local storage**: `@react-native-async-storage/async-storage` stores the user's card collection as a JSON structure keyed by game → set → card IDs. No server-side collection persistence currently exists.
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
- **AI Integration**: OpenAI API (via Replit AI Integrations proxy) for card identification using vision model (gpt-5.2). Configured via `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables.
- **CORS**: Dynamic origin allowlist based on Replit environment variables, plus localhost for Expo web dev

### Database

- **ORM**: Drizzle ORM configured for PostgreSQL (`drizzle.config.ts`)
- **Schema location**: `shared/schema.ts` (users table) and `shared/models/chat.ts` (conversations and messages tables for chat integration)
- **Current schema**: Basic users table (id, username, password) and chat-related tables (conversations, messages). The TCG card/set data appears to come from external APIs rather than the database.
- **Migration management**: Drizzle Kit with `db:push` script for schema sync
- **Connection**: `DATABASE_URL` environment variable required

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

## External Dependencies

- **PostgreSQL**: Required database, connected via `DATABASE_URL` environment variable. Used by Drizzle ORM for user data and chat storage.
- **OpenAI API (via Replit AI Integrations)**: Powers card identification from camera images and chat/voice/image features. Requires `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` environment variables.
- **External TCG APIs**: The app fetches card/set data from external free APIs — TCGdex (Pokemon), YGOProDeck (Yu-Gi-Oh!), OPTCG API (One Piece), and Scryfall (Magic: The Gathering). No API keys needed. Endpoints under `/api/tcg/:game/sets`. Implementation in `server/routes.ts`.
- **AsyncStorage**: On-device persistence for the card collection (no server-side collection sync).
- **Expo Services**: Used for font loading, camera, image picker, haptics, and other native capabilities.