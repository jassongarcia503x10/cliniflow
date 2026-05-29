// ============================================================
// CLINIFLOW - WEBHOOK 360DIALOG
// Version 3.4 - ONLY fix: sbGet() for Supabase + debug logs
// sendMessage() payload UNCHANGED from working production version
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;
const DIALOG360_PHONE_ID = process.env.DIALOG360_PHONE_ID;
const CEO_PHONE = process.env.CEO_PHONE;

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
    es: `Estamos procesando tu mensaje. Para urgencias llama al ${phone}.`,
    en: `Processing your message. For urgent matters call ${phone}.`,
    hr: `Obradujemo vasu poruku. Hitno nazovite ${phone}.`,
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
    : 'CONTEXTO: Primera interaccion.';

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

ESTILO: Maximo 3 oraciones. Tono calido. Termina con pregunta o accion clara.
En primer mensaje agrega al final: "Si necesitas hablar con una persona escribe RECEPCION."`;
}

// ─── SUPABASE: sbGet separado de sbPost ──────────────────────────────────────
// FIX: El header "Prefer: return=representation" en GET causaba que Supabase
// ignorara la consulta. Los GET no deben llevar ese header.

async function sbGet(path) {
  const url = SUPABASE_URL + '/rest/v1/' + path;

  console.log('[Supabase] GET url:', url);
  console.log('[Supabase] KEY defined:', !!SUPABASE_SERVICE_KEY);
  console.log('[Supabase] URL defined:', !!SUPABASE_URL);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
    },
  });

  const text = await res.text();
  console.log('[Supabase] GET status:', res.status);
  console.log('[Supabase] GET raw response:', text.substring(0, 300));

  if (!res.ok) {
    throw new Error('Supabase GET error ' + res.status + ': ' + text);
  }

  return text ? JSON.parse(text) : null;
}

async function sbPost(path, body, prefer) {
  const url = SUPABASE_URL + '/rest/v1/' + path;
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
  if (!res.ok) {
    console.error('[Supabase] POST error:', res.status, text.substring(0, 200));
  }
  return text ? JSON.parse(text) : null;
}

// ─── DATA FUNCTIONS ───────────────────────────────────────────────────────────

async function getClinic() {
  try {
    console.log('[getClinic] Starting query...');
    const data = await sbGet('clinics?select=*&limit=1');

    console.log('[getClinic] typeof data:', typeof data);
    console.log('[getClinic] isArray:', Array.isArray(data));
    console.log('[getClinic] full result:', JSON.stringify(data));

    if (Array.isArray(data) && data.length > 0) {
      console.log('[getClinic] SUCCESS — clinic:', data[0].name);
      return data[0];
    }

    console.error('[getClinic] FAIL — array is empty or data is not array');
    return null;
  } catch (e) {
    console.error('[getClinic] EXCEPTION:', e.message);
    return null;
  }
}

async function getContext(clinicId, phone) {
  try {
    const data = await sbGet(
      `conversation_context?select=*&clinic_id=eq.${clinicId}&phone=eq.${encodeURIComponent(phone)}&limit=1`
    );
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('getContext error:', e.message);
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

// ─── WHATSAPP: PAYLOAD IDÉNTICO AL QUE YA FUNCIONA EN PRODUCCIÓN ─────────────

async function sendMessage(to, body) {
  console.log('Sending message to:', to, '| body:', body.substring(0, 50));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: body }
  };

  const res = await fetch('https://waba-v2.360dialog.io/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'D360-API-KEY': DIALOG360_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log('360dialog send response:', res.status, responseText.substring(0, 300));

  if (!res.ok) {
    throw new Error('360dialog send error: ' + responseText);
  }

  return JSON.parse(responseText);
}

// ─── CLAUDE ───────────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage) {
  console.log('Calling Claude API...');
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
      throw new Error('Claude HTTP ' + res.status + ': ' + err);
    }

    const data = await res.json();
    console.log('Claude response received successfully');
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

  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('========================');

  try {
    const body = req.body;
    let phone = null;
    let message = null;
    let contactName = null;

    if (body?.entry?.[0]?.changes?.[0]?.value?.messages) {
      const value = body.entry[0].changes[0].value;
      const msg = value.messages[0];
      console.log('Meta Cloud API format detected');
      if (msg.type !== 'text') return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = value?.contacts?.[0]?.profile?.name;

    } else if (body?.messages?.[0]) {
      const msg = body.messages[0];
      console.log('360dialog direct format detected');
      if (msg.type !== 'text') return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = body?.contacts?.[0]?.profile?.name;

    } else {
      console.log('Status update or unknown format — keys:', Object.keys(body || {}));
      return res.status(200).json({ status: 'ok', note: 'status update or unknown format' });
    }

    if (!phone || !message) {
      console.log('Missing phone or message:', { phone, message });
      return res.status(200).json({ status: 'ok', note: 'missing phone or message' });
    }

    console.log('Processing message from:', phone, '| text:', message);

    const lang = detectLanguage(message);
    const urgency = detectUrgency(message);
    console.log('Language:', lang, '| Urgency:', urgency);

    const clinic = await getClinic();

    if (!clinic) {
      console.error('[handler] getClinic() returned null — check [Supabase] logs above');
      await sendMessage(phone, 'Lo sentimos, estamos experimentando dificultades tecnicas.');
      return res.status(200).json({ status: 'ok', error: 'no clinic found' });
    }

    console.log('[handler] Clinic OK:', clinic.name);

    if (urgency === 'life_threatening') {
      await sendMessage(phone, 'Llama al 112 ahora. Esto es una emergencia medica.');
      await saveMessage(clinic.id, phone, message, 'EMERGENCY_REDIRECT', 'emergency');
      return res.status(200).json({ status: 'ok', action: 'emergency' });
    }

    const context = await getContext(clinic.id, phone);
    console.log('Context found:', context ? 'yes' : 'no (first message)');

    if (/^recepcion|reception$/i.test(message.trim())) {
      const humanMsg = `Perfecto! He notificado a ${clinic.name}. Te contactaran pronto. Horario: ${clinic.hours || 'Lun-Vie 9-18h'}.`;
      await sendMessage(phone, humanMsg);
      await saveMessage(clinic.id, phone, message, humanMsg, 'human_redirect');
      return res.status(200).json({ status: 'ok', action: 'human_redirect' });
    }

    const systemPrompt = buildPrompt(clinic, context, lang);
    let sofiaResponse;

    try {
      sofiaResponse = await callClaude(systemPrompt, message);
    } catch (claudeError) {
      console.error('Claude API failed:', claudeError.message);
      sofiaResponse = getFallback(lang, clinic.phone);
    }

    if (urgency === 'urgent') {
      sofiaResponse = `Entiendo que es urgente. Para atencion inmediata llama a la clinica: ${clinic.phone}. Para cita prioritaria responde URGENTE.`;
    }

    console.log('Sofia response:', sofiaResponse.substring(0, 100));

    await sendMessage(phone, sofiaResponse);
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
      console.log('New lead created');
    }

    console.log('=== MESSAGE PROCESSED SUCCESSFULLY ===');
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('=== CRITICAL WEBHOOK ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    try {
      const body = req.body;
      const phone = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
        || body?.messages?.[0]?.from;
      if (phone) {
        await sendMessage(phone, 'Lo sentimos, estamos con dificultades tecnicas. Por favor intenta en unos minutos.');
      }
    } catch (e) {
      console.error('Fallback also failed:', e.message);
    }

    return res.status(200).json({ status: 'error', message: error.message });
  }
};
