// ============================================================
// CLINIFLOW - WEBHOOK TWILIO COMPLETO
// Sofia Pro + Memoria + Fallback + Alertas Medicas
// Archivo: /api/whatsapp-webhook.js
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const CEO_PHONE = process.env.CEO_PHONE;

// Palabras clave de urgencia medica en varios idiomas
const URGENCY_KEYWORDS = [
  'dolor intenso','sangrado','emergencia','urgente','accidente',
  'fractura','hinchado','fiebre','me desmaye','golpe','me cai',
  'severe pain','bleeding','emergency','urgent','accident',
  'fracture','swollen','fever','fainted',
  'hitno','bol','krvarenje','nesreca',
  'dringend','schmerzen','blutung','notfall',
  'urgence','douleur intense','saignement',
  'urgente','dolore forte','sanguinamento',
  'dor forte','sangramento',
];

const LIFE_THREATENING = [
  'no respira','not breathing','perdida de conocimiento',
  'unconscious','sangrado severo','severe bleeding',
  'ne diham','no puede respirar',
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
  if (/cita|appointment|termin|consulta/.test(m)) return 'booking';
  if (/cancelar|cancel|abbrechen/.test(m)) return 'cancel';
  if (/cambiar|reschedule|reprogramar/.test(m)) return 'reschedule';
  if (/precio|price|preis|cuanto|how much/.test(m)) return 'info';
  if (URGENCY_KEYWORDS.some(kw => m.includes(kw))) return 'urgent';
  return 'unknown';
}

function detectTreatment(message) {
  const m = message.toLowerCase();
  if (/blanquea|whitening/.test(m)) return 'Blanqueamiento';
  if (/implante|implant/.test(m)) return 'Implante';
  if (/ortodoncia|orthodontics|braces/.test(m)) return 'Ortodoncia';
  if (/limpieza|cleaning/.test(m)) return 'Limpieza';
  if (/empaste|filling/.test(m)) return 'Empaste';
  if (/extraccion|extraction/.test(m)) return 'Extraccion';
  return 'Consulta General';
}

function extractNameFromMessage(message) {
  const patterns = [
    /(?:soy|me llamo|mi nombre es)\s+([A-Za-z\u00C0-\u024F]+)/i,
    /(?:I am|my name is|I'm)\s+([A-Za-z]+)/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function updateSummary(prevSummary, newMessage, newResponse) {
  const newEntry = `P: ${newMessage.substring(0, 80)} | S: ${newResponse.substring(0, 80)}`;
  if (!prevSummary) return newEntry;
  const lines = prevSummary.split('\n').slice(-2);
  lines.push(newEntry);
  return lines.join('\n');
}

function getFallbackMessage(lang, clinicPhone) {
  const msgs = {
    es: `Estamos procesando tu mensaje. Para urgencias llama al ${clinicPhone} directamente.`,
    en: `Processing your message. For urgent matters call ${clinicPhone} directly.`,
    fr: `Nous traitons votre message. Pour urgences appelez le ${clinicPhone}.`,
    de: `Wir verarbeiten Ihre Nachricht. Notfall: ${clinicPhone}.`,
    hr: `Obradujemo vasu poruku. Hitno nazovite ${clinicPhone}.`,
  };
  return msgs[lang] || msgs['es'];
}

function buildSofiaPrompt(clinic, context, lang) {
  const langInstr = {
    es: 'Responde SIEMPRE en espanol.',
    en: 'Respond ALWAYS in English.',
    fr: 'Repond TOUJOURS en francais.',
    de: 'Antworte IMMER auf Deutsch.',
    hr: 'Odgovaraj UVIJEK na hrvatskom.',
  }[lang] || 'Respond in the same language as the patient.';

  const contextSection = context
    ? `CONTEXTO PREVIO: Nombre conocido: ${context.patient_name || 'no dado'}. Ultima intencion: ${context.last_intent || 'primera vez'}. Resumen: ${context.summary_so_far || 'primera interaccion'}.`
    : 'CONTEXTO: Primera interaccion con este paciente.';

  return `Eres Sofia, asistente virtual de la clinica dental ${clinic.name}.
Ubicacion: ${clinic.city || 'consultar con clinica'}.
Horario: ${clinic.hours || 'Lun-Vie 9:00-18:00'}.
Telefono: ${clinic.phone || 'consultar en recepcion'}.

${langInstr}

${contextSection}

FUNCIONES: Agendar citas, informar horarios y precios generales, resolver dudas generales.

REGLAS DE SEGURIDAD MEDICA - OBLIGATORIAS:
1. NUNCA diagnostiques enfermedades.
2. NUNCA recomiendes medicamentos.
3. Si el mensaje incluye: dolor intenso, sangrado, accidente, golpe, fractura, fiebre, hinchado:
   Responde: "Entiendo que es urgente. Para atencion inmediata llama a la clinica: ${clinic.phone}. Si es emergencia llama al 112. Si puedes esperar te agendo cita prioritaria ahora mismo."
4. Si hay riesgo de vida responde SOLO: "Llama al 112 ahora. Es una emergencia medica."

ESTILO: Maximo 3 oraciones. Tono calido y profesional. Termina siempre con una pregunta o accion clara.
En tu primer mensaje agrega: "Si necesitas hablar con una persona escribe RECEPCION."`;
}

async function sbFetch(path, options) {
  const url = SUPABASE_URL + '/rest/v1/' + path;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Supabase error: ' + err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getClinic(toNumber) {
  try {
    const data = await sbFetch('clinics?select=*&active=eq.true&order=created_at.asc&limit=1', { method: 'GET', prefer: '' });
    return Array.isArray(data) ? data[0] : null;
  } catch (e) {
    return null;
  }
}

async function getContext(clinicId, phone) {
  try {
    const data = await sbFetch(
      `conversation_context?select=*&clinic_id=eq.${clinicId}&phone=eq.${encodeURIComponent(phone)}&limit=1`,
      { method: 'GET', prefer: '' }
    );
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

async function upsertContext(clinicId, phone, updates) {
  try {
    await sbFetch('conversation_context', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: JSON.stringify({ clinic_id: clinicId, phone, ...updates, updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.error('Context upsert error:', e.message);
  }
}

async function saveMessage(clinicId, phone, message, response, type) {
  try {
    await sbFetch('messages', {
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
  } catch (e) {
    console.error('Save message error:', e.message);
  }
}

async function saveLead(clinicId, phone, name, treatment) {
  try {
    await sbFetch('leads', {
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
  } catch (e) {
    console.error('Save lead error:', e.message);
  }
}

async function saveToQueue(clinicId, phone, message, errorMsg) {
  try {
    await sbFetch('message_queue', {
      method: 'POST',
      body: JSON.stringify({
        clinic_id: clinicId,
        phone,
        message,
        status: 'pending',
        error: errorMsg,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error('Queue save error:', e.message);
  }
}

async function sendWhatsApp(to, body, from) {
  const fromNum = from || process.env.TWILIO_WHATSAPP_NUMBER;
  const credentials = Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64');
  const params = new URLSearchParams({
    From: 'whatsapp:' + fromNum,
    To: 'whatsapp:' + to,
    Body: body,
  });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + credentials,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
}

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const body = req.body || {};
  const fromRaw = body.From || '';
  const messageBody = body.Body || '';
  const toNumber = body.To || '';

  if (!fromRaw || !messageBody) return res.status(400).send('Missing fields');

  const phone = fromRaw.replace('whatsapp:', '').trim();
  const message = messageBody.trim();
  const lang = detectLanguage(message);

  // Responder a Twilio inmediatamente para evitar timeout
  res.status(200).send('<Response></Response>');

  try {
    // 1. Obtener clinica
    const clinic = await getClinic(toNumber);
    if (!clinic) { console.error('No clinic found'); return; }

    // 2. Detectar urgencia PRIMERO
    const urgency = detectUrgency(message);

    if (urgency === 'life_threatening') {
      await sendWhatsApp(phone, 'Llama al 112 ahora. Esto es una emergencia medica.', toNumber);
      await saveMessage(clinic.id, phone, message, 'EMERGENCY_REDIRECT', 'emergency');
      if (clinic.director_phone) {
        await sendWhatsApp(clinic.director_phone, `EMERGENCIA en ${clinic.name}. Paciente: ${phone}. Mensaje: "${message.substring(0,100)}"`);
      }
      return;
    }

    // 3. Obtener contexto de conversacion (memoria)
    const context = await getContext(clinic.id, phone);

    // 4. Si escribe RECEPCION, notificar al director
    if (/^recepcion|reception$/i.test(message.trim())) {
      const humanMsg = `Perfecto! He notificado a ${clinic.name}. Te contactaran en breve. Horario: ${clinic.hours || 'Lun-Vie 9-18h'}.`;
      await sendWhatsApp(phone, humanMsg, toNumber);
      if (clinic.director_phone) {
        await sendWhatsApp(clinic.director_phone, `Paciente pide atencion humana. Numero: ${phone}`);
      }
      await saveMessage(clinic.id, phone, message, humanMsg, 'human_redirect');
      return;
    }

    // 5. Construir prompt con memoria
    const systemPrompt = buildSofiaPrompt(clinic, context, lang);

    // 6. Llamar a Claude con fallback
    let sofiaResponse;
    try {
      sofiaResponse = await callClaude(systemPrompt, message);
    } catch (claudeError) {
      // FALLBACK: Claude no disponible
      console.error('Claude API failed:', claudeError.message);
      sofiaResponse = getFallbackMessage(lang, clinic.phone);

      // Guardar en cola de pendientes
      await saveToQueue(clinic.id, phone, message, claudeError.message);

      // Alerta al CEO
      if (CEO_PHONE) {
        try {
          await sendWhatsApp(CEO_PHONE,
            `ALERTA CliniFlow: Claude API caida en ${clinic.name}. Mensaje pendiente de: ${phone}`,
            toNumber
          );
        } catch (e) { console.error('CEO alert failed:', e.message); }
      }
    }

    // 7. Si es urgencia medica (no vital), sobreescribir respuesta
    if (urgency === 'urgent') {
      sofiaResponse = `Entiendo que es urgente. Para atencion inmediata llama a la clinica: ${clinic.phone}. Si necesitas cita prioritaria responde URGENTE.`;
      if (clinic.director_phone) {
        await sendWhatsApp(clinic.director_phone,
          `URGENCIA en ${clinic.name}. Paciente: ${phone}. Mensaje: "${message.substring(0,100)}"`
        );
      }
    }

    // 8. Enviar respuesta al paciente
    await sendWhatsApp(phone, sofiaResponse, toNumber);

    // 9. Guardar mensaje en Supabase
    await saveMessage(clinic.id, phone, message, sofiaResponse, 'ai');

    // 10. Actualizar contexto (memoria)
    const extractedName = context?.patient_name || extractNameFromMessage(message);
    const newSummary = updateSummary(context?.summary_so_far, message, sofiaResponse);
    await upsertContext(clinic.id, phone, {
      patient_name: extractedName,
      last_intent: detectIntent(message),
      summary_so_far: newSummary,
      message_count: (context?.message_count || 0) + 1,
    });

    // 11. Si es primer mensaje, crear lead
    if (!context) {
      await saveLead(clinic.id, phone, extractedName, detectTreatment(message));
    }

  } catch (error) {
    console.error('Webhook critical error:', error);
    try {
      await sendWhatsApp(phone,
        'Lo sentimos, estamos con dificultades tecnicas. Por favor llama directamente a la clinica.',
        toNumber
      );
    } catch (e) { console.error('Final fallback failed:', e); }
  }
};
