// ============================================================
// CLINIFLOW - WEBHOOK 360DIALOG
// Sofia Pro + Memoria + Fallback + Alertas Medicas
// Archivo: /api/whatsapp-webhook.js
// Version 3.0 - 360dialog format
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;
const DIALOG360_PHONE_ID = process.env.DIALOG360_PHONE_ID;
const CEO_PHONE = process.env.CEO_PHONE;

// ─── PALABRAS CLAVE DE URGENCIA ───────────────────────────
const URGENCY_KEYWORDS = [
  'dolor intenso','sangrado','emergencia','urgente','accidente',
  'fractura','hinchado','fiebre','me desmaye','golpe','me cai',
  'severe pain','bleeding','emergency','urgent','accident',
  'fracture','swollen','fever','fainted',
  'hitno','bol','krvarenje','nesreca',
  'dringend','schmerzen','blutung','notfall',
  'urgence','douleur intense','saignement',
  'dor forte','sangramento',
];

const LIFE_THREATENING = [
  'no respira','not breathing','perdida de conocimiento',
  'unconscious','sangrado severo','severe bleeding',
  'no puede respirar',
];

function detectLanguage(text) {
  const t = text.toLowerCase();
  if (/\b(hola|gracias|buenos|quiero|tengo|cita|dentista)\b/.test(t)) return 'es';
  if (/\b(bonjour|merci|je veux|rendez-vous)\b/.test(t)) return 'fr';
  if (/\b(hallo|danke|ich|termin|zahnarzt)\b/.test(t)) return 'de';
  if (/\b(ciao|grazie|voglio|appuntamento)\b/.test(t)) return 'it';
  if (/\b(ola|obrigado|quero|consulta)\b/.test(t)) return 'pt';
  if (/\b(hvala|zelim|termin|zubar|dobar)\b/.test(t)) return 'hr';
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
  if (/cambiar|reschedule|reprogramar/.test(m)) return 'reschedule';
  if (/precio|price|cuanto|how much/.test(m)) return 'info';
  if (URGENCY_KEYWORDS.some(kw => m.includes(kw))) return 'urgent';
  return 'unknown';
}

function detectTreatment(message) {
  const m = message.toLowerCase();
  if (/blanquea|whitening/.test(m)) return 'Blanqueamiento';
  if (/implante|implant/.test(m)) return 'Implante';
  if (/ortodoncia|braces/.test(m)) return 'Ortodoncia';
  if (/limpieza|cleaning/.test(m)) return 'Limpieza';
  if (/empaste|filling/.test(m)) return 'Empaste';
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
En primer mensaje agrega: "Si necesitas hablar con una persona escribe RECEPCION."`;
}

// ─── SUPABASE HELPER ──────────────────────────────────────
async function sb(path, options) {
  const url = SUPABASE_URL + '/rest/v1/' + path;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getClinic() {
  try {
    const data = await sb('clinics?select=*&active=eq.true&order=created_at.asc&limit=1', { method: 'GET', prefer: '' });
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) { return null; }
}

async function getContext(clinicId, phone) {
  try {
    const data = await sb(
      `conversation_context?select=*&clinic_id=eq.${clinicId}&phone=eq.${encodeURIComponent(phone)}&limit=1`,
      { method: 'GET', prefer: '' }
    );
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) { return null; }
}

async function upsertContext(clinicId, phone, updates) {
  try {
    await sb('conversation_context', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: JSON.stringify({ clinic_id: clinicId, phone, ...updates, updated_at: new Date().toISOString() }),
    });
  } catch (e) { console.error('Context error:', e.message); }
}

async function saveMessage(clinicId, phone, message, response, type) {
  try {
    await sb('messages', {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        patient_phone: phone,
        patient_message: message,
        sofia_response: response,
        response_type: type || 'ai',
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) { console.error('Save message error:', e.message); }
}

async function saveLead(clinicId, phone, name, treatment) {
  try {
    await sb('leads', {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        patient_name: name || 'Paciente WhatsApp',
        phone,
        source: 'whatsapp',
        status: 'nuevo',
        treatment_interest: treatment,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) { console.error('Lead error:', e.message); }
}

async function saveQueue(clinicId, phone, message, error) {
  try {
    await sb('message_queue', {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId, phone, message,
        status: 'pending', error,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) { console.error('Queue error:', e.message); }
}

// ─── ENVIAR MENSAJE VIA 360DIALOG ─────────────────────────
async function sendMessage(to, body) {
  const phoneId = DIALOG360_PHONE_ID;
  const url = `https://waba.360dialog.io/v1/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'D360-API-KEY': DIALOG360_API_KEY,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { body: body }
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('360dialog send error: ' + err);
  }
  return res.json();
}

// ─── LLAMAR A CLAUDE ──────────────────────────────────────
async function callClaude(systemPrompt, userMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
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
    if (!res.ok) throw new Error('Claude HTTP ' + res.status);
    const data = await res.json();
    return data.content[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────
module.exports = async function handler(req, res) {
  // 360dialog verification challenge
  if (req.method === 'GET') {
    const challenge = req.query['hub.challenge'];
    if (challenge) return res.status(200).send(challenge);
    return res.status(200).send('OK');
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // Responder a 360dialog inmediatamente
  res.status(200).json({ status: 'ok' });

  try {
    // ─── PARSEAR MENSAJE DE 360DIALOG ─────────────────────
    const body = req.body;

    // Formato 360dialog / Meta Cloud API
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) {
      console.log('No messages in payload:', JSON.stringify(body));
      return;
    }

    const msg = messages[0];

    // Solo procesar mensajes de texto
    if (msg.type !== 'text') {
      console.log('Non-text message type:', msg.type);
      return;
    }

    const phone = msg.from; // numero del paciente
    const message = msg.text?.body?.trim();
    const contactName = value?.contacts?.[0]?.profile?.name;

    if (!phone || !message) return;

    const lang = detectLanguage(message);
    const urgency = detectUrgency(message);

    // ─── 1. OBTENER CLINICA ────────────────────────────────
    const clinic = await getClinic();
    if (!clinic) {
      console.error('No active clinic found');
      await sendMessage(phone, 'Lo sentimos, estamos experimentando dificultades. Por favor intenta mas tarde.');
      return;
    }

    // ─── 2. URGENCIA DE VIDA ───────────────────────────────
    if (urgency === 'life_threatening') {
      await sendMessage(phone, 'Llama al 112 ahora. Esto es una emergencia medica.');
      await saveMessage(clinic.id, phone, message, 'EMERGENCY_REDIRECT', 'emergency');
      if (clinic.director_phone) {
        await sendMessage(clinic.director_phone,
          `EMERGENCIA en ${clinic.name}. Paciente: ${phone}. Mensaje: "${message.substring(0, 100)}"`
        );
      }
      return;
    }

    // ─── 3. OBTENER CONTEXTO (MEMORIA) ────────────────────
    const context = await getContext(clinic.id, phone);

    // ─── 4. COMANDO RECEPCION ──────────────────────────────
    if (/^recepcion|reception$/i.test(message.trim())) {
      const humanMsg = `Perfecto! He notificado a ${clinic.name}. Te contactaran pronto. Horario: ${clinic.hours || 'Lun-Vie 9-18h'}.`;
      await sendMessage(phone, humanMsg);
      if (clinic.director_phone) {
        await sendMessage(clinic.director_phone,
          `Paciente pide atencion humana. Numero: ${phone}. Mensaje: "${message}"`
        );
      }
      await saveMessage(clinic.id, phone, message, humanMsg, 'human_redirect');
      return;
    }

    // ─── 5. CONSTRUIR PROMPT Y LLAMAR A CLAUDE ────────────
    const systemPrompt = buildPrompt(clinic, context, lang);
    let sofiaResponse;

    try {
      sofiaResponse = await callClaude(systemPrompt, message);
    } catch (claudeError) {
      console.error('Claude failed:', claudeError.message);
      sofiaResponse = getFallback(lang, clinic.phone);
      await saveQueue(clinic.id, phone, message, claudeError.message);

      if (CEO_PHONE) {
        try {
          await sendMessage(CEO_PHONE,
            `ALERTA: Claude API caida en ${clinic.name}. Mensaje pendiente: ${phone}`
          );
        } catch (e) { console.error('CEO alert failed'); }
      }
    }

    // ─── 6. URGENCIA MEDICA (no vital) ────────────────────
    if (urgency === 'urgent') {
      sofiaResponse = `Entiendo que es urgente. Para atencion inmediata llama a la clinica: ${clinic.phone}. Para cita prioritaria responde URGENTE.`;
      if (clinic.director_phone) {
        await sendMessage(clinic.director_phone,
          `URGENCIA en ${clinic.name}. Paciente: ${phone}. Mensaje: "${message.substring(0, 100)}"`
        );
      }
    }

    // ─── 7. ENVIAR RESPUESTA ──────────────────────────────
    await sendMessage(phone, sofiaResponse);

    // ─── 8. GUARDAR EN SUPABASE ───────────────────────────
    await saveMessage(clinic.id, phone, message, sofiaResponse, 'ai');

    // ─── 9. ACTUALIZAR MEMORIA ────────────────────────────
    const name = context?.patient_name || extractName(message) || contactName;
    const summary = updateSummary(context?.summary_so_far, message, sofiaResponse);
    await upsertContext(clinic.id, phone, {
      patient_name: name,
      last_intent: detectIntent(message),
      summary_so_far: summary,
      message_count: (context?.message_count || 0) + 1,
    });

    // ─── 10. CREAR LEAD SI ES PRIMERA INTERACCION ─────────
    if (!context) {
      await saveLead(clinic.id, phone, name, detectTreatment(message));
    }

  } catch (error) {
    console.error('Webhook critical error:', error);
  }
};
