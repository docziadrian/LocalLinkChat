# Design Guidelines: Local Business Community Connection Platform

## Design Approach
**Reference-Based:** Drawing inspiration from LinkedIn's professional networking, Meetup's interest-based connections, and Discord's chat interface, adapted for local business community building.

## Core Design Principles
- **Trust-First Design**: Build credibility through structured profiles and transparent user information
- **Connection-Focused**: Prioritize interest matching and discovery flows
- **Real-Time Interaction**: Seamless chat integration without disrupting browsing experience
- **Professional Warmth**: Balance business professionalism with community friendliness

## Typography System
**Font Stack**: Inter (primary), system-ui fallback
- Headings: 600-700 weight, ranging from text-3xl to text-5xl
- Body: 400 weight, text-base to text-lg
- Labels/Meta: 500 weight, text-sm
- Chat Messages: 400 weight, text-sm to text-base

## Layout & Spacing
**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16, 24
- Component padding: p-4 to p-8
- Section spacing: gap-6 to gap-12
- Card spacing: p-6
- Chat bubbles: px-4 py-3

**Container Strategy**:
- Main content: max-w-7xl centered
- Profile cards: max-w-sm to max-w-md
- Chat interface: Fixed right sidebar (w-96) on desktop, full-screen modal on mobile

## Component Library

### Navigation
**Top Navigation Bar**: 
- Sticky header with platform logo, search bar, notifications bell, profile dropdown
- Quick access to "Discover", "My Connections", "Messages", "Profile"
- Live chat support icon (persistent, bottom-right floating button)

### User Profiles
**Profile Cards** (Discovery Grid):
- Avatar (rounded-full, w-16 h-16)
- Name and business/role
- Interest tags (pill-shaped, max 5 visible)
- Short bio snippet (2 lines max)
- "Connect" button

**Full Profile View**:
- Large avatar (w-32 h-32)
- Detailed bio
- All interest tags displayed
- Recent activity/connections
- Contact/connect actions

### Interest Tags System
- Pill-shaped badges with rounded-full styling
- Clickable for filtering
- Visual indicator for matched interests
- Tag cloud view for browsing popular interests

### Discovery Interface
**Interest-Based Grid**:
- 3-column grid on desktop (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
- Filter sidebar: Interest categories, location radius, availability
- Sort options: "Most similar interests", "Recently active", "Nearby"

### Live Chat Support
**Floating Chat Widget**:
- Bottom-right positioned (fixed)
- Minimized state: Circular button with chat icon + notification badge
- Expanded state: 
  - Chat window (w-96 h-[600px])
  - Header with support agent info
  - Message thread with scrollable area
  - Input field with send button
  - Typing indicators
  - Timestamp display (text-xs)

**Message Bubbles**:
- User messages: Aligned right, distinct styling
- Support messages: Aligned left with avatar
- Padding: px-4 py-3
- Border radius: rounded-2xl

### Community Feed
**Activity Stream**:
- Card-based layout
- Shows recent connections, new members, popular interests
- Each activity card includes user avatars, action description, timestamp
- Engagement metrics (likes, comments if applicable)

### Search & Filters
**Global Search**:
- Prominent search bar in header
- Instant search results dropdown
- Filter by: People, Interests, Businesses
- Recent searches saved

## Interaction Patterns

### Connection Flow
1. Discover user → View profile → Send connection request
2. Visual feedback for pending/accepted connections
3. Success confirmation with suggested next action ("Send a message")

### Chat Initialization
- Floating support button always visible
- Single click to open chat
- Pre-filled greeting message
- Average response time displayed
- Offline state with email fallback form

### Interest Matching
- Visual highlighting of shared interests in profile views
- Match percentage indicator
- "People you might know" recommendations based on interests

## Page Layouts

### Dashboard/Home
- Welcome header with user stats (connections count, active chats)
- Interest-based recommendations grid
- Recent activity feed
- Quick action cards ("Update interests", "Browse community")

### Discover Page
- Filter sidebar (left, w-64)
- Main grid area (3-column user cards)
- "Load more" infinite scroll
- Sticky filter bar on mobile

### Profile Page
- Two-column layout: Info sidebar (left) + Activity/Connections feed (right)
- Editable state for own profile
- "Connect" CTA prominently placed for other users

### Messages/Connections
- Two-pane interface: Connections list (left, w-80) + Chat thread (right)
- Search within connections
- Unread message indicators

## Images
**Profile Avatars**: Required for all users, circular cropping
**Hero Section**: Not applicable for this application-focused interface
**Placeholder States**: Use avatar placeholders (generic icon) for users without photos
**Interest Category Icons**: Simple line icons from Heroicons to represent interest categories

## Accessibility
- Focus states on all interactive elements
- ARIA labels for icon-only buttons
- Keyboard navigation for chat interface
- Screen reader announcements for new messages
- Sufficient contrast for all text
- Consistent tab order throughout application

## Mobile Adaptations
- Bottom navigation bar replacing top nav
- Full-screen chat interface (overlays content)
- Single-column profile card grid
- Collapsible filter drawer
- Swipe gestures for navigation between sections