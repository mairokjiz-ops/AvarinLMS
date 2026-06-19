// Supabase Edge Function - LINE Webhook handler
// Powered by Deno and Deno HTTP Server

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.2";

// ── SUPABASE CLIENT INIT ──────────────────────────────────────────
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  }
});

// ── HTTP SERVER HANDLER ───────────────────────────────────────────
serve(async (req) => {
  if (req.method === "GET") {
    return new Response("LINE Webhook is active and listening for POST requests.", { status: 200 });
  }

  try {
    const bodyText = await req.text();
    const json = JSON.parse(bodyText);
    const events = json.events || [];

    // Verify webhook confirmation from LINE Developers
    if (events.length === 0) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Load LINE keys dynamically from the settings table
    const channelAccessToken = await getSetting("line_channel_access_token");
    if (!channelAccessToken) {
      console.warn("LINE Integration is not configured. line_channel_access_token key not found in database settings.");
      return new Response(JSON.stringify({ ok: false, error: "Not configured" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Process all events asynchronously
    for (const event of events) {
      const replyToken = event.replyToken;
      const lineUserId = event.source && event.source.userId;
      if (!replyToken || !lineUserId) continue;

      if (event.type === "message" && event.message.type === "text") {
        await handleTextMessage(event, replyToken, lineUserId, channelAccessToken);
      } else if (event.type === "postback") {
        await handlePostbackEvent(event, replyToken, lineUserId, channelAccessToken);
      } else if (event.type === "follow") {
        await handleFollowEvent(event, replyToken, lineUserId, channelAccessToken);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Webhook Execution Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

// ── BOT COMMANDS PROCESSING ───────────────────────────────────────
async function handleTextMessage(event: any, replyToken: string, lineUserId: string, accessToken: string) {
  const txt = String(event.message.text || "").trim();
  
  // 1. Connection Code Matcher (e.g. connect 123456 or LMS-123456)
  const connectionMatch = txt.match(/^(?:connect\s+|lms-)?(\d{6})$/i);
  if (connectionMatch) {
    const code = connectionMatch[1];
    
    // Look up profile with matching line_connect_code
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("line_connect_code", code)
      .maybeSingle();

    if (!error && profile) {
      // Bind LINE account, clear connect code
      await supabase
        .from("profiles")
        .update({
          line_user_id: lineUserId,
          line_connect_code: null
        })
        .eq("id", profile.id);

      const welcomeFlex = buildConnectSuccessFlex(profile);
      await replyMessage(replyToken, [welcomeFlex], accessToken);
    } else {
      await replyTextMessage(replyToken, "❌ ไม่พบรหัสเชื่อมต่อนี้ในระบบ หรือรหัสหมดอายุแล้ว กรุณาเข้าสู่ระบบหน้าเว็บเพื่อยืนยันคีย์ของคุณอีกครั้ง", accessToken);
    }
    return;
  }

  // 2. Bound User profile validation
  const { data: user } = await supabase
    .from("profiles")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (!user) {
    // Return Not Connected guide Flex message
    const notConnectedFlex = buildNotConnectedFlex();
    await replyMessage(replyToken, [notConnectedFlex], accessToken);
    return;
  }

  // 3. Command dispatcher for bound users
  const cleanTxt = txt.toLowerCase();
  
  if (cleanTxt === "โควตา" || cleanTxt === "quota" || cleanTxt === "สิทธิ์") {
    const quotaFlex = await buildLeaveQuotaFlex(user);
    await replyMessage(replyToken, [quotaFlex], accessToken);
  } 
  else if (cleanTxt === "สถานะ" || cleanTxt === "status") {
    const latestLeave = await getLatestLeaveRequest(user.id);
    if (!latestLeave) {
      await replyTextMessage(replyToken, "ℹ️ ไม่พบประวัติการยื่นใบลาของคุณในระบบ", accessToken);
    } else {
      const statusFlex = buildLeaveStatusFlex(user, latestLeave);
      await replyMessage(replyToken, [statusFlex], accessToken);
    }
  } 
  else if (cleanTxt === "งานค้าง" || cleanTxt === "pending") {
    const isManager = ["admin", "approver", "supervisor", "checker"].includes(user.role);
    if (!isManager) {
      await replyTextMessage(replyToken, "🔒 ฟังก์ชันนี้เฉพาะหัวหน้างานหรือฝ่ายอนุมัติเท่านั้นครับ", accessToken);
      return;
    }

    const pendingLeaves = await getPendingLeaves(user);
    if (pendingLeaves.length === 0) {
      await replyTextMessage(replyToken, "✅ ไม่มีใบลาค้างอนุมัติในระบบของคุณในขณะนี้", accessToken);
    } else {
      const pendingFlex = buildPendingLeavesFlex(user, pendingLeaves.slice(0, 5));
      await replyMessage(replyToken, [pendingFlex], accessToken);
    }
  } 
  else {
    // Default Portal Menu reply
    const portalFlex = buildPortalFlex(user);
    await replyMessage(replyToken, [portalFlex], accessToken);
  }
}

async function handlePostbackEvent(event: any, replyToken: string, lineUserId: string, accessToken: string) {
  const { data: user } = await supabase
    .from("profiles")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (!user) {
    const notConnectedFlex = buildNotConnectedFlex();
    await replyMessage(replyToken, [notConnectedFlex], accessToken);
    return;
  }

  const params = parseQueryString(event.postback.data);
  const action = params.action;

  if (action === "portal") {
    const portalFlex = buildPortalFlex(user);
    await replyMessage(replyToken, [portalFlex], accessToken);
  } 
  else if (action === "check_quota") {
    const quotaFlex = await buildLeaveQuotaFlex(user);
    await replyMessage(replyToken, [quotaFlex], accessToken);
  } 
  else if (action === "check_status") {
    const latestLeave = await getLatestLeaveRequest(user.id);
    if (!latestLeave) {
      await replyTextMessage(replyToken, "ℹ️ ไม่พบประวัติการยื่นใบลาของคุณในระบบ", accessToken);
    } else {
      const statusFlex = buildLeaveStatusFlex(user, latestLeave);
      await replyMessage(replyToken, [statusFlex], accessToken);
    }
  } 
  else if (action === "pending_leaves") {
    const isManager = ["admin", "approver", "supervisor", "checker"].includes(user.role);
    if (!isManager) {
      await replyTextMessage(replyToken, "🔒 ฟังก์ชันนี้เฉพาะหัวหน้างานหรือฝ่ายอนุมัติเท่านั้นครับ", accessToken);
      return;
    }

    const pendingLeaves = await getPendingLeaves(user);
    if (pendingLeaves.length === 0) {
      await replyTextMessage(replyToken, "✅ ไม่มีใบลาค้างอนุมัติในระบบของคุณในขณะนี้", accessToken);
    } else {
      const pendingFlex = buildPendingLeavesFlex(user, pendingLeaves.slice(0, 5));
      await replyMessage(replyToken, [pendingFlex], accessToken);
    }
  }
}

async function handleFollowEvent(event: any, replyToken: string, lineUserId: string, accessToken: string) {
  const { data: user } = await supabase
    .from("profiles")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (user) {
    const portalFlex = buildPortalFlex(user);
    await replyMessage(replyToken, [
      { type: "text", text: "ยินดีต้อนรับกลับเข้าสู่ระบบบันทึกการลาออนไลน์ครับ 😊" },
      portalFlex
    ], accessToken);
  } else {
    const welcomeFlex = buildNotConnectedFlex();
    await replyMessage(replyToken, [welcomeFlex], accessToken);
  }
}

// ── DATABASE HELPER FUNCTIONS ──────────────────────────────────────
async function getSetting(key: string): Promise<string> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return !error && data ? data.value : "";
}

async function getLatestLeaveRequest(userId: string) {
  const { data, error } = await supabase
    .from("leaves")
    .select("*")
    .eq("requester_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !error ? data : null;
}

async function getPendingLeaves(user: any) {
  let query = supabase.from("leaves").select("*, requester:profiles(full_name, department)");
  
  if (user.role === "checker") {
    query = query.eq("status", "pending");
  } else if (user.role === "supervisor") {
    query = query.eq("status", "checked");
  } else if (user.role === "approver") {
    query = query.eq("status", "reviewed");
  } else if (user.role === "admin") {
    query = query.in("status", ["pending", "checked", "reviewed"]);
  } else {
    return [];
  }

  const { data } = await query.order("created_at", { ascending: true });
  return data || [];
}

// ── LINE HTTP CLIENT POSTS ─────────────────────────────────────────
async function replyMessage(replyToken: string, messages: any[], accessToken: string) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!res.ok) {
    console.error("LINE Reply API error response:", await res.text());
  }
}

async function replyTextMessage(replyToken: string, text: string, accessToken: string) {
  await replyMessage(replyToken, [{ type: "text", text }], accessToken);
}

function parseQueryString(str: string): Record<string, string> {
  const obj: Record<string, string> = {};
  if (!str) return obj;
  const pairs = str.split("&");
  for (const pair of pairs) {
    const parts = pair.split("=");
    if (parts.length === 2) {
      obj[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    }
  }
  return obj;
}

// ── FLEX MESSAGE TEMPLATES ─────────────────────────────────────────

function buildPortalFlex(user: any) {
  const isManager = ["admin", "approver", "supervisor", "checker"].includes(user.role);
  
  const bubble: any = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#4f46e5",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "บริษัท เอวริณทร์ อินเตอร์กรุ๊ป จำกัด", color: "#c7d2fe", size: "xs", weight: "bold" },
        { type: "text", text: "เมนูหลักระบบจัดการการลา", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          spacing: "md",
          contents: [
            {
              type: "box",
              layout: "vertical",
              width: "48px",
              height: "48px",
              cornerRadius: "24px",
              backgroundColor: "#e0e7ff",
              contents: [
                { type: "text", text: "👤", size: "xl", align: "center", gravity: "center" }
              ]
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                { type: "text", text: user.full_name, weight: "bold", size: "md", color: "#111827" },
                { type: "text", text: `${user.position || "พนักงาน"}${user.department ? ` (${user.department})` : ""}`, size: "xs", color: "#6b7280" }
              ]
            }
          ]
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#6366f1",
              height: "sm",
              action: { type: "postback", label: "📊 เช็กสิทธิ์วันลาคงเหลือ", data: "action=check_quota" }
            },
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              margin: "sm",
              action: { type: "postback", label: "🔍 ติดตามสถานะใบลาล่าสุด", data: "action=check_status" }
            }
          ]
        }
      ]
    }
  };

  if (isManager) {
    bubble.body.contents[2].contents.push({
      type: "button",
      style: "primary",
      color: "#10b981",
      height: "sm",
      margin: "sm",
      action: { type: "postback", label: "📥 พิจารณาใบลาค้างอนุมัติ", data: "action=pending_leaves" }
    });
  }

  // Fallback links
  const webUrl = supabaseUrl.replace(".supabase.co", ""); // Get clean site domain root or configure custom domain
  bubble.body.contents[2].contents.push({
    type: "button",
    style: "link",
    height: "sm",
    margin: "sm",
    action: { type: "uri", label: "🌐 เปิดระบบเว็บพอร์ทัล", uri: "https://github.com" } // Replace placeholder or let user browse
  });

  return {
    type: "flex",
    altText: "เมนูหลักระบบจัดการการลา",
    contents: bubble
  };
}

function buildNotConnectedFlex() {
  const bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#ef4444",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "ยังไม่ได้เชื่อมต่อบัญชี", color: "#fca5a5", size: "xs", weight: "bold" },
        { type: "text", text: "โปรดเชื่อมต่อระบบลาก่อนใช้งาน", color: "#ffffff", size: "md", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "เพื่อส่งการแจ้งเตือนและตรวจสอบสถานะการลาผ่านไลน์ได้ฟรี โปรดดำเนินการดังนี้:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          backgroundColor: "#f9fafb",
          paddingAll: "12px",
          cornerRadius: "8px",
          contents: [
            { type: "text", text: "1. เข้าสู่ระบบเว็บบันทึกการลา", size: "xs", color: "#4b5563" },
            { type: "text", text: "2. คัดลอกรหัสเชื่อมต่อ LINE (เช่น 123456)", size: "xs", color: "#4b5563" },
            { type: "text", text: "3. ส่งรหัสเชื่อมต่อมาในห้องแชทแอลเอสบอตนี้", size: "xs", color: "#4b5563" }
          ]
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "กรุณาเชื่อมต่อบัญชีก่อนใช้งานระบบ",
    contents: bubble
  };
}

function buildConnectSuccessFlex(user: any) {
  const roleNames: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    approver: "ฝ่ายบุคคล (ผู้อนุมัติ)",
    supervisor: "หัวหน้างาน",
    checker: "ธุรการตรวจสอบ",
    employee: "พนักงาน"
  };

  const bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10b981",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "LMS Notification Setup", color: "#a7f3d0", size: "xs", weight: "bold" },
        { type: "text", text: "เชื่อมต่อบัญชีสำเร็จแล้ว! 🎉", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "ยินดีต้อนรับเข้าสู่ระบบจัดการใบลา บัญชีคุณถูกตั้งค่าแล้ว:",
          wrap: true,
          size: "sm",
          color: "#374151"
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#f0fdf4",
          paddingAll: "14px",
          cornerRadius: "10px",
          contents: [
            { type: "text", text: `👤 ชื่อ: ${user.full_name}`, size: "sm", weight: "bold", color: "#065f46" },
            { type: "text", text: `💼 ตำแหน่ง: ${user.position || "พนักงาน"}`, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: `🏢 แผนก: ${user.department || "ทั่วไป"}`, size: "xs", color: "#047857", margin: "xs" },
            { type: "text", text: `🔑 สิทธิ์ระบบ: ${roleNames[user.role] || user.role}`, size: "xs", color: "#047857", margin: "xs" }
          ]
        },
        {
          type: "button",
          style: "primary",
          color: "#059669",
          height: "sm",
          action: { type: "postback", label: "📱 ไปยังเมนูหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "เชื่อมต่อบัญชีไลน์สำเร็จแล้ว!",
    contents: bubble
  };
}

async function buildLeaveQuotaFlex(user: any) {
  const currentFy = new Date().getFullYear();
  
  // Retrieve settings
  const limitSick = Number(await getSetting("limit_sick") || 30);
  const limitPersonal = Number(await getSetting("limit_personal") || 6);
  const limitAnnual = Number(await getSetting("limit_annual") || 10);
  const limitMaternity = Number(await getSetting("limit_maternity") || 10);

  const limits: Record<string, number> = {
    sick: limitSick,
    personal: limitPersonal,
    annual: limitAnnual,
    maternity: limitMaternity
  };

  // Retrieve user leaves totals
  const { data: leaves } = await supabase
    .from("leaves")
    .select("days, leave_type")
    .eq("requester_id", user.id)
    .eq("fiscal_year", currentFy)
    .in("status", ["approved", "pending", "checked", "reviewed"]);

  const totals: Record<string, number> = { sick: 0, personal: 0, annual: 0, maternity: 0 };
  if (leaves) {
    leaves.forEach(lv => {
      totals[lv.leave_type] = (totals[lv.leave_type] || 0) + Number(lv.days || 0);
    });
  }

  const rows: any[] = [];
  const types = [
    { key: "sick", label: "ลาป่วย", icon: "🤢", color: "#3b82f6" },
    { key: "personal", label: "ลากิจส่วนตัว", icon: "💼", color: "#f59e0b" },
    { key: "annual", label: "ลาพักร้อน", icon: "🏖️", color: "#10b981" }
  ];

  types.forEach(t => {
    const used = totals[t.key] || 0;
    const limit = limits[t.key] || 0;
    const remaining = Math.max(0, limit - used);
    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    rows.push({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `${t.icon} ${t.label}`, weight: "bold", size: "sm", color: "#1f2937" },
            { type: "text", text: `${remaining} / ${limit} วัน`, align: "end", size: "sm", weight: "bold", color: t.color }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#e5e7eb",
          height: "8px",
          cornerRadius: "4px",
          margin: "sm",
          contents: [
            {
              type: "box",
              layout: "vertical",
              backgroundColor: t.color,
              width: `${Math.max(1, percent)}%`,
              height: "100%",
              cornerRadius: "4px",
              contents: []
            }
          ]
        },
        {
          type: "text",
          text: `ใช้ไปแล้ว ${used} วัน (${percent}%) คงเหลือ ${remaining} วัน`,
          size: "xxs",
          color: "#9ca3af",
          align: "end"
        }
      ]
    });
  });

  const bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#3b82f6",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "Leave Quota Summary", color: "#93c5fd", size: "xs", weight: "bold" },
        { type: "text", text: `สิทธิ์วันลาคงเหลือปี ${currentFy + 543}`, color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        { type: "text", text: "สรุปประวัติคำขอลาที่สะสมอยู่ในปีงบประมาณ:", size: "xs", color: "#6b7280" },
        {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: rows
        },
        { type: "separator", margin: "lg" },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              action: { type: "postback", label: "⬅️ กลับเมนูหลัก", data: "action=portal" }
            }
          ]
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "สิทธิ์วันลาคงเหลือของคุณ",
    contents: bubble
  };
}

function buildLeaveStatusFlex(user: any, lv: any) {
  const typeLabels: Record<string, string> = { sick: "ลาป่วย", personal: "ลากิจส่วนตัว", annual: "ลาพักร้อน", maternity: "ลาคลอดบุตร" };
  const statusLabels: Record<string, string> = {
    draft: "ฉบับร่าง",
    pending: "รอตรวจสอบ",
    checked: "รอหัวหน้างาน",
    reviewed: "รอฝ่ายบุคคล",
    approved: "อนุมัติแล้ว",
    rejected: "ไม่อนุมัติ",
    cancelled: "ยกเลิก"
  };

  const statusColors: Record<string, string> = {
    pending: "#d97706",
    checked: "#0284c7",
    reviewed: "#4f46e5",
    approved: "#059669",
    rejected: "#dc2626",
    cancelled: "#64748b",
    draft: "#64748b"
  };

  const formatPeriod = (start: string, end: string, unit: string, sTime?: string, eTime?: string) => {
    if (unit === "hour" && sTime) {
      return `${start} (${sTime} - ${eTime})`;
    }
    return start === end ? start : `${start} ถึง ${end}`;
  };

  const bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: statusColors[lv.status] || "#64748b",
      paddingAll: "20px",
      contents: [
        { type: "text", text: `คำขอลาเลขที่ ${lv.leave_no}`, color: "#ffffff", opacity: 0.8, size: "xs", weight: "bold" },
        { type: "text", text: `สถานะ: ${statusLabels[lv.status]}`, color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "ผู้ขอลา", size: "sm", color: "#6b7280", flex: 2 },
            { type: "text", text: user.full_name, size: "sm", color: "#111827", flex: 4, weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "ประเภท", size: "sm", color: "#6b7280", flex: 2 },
            { type: "text", text: typeLabels[lv.leave_type] || lv.leave_type, size: "sm", color: "#111827", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "ระยะเวลา", size: "sm", color: "#6b7280", flex: 2 },
            { type: "text", text: formatPeriod(lv.start_date, lv.end_date, lv.leave_unit, lv.start_time, lv.end_time), size: "sm", color: "#111827", flex: 4, wrap: true }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "จำนวน", size: "sm", color: "#6b7280", flex: 2 },
            { type: "text", text: `${lv.days} วัน (${lv.hours || 0} ชม.)`, size: "sm", color: "#111827", flex: 4, weight: "bold" }
          ]
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "เหตุผล", size: "sm", color: "#6b7280", flex: 2 },
            { type: "text", text: lv.reason || "-", size: "sm", color: "#111827", flex: 4, wrap: true }
          ]
        },
        { type: "separator", margin: "md" },
        {
          type: "button",
          style: "secondary",
          color: "#f3f4f6",
          height: "sm",
          margin: "sm",
          action: { type: "postback", label: "⬅️ กลับเมนูหลัก", data: "action=portal" }
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "สถานะใบลาล่าสุดของคุณ",
    contents: bubble
  };
}

function buildPendingLeavesFlex(user: any, leaves: any[]) {
  const typeLabels: Record<string, string> = { sick: "ลาป่วย", personal: "ลากิจส่วนตัว", annual: "ลาพักร้อน", maternity: "ลาคลอดบุตร" };

  const cards = leaves.map(lv => {
    const name = lv.requester ? lv.requester.full_name : "ไม่ระบุ";
    
    return {
      type: "box",
      layout: "vertical",
      backgroundColor: "#f9fafb",
      paddingAll: "14px",
      cornerRadius: "8px",
      borderWidth: "1px",
      borderColor: "#e5e7eb",
      margin: "sm",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: `ใบลา ${lv.leave_no}`, weight: "bold", size: "xs", color: "#4f46e5" },
            { type: "text", text: `${lv.days} วัน`, align: "end", size: "xs", weight: "bold", color: "#111827" }
          ]
        },
        { type: "text", text: `ผู้ขอ: ${name}`, size: "sm", color: "#374151", margin: "xs", weight: "bold" },
        { type: "text", text: `ประเภท: ${typeLabels[lv.leave_type] || lv.leave_type} | เหตุผล: ${lv.reason || "-"}`, size: "xs", color: "#6b7280", margin: "xs", wrap: true },
        { type: "text", text: `วันที่ลา: ${lv.start_date === lv.end_date ? lv.start_date : `${lv.start_date} ~ ${lv.end_date}`}`, size: "xxs", color: "#9ca3af", margin: "xs" }
      ]
    };
  });

  const bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#10b981",
      paddingAll: "20px",
      contents: [
        { type: "text", text: "Approver Action Center", color: "#a7f3d0", size: "xs", weight: "bold" },
        { type: "text", text: "รายการค้างอนุมัติสะสม", color: "#ffffff", size: "lg", weight: "bold", margin: "xs" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      contents: [
        { type: "text", text: `มีรายการรอความเห็น/อนุมัติจำนวน ${leaves.length} ใบ (แสดงสูงสุด 5 ใบ):`, size: "xs", color: "#6b7280" },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          contents: cards
        },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "โปรดเข้าสู่ระบบเว็บพอร์ทัลเพื่อทำรายการ อนุมัติ/ปฏิเสธ คำขออย่างเป็นทางการ",
          size: "xxs",
          color: "#9ca3af",
          wrap: true,
          align: "center"
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "secondary",
              color: "#f3f4f6",
              height: "sm",
              action: { type: "postback", label: "⬅️ กลับเมนูหลัก", data: "action=portal" }
            }
          ]
        }
      ]
    }
  };

  return {
    type: "flex",
    altText: "รายการใบลาที่รอการอนุมัติสะสม",
    contents: bubble
  };
}
