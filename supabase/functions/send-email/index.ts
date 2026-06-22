// === SUPABASE EDGE FUNCTION: send-email ===
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    })
  }

  try {
    const { to, subject, html, from_alias } = await req.json()

    if (!RESEND_API_KEY) {
      throw new Error('Missing RESEND_API_KEY environment variable')
    }

    if (!to || !subject || !html) {
      throw new Error('Missing required fields: to, subject, html')
    }

    // With Resend, you can define your verified domain alias, e.g. "hr@yourcompany.com"
    // By default, if onboarding/not verified, Resend requires sender to be "onboarding@resend.dev"
    // We allow setting this from the Global Settings alias, defaulting to "onboarding@resend.dev"
    const fromAddress = from_alias || 'AvarinLMS <onboarding@resend.dev>'

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: html
      })
    })

    const result = await response.json()
    
    if (!response.ok) {
      throw new Error(result.message || 'Failed to send email via Resend')
    }

    return new Response(JSON.stringify({ ok: true, data: result }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})
