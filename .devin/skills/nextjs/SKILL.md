---
name: nextjs
description: Best practices for Next.js 14+ App Router, focusing on Server Components, Scalability, and Security.
---

# Next.js

## 1. React Server Components (RSC) vs. Client Components
- **Default to Server Components:** All components in the `app/` directory are Server Components by default. Keep them that way unless interactivity is required.
- **Use `"use client"` ONLY when:** 
  - Using React hooks (`useState`, `useEffect`, `useContext`).
  - Handling DOM events (`onClick`, `onChange`).
  - Using browser-only APIs (e.g., `window`, `localStorage`).
- **Push Client Components Down the Tree:** Never put `"use client"` at the top of a page layout. Isolate interactivity into small, specific leaf components (e.g., `<SubmitButton />` instead of making the whole `<CheckoutPage />` a client component).

## 2. Data Fetching & Mutations
- **Avoid `useEffect` for Fetching:** NEVER use `useEffect` to fetch data on the client unless explicitly required (like live polling). Always fetch data asynchronously in Server Components.
- **Server Actions for Mutations:** Use Server Actions (functions marked with `"use server"`) to handle form submissions and database mutations.
- **Supabase Integration:** 
  - Server Actions must use the Supabase Server Client.
  - Client Components must use the Supabase Browser Client.

## 3. Security Rules
- **Environment Variables:** Never expose a secret key to the browser. Only variables prefixed with `NEXT_PUBLIC_` can be used in Client Components. 
- **Authorization:** Always check user sessions/permissions inside Server Actions BEFORE executing database mutations. Do not rely solely on UI-level hiding.

## 4. Scalability & Performance
- Use Next.js `<Image />` for all images to ensure automatic WebP conversion and lazy loading.
- Use `Suspense` boundaries to wrap slow data-fetching components, providing a fallback UI (like a skeleton loader) so the rest of the page can render instantly.

## 5. Anti-Patterns to Avoid
- Passing non-serializable data (like functions or complex class instances) from a Server Component to a Client Component.
- "Prop Drilling" deeply through the component tree (use Context or state management for global states).