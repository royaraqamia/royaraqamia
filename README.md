
  # رؤية رقمية

  This is a code bundle for رؤية رقمية. The original project is available at https://www.figma.com/design/PkvfNJ4LinlzIWuhzPatlL/%D8%B1%D8%A4%D9%8A%D8%A9-%D8%B1%D9%82%D9%85%D9%8A%D8%A9.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## PWA Features

  This application is a fully installable Progressive Web App (PWA) with:

  - **Full Offline Support**: Browse the entire app without internet connection
  - **Stale-While-Revalidate Caching**: Fast loading with automatic background updates
  - **Auto-Update Mechanism**: Automatic detection and prompt for new versions
  - **Cross-Platform Installation**: Install on iOS, Android, and Desktop
  - **Install Prompts**: User-friendly installation banners
  - **Push Notifications**: Ready to use with VAPID key configuration

  ### PWA Installation

  - **Desktop (Chrome/Edge)**: Click the install icon in the address bar
  - **Android Chrome**: Tap "Add to Home Screen" when prompted
  - **iOS Safari**: Tap Share → "Add to Home Screen"

  ### Testing PWA Locally

  1. Build the project: `npm run build`
  2. Preview the build: `npm run preview`
  3. Open Chrome DevTools → Application tab
  4. Check Service Workers and Manifest sections
  5. Run Lighthouse PWA audit for verification

  ### Regenerating PWA Icons

  If you update the logo, regenerate PWA icons:
  ```bash
  npm run generate-pwa-icons
  ```

  ## Push Notifications with Supabase

  Push notifications are fully implemented using Supabase for production-ready infrastructure.

  ### Setup Instructions

  1. **Create a Supabase Project**
     - Go to https://supabase.com and create a new project
     - Note your project URL and anon key from Settings → API

  2. **Run the Database Migration**
     - In Supabase Dashboard → SQL Editor, run:
     ```sql
     -- Copy the content from supabase/migrations/001_create_push_subscriptions.sql
     ```

  3. **Configure Environment Variables**
     - Add your Supabase credentials to `.env`:
     ```bash
     VITE_SUPABASE_URL=your-project-url
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```

  4. **Deploy the Edge Function**
     - Install Supabase CLI: `npm install -g supabase`
     - Login: `supabase login`
     - Link your project: `supabase link --project-ref your-project-id`
     - Deploy the function:
     ```bash
     supabase functions deploy send-push-notification
     ```
     - Set environment variables for the Edge Function:
     ```bash
     supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
     supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
     ```

  5. **Update Edge Function URL**
     - Add the deployed function URL to `.env`:
     ```bash
     VITE_SUPABASE_EDGE_FUNCTION_URL=https://your-project.supabase.co/functions/v1/send-push-notification
     ```

  ### Sending Push Notifications

  Use the Edge Function to send notifications:

  ```bash
  curl -X POST https://your-project.supabase.co/functions/v1/send-push-notification \
    -H "Authorization: Bearer your-service-role-key" \
    -H "Content-Type: application/json" \
    -d '{"title":"تحديث جديد","body":"هناك تحديث جديد في منصة رؤية رقمية"}'
  ```

  ### Frontend Integration

  The frontend automatically:
   - Saves subscriptions to Supabase database
   - Falls back to localStorage if Supabase is unavailable
   - Shows notification permission prompt after 5 seconds
   - Manages subscription state

  ### Database Schema

  The `push_subscriptions` table includes:
   - `endpoint` - Unique subscription endpoint
   - `keys` - VAPID keys JSON
   - `user_agent` - Browser user agent
   - `is_active` - Subscription status
   - `created_at` / `updated_at` - Timestamps

  ### Migration from Local Server

  The local Express server (`backend/push-server.js`) is kept as a reference but is no longer used. The system now uses Supabase for:
   - Subscription storage (PostgreSQL database)
   - Push notification sending (Edge Functions)
   - Production-ready infrastructure