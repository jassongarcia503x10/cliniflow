// ============================================================
// CLINIFLOW - WEBHOOK 360DIALOG
// Version 3.6 - FIX: sendMessage endpoint sin /v1/
// Unico cambio vs 3.5: waba-v2.360dialog.io/messages
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;
const CEO_PHONE = process.env.CEO_PHONE;

// ─── URGENCY KEYWORDS ────────────────────────────────────────────────────────

const URGENCY_KEYWORDS = [
  'dolor intenso','sangrado','emergencia','urgente','accidente',
  'fractura','hinchado','fiebre','me desmaye','golpe','me cai',
  'severe pain','bleeding','emergency','urgent','accident',
  'fracture','swollen','fever','fainted',
  'hitno','bol','krvarenje','nesreca',
  'dringend','schmerzen','blutung','notfall',
];

const LIFE_THREATENING = [
  'no respira','not breathing','perdida de conocimiento',
  'unconscious','sangrado severo','severe bleeding',
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function detectLanguage(text) {
  const t = text.toLowerCase();
  if (/\b(hola|gracias|buenos|quiero|tengo|cita|dentista)\b/.test(t)) return 'es';
  if (/\b(bonjour|merci|je veux)\b/.test(t)) return 'fr';
  if (/\b(hallo|danke|ich|zahnarzt)\b/.test(t)) return 'de';
  if (/\b(hvala|zelim|zubar|dobar)\b/.test(t)) return 'hr';
  return 'en';
}

function detectUrgency(text) {
  const t = text.toLowerCase();
  if (LIFE_THREATENING.some(kw => t.includes(kw))) return 'life_threatening';
  if (URGENCY_KEYWORDS.some(kw => t.includes(kw))) return 'urgent';
  return 'normal';
}

function detectIntent(message) {
  const m = message.toLowerCase();
  if (/cita|appointment|consulta/.test(m)) return 'booking';
  if (/cancelar|cancel/.test(m)) return 'cancel';
  if (/precio|price|cuanto/.test(m)) return 'info';
  return 'unknown';
}

function detectTreatment(message) {
  const m = message.toLowerCase();
  if (/blanquea|whitening/.test(m)) return 'Blanqueamiento';
  if (/implante|implant/.test(m)) return 'Implante';
  if (/limpieza|cleaning/.test(m)) return 'Limpieza';
  return 'Consulta General';
}

function extractName(message) {
  const patterns = [
    /(?:soy|me llamo|mi nombre es)\s+([A-Za-z\u00C0-\u024F]+)/i,
    /(?:I am|my name is|I'm)\s+([A-Za-z]+)/i,
  ];
  for (const p of patterns) {
    const match = message.match(p);
    if (match) return match[1];
  }
  return null;
}

function updateSummary(prev, msg, resp) {
  const entry = `P: ${msg.substring(0, 80)} | S: ${resp.substring(0, 80)}`;
  if (!prev) return entry;
  return prev.split('\n').slice(-2).concat(entry).join('\n');
}

function getFallback(lang, phone) {
  const msgs = {
    es: `Estamos procesando tu mensaje. Para urgencias llama al ${phone || 'la clinica'}.`,
    en: `Processing your message. For urgent matters call ${phone || 'the clinic'}.`,
    hr: `Obradujemo vasu poruku. Hitno nazovite ${phone || 'kliniku'}.`,
  };
  return msgs[lang] || msgs['es'];
}

function buildPrompt(clinic, context, lang) {
  const langInstr = {
    es: 'Responde SIEMPRE en espanol.',
    en: 'Respond ALWAYS in English.',
    hr: 'Odgovaraj UVIJEK na hrvatskom.',
    fr: 'Repond TOUJOURS en francais.',
    de: 'Antworte IMMER auf Deutsch.',
  }[lang] || 'Respond in the same language as the patient.';

  const ctx = context
    ? `CONTEXTO PREVIO: Nombre: ${context.patient_name || 'no dado'}. Intent: ${context.last_intent || 'primera vez'}. Resumen: ${context.summary_so_far || 'primera interaccion'}.`
    : 'CONTEXTO: Primera interaccion con este paciente.';

  return `Eres Sofia, asistente virtual de ${clinic.name}.
Horario: ${clinic.hours || 'Lun-Vie 9:00-18:00'}.
Telefono: ${clinic.phone || 'consultar con clinica'}.

${langInstr}
${ctx}

FUNCIONES: Agendar citas, informar precios y horarios, resolver dudas generales.

REGLAS MEDICAS OBLIGATORIAS:
1. NUNCA diagnostiques enfermedades.
2. NUNCA recomiendes medicamentos.
3. Si el mensaje tiene: dolor intenso, sangrado, accidente, fractura, fiebre, hinchado:
   Responde: "Entiendo que es urgente. Llama a la clinica: ${clinic.phone}. Si es emergencia llama al 112."
4. Si hay riesgo de vida responde SOLO: "Llama al 112 ahora. Es una emergencia medica."

ESTILO: Maximo 3 oraciones. Tono calido y profesional. Termina con pregunta o accion clara.
En el PRIMER mensaje agrega al final: "Si necesitas hablar con una persona escribe RECEPCION."`;
}

// ─── LOG EVENT ────────────────────────────────────────────────────────────────

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
        step,
        phone: phone || null,
        data: typeof data === 'string' ? { message: data } : data,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.log('[logEvent] failed silently:', e.message);
  }
}

// ─── SUPABASE ─────────────────────────────────────────────────────────────────

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
  if (!res.ok) throw new Error('Supabase GET ' + res.status + ': ' + text.substring(0, 200));
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
  if (!res.ok) console.error('[sbPost] error:', res.status, text.substring(0, 200));
  return text ? JSON.parse(text) : null;
}

// ─── DATA FUNCTIONS ───────────────────────────────────────────────────────────

async function getClinic() {
  const data = await sbGet('clinics?select=*&limit=1');
  if (Array.isArray(data) && data.length > 0) return data[0];
  return null;
}

async function getContext(clinicId, phone) {
  try {
    const data = await sbGet(
      `conversation_context?select=*&clinic_id=eq.${clinicId}&phone=eq.${encodeURIComponent(phone)}&limit=1`
    );
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

async function upsertContext(clinicId, phone, updates) {
  try {
    await sbPost(
      'conversation_context',
      { clinic_id: clinicId, phone, ...updates, updated_at: new Date().toISOString() },
      'resolution=merge-duplicates'
    );
  } catch (e) {
    console.error('upsertContext error:', e.message);
  }
}

async function saveMessage(clinicId, phone, message, response, type) {
  try {
    await sbPost('messages', {
      clinic_id: clinicId,
      patient_phone: phone,
      patient_message: message,
      sofia_response: response,
      response_type: type || 'ai',
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('saveMessage error:', e.message);
  }
}

async function saveLead(clinicId, phone, name, treatment) {
  try {
    await sbPost('leads', {
      clinic_id: clinicId,
      patient_name: name || 'Paciente WhatsApp',
      phone,
      source: 'whatsapp',
      status: 'nuevo',
      treatment_interest: treatment,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('saveLead error:', e.message);
  }
}

// ─── SEND WHATSAPP ────────────────────────────────────────────────────────────
// FIX v3.6: endpoint sin /v1/ — igual al que funciona en test-send.js

async function sendMessage(to, body) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: body }
  };

  // ✅ CORRECTO: sin /v1/ — confirmado funcionando en test-send.js
  const res = await fetch('https://waba-v2.360dialog.io/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'D360-API-KEY': DIALOG360_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();

  await logEvent('SEND_WHATSAPP_ATTEMPT', {
    to,
    status: res.status,
    ok: res.ok,
    response: responseText.substring(0, 300),
    endpoint: 'waba-v2.360dialog.io/messages',
  }, to);

  if (!res.ok) {
    throw new Error('360dialog ' + res.status + ': ' + responseText.substring(0, 200));
  }

  return JSON.parse(responseText);
}

// ─── CLAUDE API ───────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('Claude HTTP ' + res.status + ': ' + err.substring(0, 200));
    }
    const data = await res.json();
    return data.content[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {

  if (req.method === 'GET') {
    const challenge = req.query['hub.challenge'];
    if (challenge) return res.status(200).send(challenge);
    return res.status(200).send('Webhook OK');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  await logEvent('WEBHOOK_RECEIVED', {
    body_keys: Object.keys(req.body || {}),
    has_entry: !!req.body?.entry,
    has_messages: !!req.body?.messages,
    timestamp: new Date().toISOString(),
  });

  try {
    const body = req.body;
    let phone = null;
    let message = null;
    let contactName = null;

    if (body?.entry?.[0]?.changes?.[0]?.value?.messages) {
      const value = body.entry[0].changes[0].value;
      const msg = value.messages[0];
      if (msg.type !== 'text') {
        await logEvent('SKIPPED', { reason: 'non-text', type: msg.type });
        return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      }
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = value?.contacts?.[0]?.profile?.name;

    } else if (body?.messages?.[0]) {
      const msg = body.messages[0];
      if (msg.type !== 'text') {
        await logEvent('SKIPPED', { reason: 'non-text', type: msg.type });
        return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      }
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = body?.contacts?.[0]?.profile?.name;

    } else {
      await logEvent('STATUS_UPDATE', { body_keys: Object.keys(body || {}) });
      return res.status(200).json({ status: 'ok', note: 'status update' });
    }

    if (!phone || !message) {
      await logEvent('MISSING_DATA', { phone: !!phone, message: !!message });
      return res.status(200).json({ status: 'ok', note: 'missing data' });
    }

    const lang = detectLanguage(message);
    const urgency = detectUrgency(message);

    await logEvent('MESSAGE_PARSED', {
      phone,
      message: message.substring(0, 100),
      lang,
      urgency,
    }, phone);

    await logEvent('GET_CLINIC_START', {}, phone);
    let clinic = null;
    try {
      clinic = await getClinic();
    } catch (clinicError) {
      await logEvent('GET_CLINIC_ERROR', { error: clinicError.message }, phone);
      await sendMessage(phone, getFallback(lang, null));
      return res.status(200).json({ status: 'ok', error: 'clinic fetch failed' });
    }

    if (!clinic) {
      await logEvent('GET_CLINIC_NULL', { note: 'no records found' }, phone);
      await sendMessage(phone, getFallback(lang, null));
      return res.status(200).json({ status: 'ok', error: 'no clinic' });
    }

    await logEvent('GET_CLINIC_SUCCESS', {
      clinic_id: clinic.id,
      clinic_name: clinic.name,
    }, phone);

    if (urgency === 'life_threatening') {
      await logEvent('EMERGENCY_DETECTED', { phone }, phone);
      await sendMessage(phone, 'Llama al 112 ahora. Esto es una emergencia medica.');
      await saveMessage(clinic.id, phone, message, 'EMERGENCY_REDIRECT', 'emergency');
      return res.status(200).json({ status: 'ok', action: 'emergency' });
    }

    await logEvent('GET_CONTEXT_START', {}, phone);
    const context = await getContext(clinic.id, phone);
    await logEvent('GET_CONTEXT_DONE', { has_context: !!context }, phone);

    if (/^recepcion|reception$/i.test(message.trim())) {
      const humanMsg = `Perfecto! He notificado a ${clinic.name}. Te contactaran pronto. Horario: ${clinic.hours || 'Lun-Vie 9-18h'}.`;
      await sendMessage(phone, humanMsg);
      await saveMessage(clinic.id, phone, message, humanMsg, 'human_redirect');
      await logEvent('HUMAN_REDIRECT', {}, phone);
      return res.status(200).json({ status: 'ok', action: 'human_redirect' });
    }

    await logEvent('CLAUDE_START', {
      lang,
      message_preview: message.substring(0, 80),
    }, phone);

    const systemPrompt = buildPrompt(clinic, context, lang);
    let sofiaResponse;

    try {
      sofiaResponse = await callClaude(systemPrompt, message);
      await logEvent('CLAUDE_SUCCESS', {
        response_preview: sofiaResponse.substring(0, 100),
      }, phone);
    } catch (claudeError) {
      await logEvent('CLAUDE_ERROR', { error: claudeError.message }, phone);
      sofiaResponse = getFallback(lang, clinic.phone);
    }

    if (urgency === 'urgent') {
      sofiaResponse = `Entiendo que es urgente. Para atencion inmediata llama a la clinica: ${clinic.phone}. Para cita prioritaria responde URGENTE.`;
      await logEvent('MEDICAL_URGENCY', {}, phone);
    }

    await logEvent('SEND_WHATSAPP_START', {
      response_preview: sofiaResponse.substring(0, 100),
    }, phone);

    try {
      await sendMessage(phone, sofiaResponse);
      await logEvent('SEND_WHATSAPP_SUCCESS', { to: phone }, phone);
    } catch (sendError) {
      await logEvent('SEND_WHATSAPP_ERROR', { error: sendError.message }, phone);
      return res.status(200).json({ status: 'ok', error: 'send failed' });
    }

    await saveMessage(clinic.id, phone, message, sofiaResponse, 'ai');

    const name = context?.patient_name || extractName(message) || contactName;
    const summary = updateSummary(context?.summary_so_far, message, sofiaResponse);
    await upsertContext(clinic.id, phone, {
      patient_name: name,
      last_intent: detectIntent(message),
      summary_so_far: summary,
      message_count: (context?.message_count || 0) + 1,
    });

    if (!context) {
      await saveLead(clinic.id, phone, name, detectTreatment(message));
    }

    await logEvent('MESSAGE_PROCESSED_OK', {
      clinic: clinic.name,
      lang,
      is_new_lead: !context,
    }, phone);

    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    await logEvent('CRITICAL_ERROR', {
      error: error.message,
      stack: error.stack?.substring(0, 500),
    });

    try {
      const phone = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
        || req.body?.messages?.[0]?.from;
      if (phone) {
        await sendMessage(phone, 'Lo sentimos, estamos con dificultades tecnicas. Intenta en unos minutos.');
      }
    } catch (e) { /* silencioso */ }

    return res.status(200).json({ status: 'error', message: error.message });
  }
};
