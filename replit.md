# LocalConnect - Local Business Community Connection Platform

## Overview

LocalConnect is a web application designed to help local business professionals connect with others who share their interests. The platform enables users to discover potential connections, build their professional network, and engage in real-time chat support. Drawing inspiration from LinkedIn's professional networking, Meetup's interest-based connections, and Discord's chat interface, LocalConnect provides a trust-first design approach that emphasizes interest matching and seamless real-time interaction.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server with HMR (Hot Module Replacement)
- Wouter for lightweight client-side routing
- React Query (@tanstack/react-query) for server state management and data fetching

**UI Component System**
- shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Theme system supporting light/dark modes with system preference detection
- Responsive design with mobile-first approach using custom breakpoints

**State Management Strategy**
- React Query for server-side data caching and synchronization
- Local React state (useState) for UI-specific state
- WebSocket connection for real-time chat messaging
- Form state managed via react-hook-form with Zod validation

**Design System**
- Custom color scheme using HSL values with CSS variables for theme switching
- Inter font family as primary typeface
- Consistent spacing scale using Tailwind units (2, 4, 6, 8, 12, 16, 24)
- Shadow and elevation system for depth perception
- Component variants using class-variance-authority (CVA)

### Backend Architecture

**Server Framework**
- Express.js for HTTP server and API routing
- Node.js HTTP server wrapped around Express for WebSocket support
- Custom middleware for request logging and JSON parsing
- Static file serving for production builds

**API Design**
- RESTful endpoints for CRUD operations on users and connections
- Real-time WebSocket server on `/ws` path for live chat functionality
- Session-based architecture (infrastructure ready via connect-pg-simple)
- JSON request/response format with error handling

**WebSocket Communication**
- ws library for WebSocket server implementation
- Broadcast messaging to all connected clients
- Support message categorization (chat messages, system messages)
- Automatic welcome message from support on connection

**Data Layer**
- In-memory storage implementation (MemStorage class) for development
- Interface-based storage abstraction (IStorage) for future database integration
- Drizzle ORM configured for PostgreSQL (ready for production)
- Schema definitions using Drizzle and Zod for runtime validation

### Data Storage Solutions

**Current Implementation**
- In-memory Map-based storage for rapid prototyping
- Separate collections for users, connections, chat messages, and activities
- UUID-based identifiers for all entities

**Production-Ready Configuration**
- Drizzle ORM with PostgreSQL dialect configured
- Neon Database serverless driver (@neondatabase/serverless)
- Migration system in place (drizzle-kit)
- Schema defined in shared/schema.ts with proper relationships

**Data Models**
- Users: Profile information, interests array, online status
- Connections: Request/accept pattern with status tracking
- Chat Messages: Support for user and support team messages
- Activities: Feed of platform events and user actions

### Authentication and Authorization

**Infrastructure Ready**
- Session management configured with connect-pg-simple
- Passport.js and passport-local dependencies installed
- Current user concept implemented in storage layer
- No authentication currently enforced (development phase)

**Future Implementation Path**
- Session-based authentication using Express sessions
- Local strategy for email/password login
- Secure password hashing (dependencies available)
- Protected API routes with authentication middleware

### External Dependencies

**Database**
- PostgreSQL via Neon Database serverless
- Connection pooling and serverless-optimized queries
- Environment-based configuration (DATABASE_URL)

**UI Component Libraries**
- Radix UI for accessible, unstyled component primitives
- Comprehensive set including dialogs, dropdowns, tooltips, forms
- ARIA-compliant components for accessibility

**Development Tools**
- TypeScript for static type checking
- ESBuild for server bundling with selective dependency bundling
- Vite for client bundling and development experience
- Replit-specific plugins for development environment integration

**Utility Libraries**
- date-fns for date manipulation
- nanoid and uuid for ID generation
- clsx and tailwind-merge for conditional className composition
- zod for schema validation and type inference
- react-hook-form for form state management

**Real-time Communication**
- WebSocket (ws) for bidirectional communication
- Client-side WebSocket API for chat functionality
- Automatic reconnection handling with exponential backoff

**Key Architectural Decisions**

1. **Monorepo Structure**: Client, server, and shared code in single repository with path aliases for clean imports

2. **Type Sharing**: Shared schema definitions between client and server using Drizzle-Zod integration for consistent validation

3. **Component Library Choice**: shadcn/ui provides copy-paste components with full customization rather than black-box npm packages

4. **Build Strategy**: Selective server dependency bundling to reduce cold start times while keeping client dependencies external

5. **Styling Approach**: Utility-first CSS with Tailwind, custom design tokens via CSS variables for theme flexibility

6. **Storage Abstraction**: Interface-based storage allows easy swap from in-memory to PostgreSQL without code changes

7. **Real-time Communication**: WebSocket over HTTP polling for better performance and lower latency in chat features