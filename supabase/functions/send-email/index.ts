// === SUPABASE EDGE FUNCTION: send-email (Gmail SMTP) ===
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import nodemailer from "npm:nodemailer"

const SMTP_USER = Deno.env.get('SMTP_USER') || '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') || '';

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
    const body = await req.json();
    console.log('Received send-email request:', body);
    const { to, subject, html, from_alias } = body;

    if (!SMTP_USER || !SMTP_PASS) {
      throw new Error('Missing SMTP_USER or SMTP_PASS environment variables')
    }

    if (!to || !subject || !html) {
      throw new Error('Missing required fields: to, subject, html')
    }

    // Configure Nodemailer for Gmail SMTP
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    // Gmail SMTP requires the sender email to match the authenticated Gmail account.
    // If from_alias is provided, we can use format: "Name <gmail@address.com>"
    // Otherwise we default to "AvarinLMS <gmail@address.com>"
    let fromAddress = `AvarinLMS <${SMTP_USER}>`;
    if (from_alias) {
      // If user provided a name like "HR Department", format it as: "HR Department <gmail@address.com>"
      // Gmail SMTP does not allow spoofing different 'from' domains, so we must keep the SMTP_USER email.
      const cleanName = from_alias.replace(/<.*>/, '').trim();
      fromAddress = `"${cleanName}" <${SMTP_USER}>`;
    }

    console.log('Sending via Gmail SMTP from:', fromAddress, 'to:', to);

    const mailOptions = {
      from: fromAddress,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: subject,
      html: html
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Gmail SMTP response:', info);

    return new Response(JSON.stringify({ ok: true, data: info }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
})
