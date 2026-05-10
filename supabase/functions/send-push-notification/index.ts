// @ts-ignore - Deno imports work in Supabase edge runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore - ESM imports work in Supabase edge runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore - ESM imports work in Supabase edge runtime
import webPush from 'https://esm.sh/web-push@3.6.6'

// @ts-ignore - Deno types are available in Supabase edge runtime
declare const Deno: {
  env: {
    get(key: string): string | undefined
  }
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!

// Configure web-push
webPush.setVapidDetails(
  'mailto:contact@royaraqamia.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

serve(async (req: Request) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const { title, body, icon, url } = await req.json()

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: 'Title and body are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch all active subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('is_active', true)

    if (error) {
      console.error('Error fetching subscriptions:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No active subscriptions' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare notification payload
    const payload = JSON.stringify({
      title,
      body,
      icon: icon || '/icons/icon-192x192.png',
      url: url || '/',
    })

    // Send notifications to all subscribers
    const results = []
    const errors = []

    for (const subscription of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        }

        await webPush.sendNotification(pushSubscription, payload)
        results.push({ success: true, endpoint: subscription.endpoint })
      } catch (error) {
        console.error(`Failed to send to ${subscription.endpoint}:`, error)
        errors.push({ endpoint: subscription.endpoint, error: error instanceof Error ? error.message : String(error) })

        // Deactivate failed subscription
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('endpoint', subscription.endpoint)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: results.length,
        failed: errors.length,
        errors,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in send-push-notification function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
