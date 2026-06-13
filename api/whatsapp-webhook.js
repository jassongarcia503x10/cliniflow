// ============================================================
// CLINIFLOW - WEBHOOK 360DIALOG
// Version 4.0 — State Machine Real
// FIX 1: Historial de mensajes a Claude (no solo system prompt)
// FIX 2: upsertContext con URL correcta para Supabase
// FIX 3: Language lock robusto con fallback
// FIX 4: Multiple intents (booking + urgency simultáneos)
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;
const CEO_PHONE = process.env.CEO_PHONE;
const WHATSAPP_WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET;
const WHATSAPP_CLINIC_ID = process.env.WHATSAPP_CLINIC_ID;
const WHATSAPP_BASIC_AUTH_USER = process.env.WHATSAPP_BASIC_AUTH_USER;
const WHATSAPP_BASIC_AUTH_PASSWORD = process.env.WHATSAPP_BASIC_AUTH_PASSWORD;
const crypto = require('crypto');

const processedMessages = new Set();

// ─── LANGUAGE — bloqueado y robusto ──────────────────────────

const LANG_PATTERNS = {
  es: /\b(hola|gracias|buenos|quiero|tengo|cita|dentista|me gustaria|cuanto|limpieza|para el|del|miercoles|lunes|martes|jueves|viernes|sabado|de la|mañana|tarde|próximo|siguiente|quiero|necesito|precio|cuesta|me duele|dolor)\b/i,
  hr: /\b(hvala|zelim|zubar|dobar|molim|liječnik|zub|bol|hitno|termin)\b/i,
  de: /\b(hallo|danke|ich|zahnarzt|bitte|termin|schmerzen)\b/i,
  fr: /\b(bonjour|merci|je veux|dentiste|rendez-vous|douleur)\b/i,
  pt: /\b(ola|obrigado|quero|dentista|consulta|dor)\b/i,
};

function detectLanguage(text) {
  for (const [lang, pattern] of Object.entries(LANG_PATTERNS)) {
    if (pattern.test(text)) return lang;
  }
  return 'en';
}

// Lock: nunca cambia una vez establecido
function getLockedLang(context, detected) {
  const locked = context?.context_json?.locked_lang;
  if (locked && locked !== 'en') return locked; // preferir idioma detectado previamente
  return detected || 'es'; // default español
}

// ─── URGENCY ──────────────────────────────────────────────────

const URGENCY_KEYWORDS = [
  'dolor intenso','sangrado','emergencia','urgente','accidente',
  'fractura','hinchado','fiebre','me desmaye','golpe','me cai',
  'me duele','duele mucho','mucho dolor','dolor de muela',
  'severe pain','bleeding','emergency','urgent','accident',
  'fracture','swollen','fever','fainted','toothache',
  'hitno','bol','krvarenje','jako boli',
  'dringend','schmerzen','blutung','notfall',
];

const LIFE_THREATENING = [
  'no respira','not breathing','perdida de conocimiento',
  'unconscious','sangrado severo','severe bleeding',
];

function detectUrgency(text) {
  const t = text.toLowerCase();
  if (LIFE_THREATENING.some(kw => t.includes(kw))) return 'life_threatening';
  if (URGENCY_KEYWORDS.some(kw => t.includes(kw))) return 'urgent';
  return 'normal';
}

// ─── EXTRACT BOOKING DATA ─────────────────────────────────────

function extractBookingData(message, current = {}) {
  const m = message.toLowerCase();
  const d = { ...current };

  // Tratamientos (múltiples)
  const found = [];
  if (/limpieza|cleaning|čišćenje|profilaxis/.test(m))  found.push('Limpieza dental');
  if (/implante|implant|implantati/.test(m))             found.push('Implantes');
  if (/blanquea|whiten|izbjeljivanje/.test(m))           found.push('Blanqueamiento');
  if (/ortodoncia|ortodoncija|braces|brackets/.test(m))  found.push('Ortodoncia');
  if (/empaste|filling|plomba/.test(m))                  found.push('Empaste');
  if (/corona|crown|krunica/.test(m))                    found.push('Corona dental');
  if (/endodoncia|conducto|root canal/.test(m))          found.push('Endodoncia');
  if (/consulta|revision|checkup|pregled/.test(m))       found.push('Consulta general');

  if (found.length > 0) {
    const prev = d.treatments ? d.treatments.split(', ') : (d.treatment ? [d.treatment] : []);
    const combined = [...new Set([...prev, ...found])];
    d.treatment  = combined[0];
    d.treatments = combined.join(', ');
  }

  // Día
  if (!d.day) {
    if (/lunes|monday/.test(m))             d.day = 'lunes';
    else if (/martes|tuesday/.test(m))       d.day = 'martes';
    else if (/miercoles|miércoles|wednesday/.test(m)) d.day = 'miércoles';
    else if (/jueves|thursday/.test(m))      d.day = 'jueves';
    else if (/viernes|friday/.test(m))       d.day = 'viernes';
    else if (/sabado|sábado|saturday/.test(m)) d.day = 'sábado';
    else if (/\bhoy\b|today/.test(m))        d.day = 'hoy';
    else if (/mañana|manana|tomorrow/.test(m)) d.day = 'mañana';
  }

  // Hora
  if (!d.time) {
    const tMatch = m.match(/(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|de la tarde|de la mañana|h\b|:00)?/);
    if (tMatch && parseInt(tMatch[1]) >= 7 && parseInt(tMatch[1]) <= 20) {
      let hour = parseInt(tMatch[1]);
      if (/tarde|pm/.test(m) && hour < 12) hour += 12;
      const mins = tMatch[2] || '00';
      d.time = `${hour}:${mins}`;
    }
  }

  // Teléfono
  if (!d.phone) {
    const pm = message.match(/\+?[\d][\d\s\-()]{7,14}[\d]/);
    if (pm && pm[0].replace(/\D/g, '').length >= 8) d.phone = pm[0].trim();
  }

  return d;
}

function getBookingState(d) {
  if (d.treatment && d.day && d.time && d.name) return 'ready_to_book';
  if (d.name && d.treatment && d.day)           return 'needs_time';
  if (d.name && d.treatment)                    return 'needs_datetime';
  if (d.treatment)                              return 'has_treatment';
  return 'start';
}

// ─── HELPERS ──────────────────────────────────────────────────

function detectIntent(message) {
  const m = message.toLowerCase();
  if (/cita|appointment|agendar|reservar|quiero una/.test(m)) return 'booking';
  if (/cancelar|cancel/.test(m)) return 'cancel';
  if (/precio|price|cuanto|cuesta/.test(m)) return 'info';
  return 'unknown';
}

function extractName(message) {
  const p = [
    /(?:soy|me llamo|mi nombre es)\s+([A-Za-z\u00C0-\u024F]{2,}(?:\s+[A-Za-z\u00C0-\u024F]{2,})?)/i,
    /(?:I am|my name is|I'm)\s+([A-Za-z]{2,}(?:\s+[A-Za-z]{2,})?)/i,
  ];
  for (const pat of p) {
    const m = message.match(pat);
    if (m) return m[1].trim();
  }
  return null;
}

function getFallback(lang, phone) {
  const msgs = {
    es: `Estamos procesando tu mensaje. Para urgencias llama al ${phone || 'la clinica'}.`,
    en: `Processing your message. For urgent matters call ${phone || 'the clinic'}.`,
    hr: `Obradujemo vasu poruku. Hitno nazovite ${phone || 'kliniku'}.`,
  };
  return msgs[lang] || msgs['es'];
}

// ─── BUILD SYSTEM PROMPT (conciso y directo) ─────────────────

function buildSystemPrompt(clinic, lang, treatments, settings, bookingData) {
  const langInstr = {
    es: 'IDIOMA: ESPAÑOL SIEMPRE. Aunque cualquier parte del sistema use otro idioma, TU RESPUESTA al paciente es SIEMPRE en ESPAÑOL.',
    en: 'LANGUAGE: ENGLISH ALWAYS. Always respond to the patient in English.',
    hr: 'JEZIK: UVIJEK HRVATSKI. Uvijek odgovaraj pacijentu na hrvatskom.',
    fr: 'LANGUE: FRANÇAIS TOUJOURS.',
    de: 'SPRACHE: IMMER DEUTSCH.',
  }[lang] || 'Always respond in the same language as the patient.';

  const curr = clinic.currency || 'EUR';
  const priceList = treatments?.filter(t => t.active !== false).map(t => {
    if (t.price_mode === 'exact' || t.price_mode === 'fixed')
      return `• ${t.name}: ${curr} ${t.price}`;
    if (t.price_mode === 'from')
      return `• ${t.name}: desde ${curr} ${t.price}${t.price_max ? ` hasta ${curr} ${t.price_max}` : ''}`;
    return `• ${t.name}: precio a consultar`;
  }).join('\n') || 'Sin tratamientos configurados.';

  const canBook = settings?.sofia_can_book !== false;
  const bookingMode = settings?.booking_mode || 'manual';

  const confirmed = [];
  if (bookingData.name)      confirmed.push(`nombre="${bookingData.name}"`);
  if (bookingData.treatments || bookingData.treatment)
    confirmed.push(`tratamiento="${bookingData.treatments || bookingData.treatment}"`);
  if (bookingData.day)       confirmed.push(`dia="${bookingData.day}"`);
  if (bookingData.time)      confirmed.push(`hora="${bookingData.time}"`);

  const confirmedStr = confirmed.length > 0
    ? `\nYA CONFIRMADO (NO volver a pedir): ${confirmed.join(', ')}`
    : '';

  const missing = [];
  if (!bookingData.treatment) missing.push('tratamiento');
  if (!bookingData.day)       missing.push('día');
  if (!bookingData.time)      missing.push('hora');
  if (!bookingData.name)      missing.push('nombre completo');

  // If the patient mentioned a treatment this clinic does not offer, ask for
  // clarification before advancing the booking state. Never invent services.
  let nextAsk;
  if (bookingData.unverified_treatment) {
    const available = treatments.filter(t => t.active !== false).map(t => t.name).join(', ');
    nextAsk = `ACLARACIÓN REQUERIDA: El paciente mencionó "${bookingData.unverified_treatment}" pero ese servicio NO está en tu lista. NO confirmes ese tratamiento ni inventes precios. Pregunta: "¿A cuál de nuestros servicios te refieres?" y lista los disponibles: ${available || 'ver servicios arriba'}.`;
  } else {
    nextAsk = missing.length > 0
      ? `SOLO PREGUNTA LO SIGUIENTE (una cosa a la vez): ${missing[0]}`
      : canBook
        ? `CONFIRMA LA CITA. Di: "${bookingMode === 'automatic' ? 'Cita confirmada para [datos].' : 'Solicitud registrada. El equipo te confirma por aquí.'}" y pregunta si necesita algo más.`
        : 'Pide que escriba RECEPCION para confirmar.';
  }

  return `Eres Sofia, recepcionista IA de ${clinic.name}.
ROL: Recepcionista dental profesional. Eficiente. Amable. Cierra citas.

${langInstr}

CLINICA: ${clinic.name} | Tel: ${clinic.phone} | ${clinic.hours_mon_fri || '09:00-18:00'} Lun-Vie
${confirmedStr}

SERVICIOS Y PRECIOS REALES:
${priceList}

REGLA PRECIOS: Si el tratamiento está arriba → da precio exacto. NUNCA digas "llama para precio".
REGLA AGENDAMIENTO: ${canBook ? 'Puedes agendar directamente. NUNCA digas "llama a la clinica" para agendar.' : 'Para agendar: escribe RECEPCION.'}

${nextAsk}

URGENCIAS: Si menciona dolor intenso/sangrado/accidente → "Urgente: llama al ${clinic.phone}. Emergencias: 112."
RECEPCION: Si escribe esa palabra → notifica que el equipo le contactará.
ESTILO: Máximo 3 oraciones. Una pregunta al final.`;
}

// ─── BUILD CONVERSATION HISTORY PARA CLAUDE ──────────────────
// Este es el FIX principal — Claude recibe el historial real

function buildConversationHistory(summary) {
  if (!summary) return [];

  const lines = summary.split('\n').filter(Boolean);
  const messages = [];

  for (const line of lines) {
    const match = line.match(/^P: (.+?) \| S: (.+)$/);
    if (match) {
      messages.push({ role: 'user',      content: match[1] });
      messages.push({ role: 'assistant', content: match[2] });
    }
  }

  return messages;
}

// ─── LOG EVENT ────────────────────────────────────────────────

async function logEvent(step, data = {}, phone = null) {
  try {
    const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/webhook_logs';
    await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        step, phone: phone || null,
        data: typeof data === 'string' ? { message: data } : data,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) { /* silencioso */ }
}

// ─── SUPABASE ─────────────────────────────────────────────────

async function sbGet(path) {
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error('SB GET ' + res.status + ': ' + text.substring(0, 150));
  return text ? JSON.parse(text) : null;
}

async function sbPost(path, body, prefer) {
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) console.error('[sbPost]', res.status, text.substring(0, 150));
  return text ? JSON.parse(text) : null;
}

// FIX: upsertContext con URL correcta para Supabase PostgREST
async function upsertContext(clinicId, phone, updates) {
  try {
    // URL con on_conflict para upsert correcto en PostgREST
    const url = SUPABASE_URL.replace(/\/$/, '') +
      '/rest/v1/conversation_context?on_conflict=clinic_id,phone';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        clinic_id: clinicId,
        phone,
        ...updates,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error('[upsertContext] error:', res.status, t.substring(0, 150));
    }
  } catch (e) {
    console.error('[upsertContext] exception:', e.message);
  }
}

function webhookAuthConfigured() {
  return Boolean(
    WHATSAPP_CLINIC_ID &&
    (
      WHATSAPP_WEBHOOK_SECRET ||
      (WHATSAPP_BASIC_AUTH_USER && WHATSAPP_BASIC_AUTH_PASSWORD)
    )
  );
}

function webhookAuthMatches(req) {
  const headerSecret = req.headers['x-webhook-secret'];
  const authHeader = req.headers.authorization || '';
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const querySecret = req.query?.secret;
  return basicAuthMatches(authHeader) ||
    secretMatches(headerSecret) ||
    secretMatches(bearerSecret) ||
    secretMatches(querySecret);
}

function secretMatches(candidate) {
  if (!WHATSAPP_WEBHOOK_SECRET || typeof candidate !== 'string') return false;
  const expected = Buffer.from(WHATSAPP_WEBHOOK_SECRET);
  const received = Buffer.from(candidate);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function basicAuthMatches(authHeader) {
  if (!WHATSAPP_BASIC_AUTH_USER || !WHATSAPP_BASIC_AUTH_PASSWORD) return false;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return constantTimeMatches(user, WHATSAPP_BASIC_AUTH_USER) &&
      constantTimeMatches(password, WHATSAPP_BASIC_AUTH_PASSWORD);
  } catch (e) {
    return false;
  }
}

function constantTimeMatches(candidate, expectedValue) {
  const expected = Buffer.from(expectedValue);
  const received = Buffer.from(candidate);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function getClinic() {
  if (!WHATSAPP_CLINIC_ID) return null;
  const data = await sbGet(
    'clinics?select=*&id=eq.' + encodeURIComponent(WHATSAPP_CLINIC_ID) + '&active=eq.true&limit=1'
  );
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function getTreatments(clinicId) {
  try {
    const d = await sbGet(`treatments?select=*&clinic_id=eq.${clinicId}&active=eq.true&order=name.asc`);
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}

// Returns the matching active clinic treatment for a detected name, or null.
// Stage 1 (regex in extractBookingData) detects intent; this is Stage 2 —
// confirming the clinic actually offers the service before booking proceeds.
function matchClinicTreatment(detected, clinicTreatments) {
  if (!detected || !clinicTreatments || clinicTreatments.length === 0) return null;
  const needle = detected.toLowerCase();
  return clinicTreatments.find(t =>
    t.name.toLowerCase().includes(needle) ||
    needle.includes(t.name.toLowerCase())
  ) || null;
}

async function getSettings(clinicId) {
  try {
    const d = await sbGet(`clinic_settings?select=*&clinic_id=eq.${clinicId}&limit=1`);
    return Array.isArray(d) && d.length > 0 ? d[0] : null;
  } catch (e) { return null; }
}

async function getContext(clinicId, phone) {
  try {
    const d = await sbGet(
      `conversation_context?select=*&clinic_id=eq.${clinicId}&phone=eq.${encodeURIComponent(phone)}&limit=1`
    );
    return Array.isArray(d) && d.length > 0 ? d[0] : null;
  } catch (e) { return null; }
}

async function saveMessage(clinicId, phone, message, response, type) {
  try {
    await sbPost('messages', {
      clinic_id: clinicId, patient_phone: phone,
      patient_message: message, sofia_response: response,
      response_type: type || 'ai', created_at: new Date().toISOString(),
    });
  } catch (e) { /* silencioso */ }
}

async function saveLead(clinicId, phone, name, treatment) {
  try {
    await sbPost('leads', {
      clinic_id: clinicId, patient_name: name || 'Paciente WhatsApp',
      phone, source: 'whatsapp', status: 'nuevo',
      treatment_interest: treatment, created_at: new Date().toISOString(),
    });
  } catch (e) { /* silencioso */ }
}

async function saveBooking(clinic, bookingData, mode) {
  const payload = {
    clinic_id:      clinic.id,
    patient_name:   bookingData.name || 'Paciente WhatsApp',
    patient_phone:  bookingData.phone || 'no proporcionado',
    treatment:      bookingData.treatments || bookingData.treatment || 'Consulta',
    requested_day:  bookingData.day || 'por confirmar',
    requested_time: bookingData.time || 'por confirmar',
    status:         'pending',
  };

  if (mode === 'automatic') {
    await sbPost('appointments', {
      ...payload,
      appointment_date: payload.requested_day,
      appointment_time: payload.requested_time,
      status: 'confirmed',
      source: 'whatsapp',
      confirmed_by: 'sofia',
      confirmed_at: new Date().toISOString(),
    });
    await logEvent('APPOINTMENT_CONFIRMED', payload, bookingData.phone);
  } else {
    await sbPost('pending_bookings', payload);
    await logEvent('BOOKING_PENDING', payload, bookingData.phone);

    // Notificar al director
    if (clinic.director_phone) {
      const msg = `📅 Nueva solicitud en ${clinic.name}:
• ${payload.patient_name} | ${payload.patient_phone}
• ${payload.treatment}
• ${payload.requested_day} a las ${payload.requested_time}`;
      try { await sendMessage(clinic.director_phone, msg); } catch (e) { /* silencioso */ }
    }
  }
}

// ─── SEND WHATSAPP ────────────────────────────────────────────

async function sendMessage(to, body) {
  const res = await fetch('https://waba-v2.360dialog.io/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'D360-API-KEY': DIALOG360_API_KEY },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to, type: 'text', text: { body }
    }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error('360dialog ' + res.status + ': ' + t.substring(0, 150));
  return JSON.parse(t);
}

// ─── CLAUDE CON HISTORIAL ─────────────────────────────────────
// FIX PRINCIPAL: enviamos el historial real de conversación

async function callClaude(systemPrompt, conversationHistory, currentMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  // Construir mensajes: historial previo + mensaje actual
  const messages = [
    ...conversationHistory,
    { role: 'user', content: currentMessage }
  ];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('Claude ' + res.status + ': ' + err.substring(0, 150));
    }
    const data = await res.json();
    return data.content[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────

module.exports = async function handler(req, res) {

  if (req.method === 'GET') {
    const challenge = req.query['hub.challenge'];
    const verifyToken = req.query['hub.verify_token'];
    if (challenge && (webhookAuthMatches(req) || secretMatches(verifyToken))) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!webhookAuthConfigured()) {
    return res.status(503).json({ error: 'Webhook security not configured' });
  }
  if (!webhookAuthMatches(req)) {
    return res.status(401).json({ error: 'Invalid webhook authentication' });
  }

  try {
    const body = req.body;
    let phone = null, message = null, contactName = null, messageId = null;

    if (body?.entry?.[0]?.changes?.[0]?.value?.messages) {
      const value = body.entry[0].changes[0].value;
      const msg = value.messages[0];
      if (msg.type !== 'text') return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = value?.contacts?.[0]?.profile?.name;
      messageId = msg.id;
    } else if (body?.messages?.[0]) {
      const msg = body.messages[0];
      if (msg.type !== 'text') return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = body?.contacts?.[0]?.profile?.name;
      messageId = msg.id;
    } else {
      return res.status(200).json({ status: 'ok', note: 'status update' });
    }

    if (!phone || !message) return res.status(200).json({ status: 'ok', note: 'missing data' });

    // Deduplicación
    if (messageId && processedMessages.has(messageId)) {
      return res.status(200).json({ status: 'ok', note: 'duplicate' });
    }
    if (messageId) {
      processedMessages.add(messageId);
      if (processedMessages.size > 1000) processedMessages.clear();
    }

    await logEvent('WEBHOOK_RECEIVED', { msg: message.substring(0, 50) }, phone);

    const rawLang  = detectLanguage(message);
    const urgency  = detectUrgency(message);

    let clinic = null;
    try { clinic = await getClinic(); } catch (e) { /* handled below */ }
    if (!clinic) {
      await sendMessage(phone, getFallback(rawLang, null));
      return res.status(200).json({ status: 'ok', error: 'no clinic' });
    }

    const [context, treatments, settings] = await Promise.all([
      getContext(clinic.id, phone),
      getTreatments(clinic.id),
      getSettings(clinic.id),
    ]);

    // Idioma bloqueado
    const lang = getLockedLang(context, rawLang);

    // Estado previo de reserva
    const prevData = {
      name:       context?.patient_name || null,
      treatment:  context?.context_json?.booking_treatment || null,
      treatments: context?.context_json?.booking_treatments || null,
      day:        context?.context_json?.booking_day || null,
      time:       context?.context_json?.booking_time || null,
      phone:      context?.context_json?.booking_phone || null,
    };

    // Extraer nuevos datos
    const bookingData = extractBookingData(message, prevData);
    if (!bookingData.name && contactName) bookingData.name = contactName;
    if (!bookingData.name) bookingData.name = extractName(message);

    // Stage 2 treatment validation: only accept treatments this clinic offers.
    // extractBookingData detects intent via regex (Stage 1); here we confirm the
    // clinic actually offers the service before the booking state advances.
    if (bookingData.treatment && bookingData.treatment !== prevData.treatment) {
      const matched = matchClinicTreatment(bookingData.treatment, treatments);
      if (!matched) {
        // Mark as unverified so Sofia asks for clarification; do not advance state.
        bookingData.unverified_treatment = bookingData.treatment;
        bookingData.treatment  = prevData.treatment  || null;
        bookingData.treatments = prevData.treatments || null;
      }
    }

    const state = getBookingState(bookingData);

    await logEvent('MESSAGE_PARSED', {
      lang, urgency, state,
      confirmed: Object.entries(bookingData).filter(([,v])=>v).map(([k])=>k),
    }, phone);

    // ── URGENCIA VITAL ────────────────────────────────────────
    if (urgency === 'life_threatening') {
      await sendMessage(phone, lang === 'es'
        ? 'Llama al 112 ahora. Esto es una emergencia medica.'
        : 'Call 112 now. This is a medical emergency.');
      await saveMessage(clinic.id, phone, message, 'EMERGENCY_REDIRECT', 'emergency');
      return res.status(200).json({ status: 'ok', action: 'emergency' });
    }

    // ── RECEPCION ─────────────────────────────────────────────
    if (/^recepcion|reception$/i.test(message.trim())) {
      const humanMsg = lang === 'es'
        ? `Perfecto! El equipo de ${clinic.name} te contactará pronto por este chat.`
        : `Got it! ${clinic.name} team will contact you shortly.`;
      await sendMessage(phone, humanMsg);
      await saveMessage(clinic.id, phone, message, humanMsg, 'human_redirect');
      return res.status(200).json({ status: 'ok', action: 'human_redirect' });
    }

    // ── URGENCIA MÉDICA + BOOKING SIMULTÁNEOS ─────────────────
    // Mantiene la reserva pero avisa de la urgencia
    if (urgency === 'urgent') {
      const urgentMsg = lang === 'es'
        ? `Entiendo que hay un dolor. Para atención inmediata llama al ${clinic.phone}. Si prefieres, puedo agendarte una cita urgente. ¿Qué prefieres?`
        : `I understand there's pain. For immediate care call ${clinic.phone}. Or I can book you an urgent appointment. What do you prefer?`;
      await sendMessage(phone, urgentMsg);
      await saveMessage(clinic.id, phone, message, urgentMsg, 'urgent');
      // NO reiniciar booking data — mantener lo que ya se confirmó
    } else {
      // ── GUARDAR RESERVA SI ESTÁ LISTA ─────────────────────────
      let bookingResult = null;
      if (state === 'ready_to_book' && settings?.sofia_can_book !== false) {
        const bookingMode = settings?.booking_mode || 'manual';
        const lastBooking = context?.context_json?.last_booking_at;
        const tooRecent = lastBooking &&
          (Date.now() - new Date(lastBooking).getTime()) < 60000;

        if (!tooRecent) {
          try {
            await saveBooking(clinic, { ...bookingData, phone: bookingData.phone || phone }, bookingMode);
            bookingResult = { mode: bookingMode };
          } catch (e) {
            await logEvent('BOOKING_ERROR', { error: e.message }, phone);
          }
        }
      }

      // ── LLAMAR A CLAUDE CON HISTORIAL ─────────────────────────
      const systemPrompt = buildSystemPrompt(clinic, lang, treatments, settings, bookingData);
      const conversationHistory = buildConversationHistory(context?.summary_so_far);

      await logEvent('CLAUDE_START', { lang, state, history_len: conversationHistory.length }, phone);

      let sofiaResponse;
      try {
        sofiaResponse = await callClaude(systemPrompt, conversationHistory, message);
        await logEvent('CLAUDE_SUCCESS', { preview: sofiaResponse.substring(0, 80) }, phone);
      } catch (claudeError) {
        await logEvent('CLAUDE_ERROR', { error: claudeError.message }, phone);
        sofiaResponse = getFallback(lang, clinic.phone);
      }

      // Enviar
      await logEvent('SEND_WHATSAPP_START', {}, phone);
      try {
        await sendMessage(phone, sofiaResponse);
        await logEvent('SEND_WHATSAPP_SUCCESS', {}, phone);
      } catch (sendError) {
        await logEvent('SEND_WHATSAPP_ERROR', { error: sendError.message }, phone);
        return res.status(200).json({ status: 'ok', error: 'send failed' });
      }

      await saveMessage(clinic.id, phone, message, sofiaResponse, 'ai');

      // Actualizar resumen para historial futuro
      const entry = `P: ${message.substring(0, 80)} | S: ${sofiaResponse.substring(0, 80)}`;
      const newSummary = context?.summary_so_far
        ? context.summary_so_far.split('\n').slice(-4).concat(entry).join('\n')
        : entry;

      await upsertContext(clinic.id, phone, {
        patient_name: bookingData.name || context?.patient_name,
        last_intent:  detectIntent(message),
        summary_so_far: newSummary,
        message_count: (context?.message_count || 0) + 1,
        context_json: {
          ...(context?.context_json || {}),
          locked_lang:        lang,
          booking_state:      state,
          booking_treatment:  bookingData.treatment,
          booking_treatments: bookingData.treatments,
          booking_day:        bookingData.day,
          booking_time:       bookingData.time,
          booking_phone:      bookingData.phone,
          ...(bookingResult ? {
            last_booking_at: new Date().toISOString(),
            booking_state:   'booked',
          } : {}),
        },
      });

      if (!context) {
        await saveLead(clinic.id, phone, bookingData.name,
          bookingData.treatments || bookingData.treatment || 'Consulta General');
      }

      await logEvent('MESSAGE_PROCESSED_OK', { lang, state, booking: !!bookingResult }, phone);
    }

    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    await logEvent('CRITICAL_ERROR', { error: error.message, stack: error.stack?.substring(0, 300) });
    try {
      const phone = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
        || req.body?.messages?.[0]?.from;
      if (phone) await sendMessage(phone, 'Lo sentimos, intenta en unos minutos.');
    } catch (e) { /* silencioso */ }
    return res.status(200).json({ status: 'error', message: error.message });
  }
};
