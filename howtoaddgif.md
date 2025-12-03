# How to Add GIF Support to Message Chat

This document explains how GIF support is implemented in the LocalLinkChat messaging system and how you can extend or modify it.

## Overview

The GIF feature allows users to search for and send GIFs from GIPHY directly in their messages. GIFs are embedded in messages using a special tag format `[GIF]url[/GIF]` and are displayed inline in the chat interface.

## Architecture

### File Structure

```
LocalLinkChat/
├── client/
│   └── src/
│       └── pages/
│           └── messages.tsx          # Main messages page with GIF picker
├── server/
│   ├── routes.ts                     # API routes (no special GIF handling needed)
│   └── storage.ts                    # Database operations
└── shared/
    └── schema.ts                     # Database schema (messages stored as text)
```

## How It Works

### 1. Frontend: GIF Picker Component

**Location:** `client/src/pages/messages.tsx` (lines 52-140)

The `GifPicker` component provides a user interface for searching and selecting GIFs:

```typescript
function GifPicker({ onSelect, t }: { 
  onSelect: (gifUrl: string) => void; 
  t: (key: string) => string 
})
```

**Features:**
- Uses GIPHY API (public beta key: `dc6zaTOxFJmzC`)
- Search functionality with 300ms debounce
- Trending GIFs when no search query
- Grid display (2 columns)
- Lazy loading for performance

**Key Implementation Details:**
- **API Endpoint:** Uses GIPHY's public beta API
  - Search: `https://api.giphy.com/v1/gifs/search?api_key={key}&q={query}&limit=20&rating=g`
  - Trending: `https://api.giphy.com/v1/gifs/trending?api_key={key}&limit=20&rating=g`
- **Rating:** All GIFs are filtered to "g" (general audience) rating
- **Limit:** 20 GIFs per request

### 2. Message Format

GIFs are embedded in messages using a special tag format:

```
[GIF]https://media.giphy.com/media/example.gif[/GIF]
```

This format allows:
- GIFs to be stored as part of the message content
- Easy parsing and rendering
- Optional text content alongside the GIF

**Example message content:**
```
[GIF]https://media.giphy.com/media/example.gif[/GIF]Check this out!
```

### 3. Message Rendering

**Location:** `client/src/pages/messages.tsx` (lines 770-813)

The `renderMessageContent` function parses and displays GIFs:

```typescript
const renderMessageContent = (content: string) => {
  // Check for GIF
  const gifMatch = content.match(/\[GIF\](.*?)\[\/GIF\]/);
  if (gifMatch) {
    const gifUrl = gifMatch[1];
    const textContent = content.replace(/\[GIF\].*?\[\/GIF\]/, "").trim();
    return (
      <div>
        <img 
          src={gifUrl} 
          alt={t("messages.gifSent")} 
          className="rounded-lg mb-1 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => openLightbox(gifUrl, t("messages.gifSent"))}
        />
        {textContent && <p className="text-sm">{textContent}</p>}
      </div>
    );
  }
  // ... image and text handling
}
```

**Features:**
- Regex parsing: `/\[GIF\](.*?)\[\/GIF\]/`
- Click to zoom via lightbox
- Responsive sizing (mobile: 50x50px, desktop: max 200px width)
- Optional text content after GIF

### 4. Sending GIFs

**Location:** `client/src/pages/messages.tsx` (lines 815-822)

```typescript
const handleSendGif = (gifUrl: string) => {
  if (selectedGroupId) {
    sendGroupMessageMutation.mutate({ content: `[GIF]${gifUrl}[/GIF]` });
  } else if (selectedUserId) {
    sendMutation.mutate({ content: `[GIF]${gifUrl}[/GIF]` });
  }
};
```

GIFs are sent the same way as regular text messages - the server doesn't need special handling.

### 5. Backend Storage

**Location:** `shared/schema.ts` (lines 99-106)

Messages are stored in the `direct_messages` table:

```typescript
export const directMessages = sqliteTable("direct_messages", {
  id: text("id").primaryKey(),
  senderId: text("sender_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  content: text("content").notNull(),  // GIF tags stored here
  timestamp: text("timestamp").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).default(false),
});
```

**Important:** The backend treats GIF messages as regular text content. No special processing is required.

## Integration Points

### 1. UI Integration

The GIF picker button is integrated into the message input area:

**Location:** `client/src/pages/messages.tsx` (line 1450)

```typescript
<GifPicker onSelect={handleSendGif} t={t} />
```

**Placement:** Next to the image upload button in the message input toolbar.

### 2. Internationalization

GIF-related translations are in:
- `client/src/locales/en.json`
- `client/src/locales/hu.json`
- `client/src/locales/de.json`

**Keys used:**
- `messages.sendGif` - Button tooltip
- `messages.searchGifs` - Search placeholder
- `messages.noGifsFound` - Empty state message
- `messages.gifSent` - Alt text for GIF images
- `messages.trendingGifs` - Trending section label

### 3. Group Messages

GIFs work in both direct messages and group messages:

```typescript
if (selectedGroupId) {
  sendGroupMessageMutation.mutate({ content: `[GIF]${gifUrl}[/GIF]` });
} else if (selectedUserId) {
  sendMutation.mutate({ content: `[GIF]${gifUrl}[/GIF]` });
}
```

## How to Customize

### 1. Change GIF Provider

To use a different GIF provider (e.g., Tenor, Imgur):

1. **Update API calls** in `GifPicker` component:
   ```typescript
   const endpoint = query 
     ? `https://api.tenor.com/v1/search?q=${encodeURIComponent(query)}&limit=20`
     : `https://api.tenor.com/v1/trending?limit=20`;
   ```

2. **Update response parsing** to match the new API format:
   ```typescript
   // Example for Tenor
   setGifs(data.results || []);
   ```

3. **Update GIF URL extraction**:
   ```typescript
   onSelect(gif.media[0].gif.url);  // Tenor format
   ```

### 2. Add GIF Upload

To allow users to upload their own GIFs:

1. **Add upload handler** in `server/upload.ts`:
   ```typescript
   app.post("/api/upload/gif", upload.single("gif"), async (req, res) => {
     // Validate GIF file
     // Save to server
     // Return URL
   });
   ```

2. **Update frontend** to include upload option in `GifPicker` component.

3. **Store uploaded GIFs** in a `gifs/` directory similar to `post_images/`.

### 3. Change GIF Display Size

**Location:** `client/src/pages/messages.tsx` (line 782-784)

```typescript
className={`rounded-lg mb-1 cursor-pointer hover:opacity-90 transition-opacity ${
  isMobile ? 'w-[50px] h-[50px] object-cover' : 'max-w-[200px]'
}`}
```

Modify the className to adjust sizes.

### 4. Add GIF Categories/Trending

Enhance the `GifPicker` component:

```typescript
const [category, setCategory] = useState<string>("trending");

// Add category selector
<Select value={category} onValueChange={setCategory}>
  <SelectItem value="trending">Trending</SelectItem>
  <SelectItem value="reactions">Reactions</SelectItem>
  <SelectItem value="animals">Animals</SelectItem>
</Select>
```

### 5. Improve Performance

**Caching:**
- Cache trending GIFs in localStorage
- Implement request debouncing (already done)

**Lazy Loading:**
- Use Intersection Observer for infinite scroll
- Load GIFs on-demand

**Example:**
```typescript
const [page, setPage] = useState(1);
// Load more on scroll
```

### 6. Add GIF Reactions

Similar to emoji reactions, add GIF-specific reactions:

1. **Add reaction type** to schema
2. **Update UI** to show GIF reactions
3. **Store reactions** in `message_reactions` table

## API Key Management

**Current Implementation:**
- Uses GIPHY public beta key: `dc6zaTOxFJmzC`
- Hardcoded in component (not recommended for production)

**Production Best Practices:**

1. **Use Environment Variables:**
   ```typescript
   const apiKey = import.meta.env.VITE_GIPHY_API_KEY || "dc6zaTOxFJmzC";
   ```

2. **Add to `.env` file:**
   ```
   VITE_GIPHY_API_KEY=your_production_key_here
   ```

3. **Get API Key:**
   - Sign up at https://developers.giphy.com/
   - Create an app
   - Get your API key from the dashboard

## Testing

### Manual Testing Checklist

- [ ] Search for GIFs
- [ ] Select and send GIF in direct message
- [ ] Select and send GIF in group message
- [ ] GIF displays correctly after sending
- [ ] Click GIF to open lightbox
- [ ] GIF with text content works
- [ ] Mobile responsiveness
- [ ] Empty state when no GIFs found
- [ ] Loading state during fetch

### Test Cases

1. **Basic GIF Send:**
   - Search "happy"
   - Select GIF
   - Verify message contains `[GIF]url[/GIF]` format
   - Verify GIF displays in chat

2. **GIF with Text:**
   - Send GIF
   - Add text after selecting
   - Verify both display correctly

3. **Error Handling:**
   - Test with invalid API key
   - Test with network error
   - Verify graceful error messages

## Troubleshooting

### Common Issues

1. **GIFs not loading:**
   - Check API key validity
   - Verify network requests in browser DevTools
   - Check CORS settings

2. **GIFs not displaying:**
   - Verify regex parsing: `/\[GIF\](.*?)\[\/GIF\]/`
   - Check if URL is valid
   - Verify image loading in browser

3. **Performance issues:**
   - Reduce GIF limit per request
   - Implement caching
   - Add loading states

## Future Enhancements

Potential improvements:

1. **GIF Autoplay:** Add autoplay option for GIFs
2. **GIF Preview:** Show preview before sending
3. **Recent GIFs:** Store recently used GIFs
4. **GIF Favorites:** Allow users to favorite GIFs
5. **GIF Search History:** Remember search queries
6. **Multiple GIF Providers:** Support multiple sources
7. **GIF Compression:** Compress large GIFs before sending
8. **GIF Analytics:** Track popular GIFs

## Related Files

- `client/src/pages/messages.tsx` - Main implementation
- `client/src/components/image-lightbox.tsx` - GIF zoom functionality
- `client/src/locales/*.json` - Translations
- `shared/schema.ts` - Database schema
- `server/routes.ts` - API routes (no changes needed)
- `server/storage.ts` - Database operations (no changes needed)

## Summary

GIF support in LocalLinkChat is implemented entirely on the frontend:

1. **GIF Picker:** React component using GIPHY API
2. **Message Format:** `[GIF]url[/GIF]` tag format
3. **Rendering:** Regex parsing and inline display
4. **Storage:** Standard text content in database
5. **No Backend Changes:** Server treats GIFs as regular messages

The system is designed to be:
- **Simple:** Minimal code changes needed
- **Flexible:** Easy to customize or extend
- **Performant:** Lazy loading and debouncing
- **User-friendly:** Search, trending, and click-to-zoom

For questions or issues, refer to this documentation or check the code comments in `client/src/pages/messages.tsx`.

