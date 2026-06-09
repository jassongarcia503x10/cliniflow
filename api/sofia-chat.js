// ============================================================
// CLINIFLOW - sofia-chat.js v3
// Three modes - all powered by real Supabase data
//
// reception: public-facing, patient-only info, no PHI
// copilot:   doctor internal - patients, today's appts, allergies
// ceo:       owner - aggregated revenue, no-shows, conversions
// ============================================================

const CLAUDE_API_KEY       = process.env.CLAUDE_API_KEY;
const SB_URL               = process.env.SUPABASE_URL;
const SB_SERVICE_KEY       = process.env.SUPABASE_SERVICE_KEY;

const SB = {
  apikey: SB_SERVICE_KEY,
  Authorization: "Bearer " + SB_SERVICE_KEY,
};

async function sbGet(path) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: SB });
  const t = await r.text();
  return t ? JSON.parse(t) : [];
}

// -- RESOLVE JWT -> clinic_id ----------------------------------
async function resolveClinic(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const ur = await fetch(SB_URL + "/auth/v1/user", {
    headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + token },
  });
  if (!ur.ok) return null;
  const user = await ur.json();
  if (!user.id) return null;
  const cu = await sbGet("clinic_users?select=clinic_id&user_id=eq." + user.id + "&limit=1");
  return Array.isArray(cu) && cu.length > 0 ? cu[0].clinic_id : null;
}

// -- MODE: RECEPTION ------------------------------------------
async function receptionContext(clinic_id) {
  const [clinics, treats] = await Promise.all([
    sbGet("clinics?select=name,city,phone,hours_mon_fri,hours_saturday,language,currency&id=eq." + clinic_id + "&limit=1"),
    sbGet("treatments?select=name,price,price_mode,price_max,duration&clinic_id=eq." + clinic_id + "&active=eq.true"),
  ]);
  const clinic = clinics[0] || {};
  const curr   = clinic.currency || "EUR";
  const prices = Array.isArray(treats) ? treats.map(t =>
    t.price_mode === "exact" ? "• " + t.name + ": " + curr + t.price :
    t.price_mode === "from"  ? "• " + t.name + ": desde " + curr + t.price +
                                (t.price_max ? " hasta " + curr + t.price_max : "") :
    "• " + t.name + ": consultar precio"
  ).join("\n") : "Consultar con la clínica";

  return {
    system: `Eres Sofía, recepcionista virtual de ${clinic.name || "la clínica"} en ${clinic.city || ""}.

REGLAS ESTRICTAS DE PRIVACIDAD:
- Nunca reveles datos clínicos de pacientes.
- Nunca menciones diagnósticos, tratamientos en curso, ni notas médicas.
- Solo manejas: citas, precios, horarios, disponibilidad general.

HORARIOS: ${clinic.hours_mon_fri || "Lun-Vie 9:00-18:00"} | Sáb: ${clinic.hours_saturday || "Cerrado"}
TELÉFONO: ${clinic.phone || "consultar en clínica"}

TRATAMIENTOS Y PRECIOS (usa SOLO estos):
${prices}

INSTRUCCIONES:
1. Responde en el idioma del paciente.
2. Para agendar: pide nombre, tratamiento, día y hora preferida.
3. Para precios: usa la lista exacta. Nunca inventes cifras.
4. Urgencias: "Llama a ${clinic.phone || "la clínica"} o al 112 inmediatamente."
5. Máximo 3 oraciones por respuesta.`,
    max_tokens: 300,
  };
}

// -- MODE: COPILOT (doctor) -----------------------------------
async function copilotContext(clinic_id) {
  const now = new Date();
  const todayStart = now.toISOString().slice(0, 10) + "T00:00:00";
  const todayEnd   = now.toISOString().slice(0, 10) + "T23:59:59";
  const hour = now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

  const [appts, patients] = await Promise.all([
    sbGet("appointments?select=id,start_time,end_time,status,chief_complaint,notes,patients(name,phone,allergies),treatments(name,duration),doctors(name)&clinic_id=eq." + clinic_id + "&start_time=gte." + encodeURIComponent(todayStart) + "&start_time=lte." + encodeURIComponent(todayEnd) + "&order=start_time.asc"),
    sbGet("patients?select=id,name,phone,allergies&clinic_id=eq." + clinic_id + "&active=eq.true&limit=50"),
  ]);

  const apptLines = Array.isArray(appts) ? appts.map(a => {
    const t = new Date(a.start_time).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    const pat = a.patients ? a.patients.name : "Desconocido";
    const tx  = a.treatments ? a.treatments.name : "-";
    const alg = a.patients && a.patients.allergies && a.patients.allergies.length > 0
      ? " ⚠️ ALERGIA: " + a.patients.allergies.join(", ") : "";
    return t + " - " + pat + " - " + tx + " [" + a.status + "]" + alg;
  }).join("\n") : "Sin citas programadas";

  const patientList = Array.isArray(patients) ? patients.map(p => {
    const alg = p.allergies && p.allergies.length > 0 ? " ⚠️ " + p.allergies.join(", ") : "";
    return p.name + (p.phone ? " (" + p.phone + ")" : "") + alg;
  }).join("\n") : "Sin pacientes";

  // Find next appointment
  const now_iso = now.toISOString();
  const upcoming = Array.isArray(appts)
    ? appts.filter(a => a.start_time >= now_iso && a.status !== "cancelled" && a.status !== "no_show")
    : [];
  const next = upcoming[0];
  const nextLine = next
    ? (next.patients ? next.patients.name : "-") + " a las " +
      new Date(next.start_time).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : "No hay más citas hoy";

  return {
    system: `Eres Sofía, copiloto clínico interno. Hora actual: ${hour}.
Responde preguntas del equipo médico usando datos reales de la clínica.
Responde en el idioma de la pregunta.

CITAS DE HOY (${now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}):
${apptLines}

PRÓXIMO PACIENTE: ${nextLine}

DIRECTORIO DE PACIENTES (${Array.isArray(patients) ? patients.length : 0} activos):
${patientList}

INSTRUCCIONES:
- Usa SOLO los datos de arriba para responder.
- Cuando menciones alergias, resáltalas claramente.
- Para historial detallado de un paciente, di que debe consultar la ficha en el panel.
- Nunca inventes datos. Si no lo tienes, dilo.
- Sé directo y conciso. El doctor está trabajando.`,
    max_tokens: 500,
  };
}

// -- MODE: CEO (owner metrics) --------------------------------
async function ceoContext(clinic_id) {
  const now       = new Date();
  const todayStr  = now.toISOString().slice(0, 10);
  const monthStart = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01";
  const weekAgo   = new Date(now - 7 * 86400000).toISOString();

  const [appts, patients, pending] = await Promise.all([
    sbGet("appointments?select=status,price,start_time,treatment_id&clinic_id=eq." + clinic_id),
    sbGet("patients?select=id,created_at&clinic_id=eq." + clinic_id + "&active=eq.true"),
    sbGet("pending_bookings?select=id,status&clinic_id=eq." + clinic_id + "&status=eq.pending"),
  ]);

  const all = Array.isArray(appts) ? appts : [];
  const pats = Array.isArray(patients) ? patients : [];

  const todayA    = all.filter(a => (a.start_time || "").slice(0, 10) === todayStr);
  const monthA    = all.filter(a => (a.start_time || "") >= monthStart);
  const weekA     = all.filter(a => (a.start_time || "") >= weekAgo);
  const completed = all.filter(a => a.status === "completed");
  const cancelled = all.filter(a => a.status === "cancelled");
  const noShows   = all.filter(a => a.status === "no_show");

  const monthRev  = monthA.filter(a => a.status === "completed")
                          .reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
  const newPatsWk = pats.filter(p => (p.created_at || "") >= weekAgo).length;

  const noShowRate = all.length > 0
    ? Math.round((noShows.length / all.length) * 100) : 0;
  const cancelRate = all.length > 0
    ? Math.round((cancelled.length / all.length) * 100) : 0;

  return {
    system: `Eres Sofía, asistente ejecutiva del director de la clínica.
Responde preguntas de negocio usando los datos reales a continuación.
Responde en el idioma de la pregunta.

MÉTRICAS (${new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CITAS HOY:           ${todayA.length} programadas
ESTA SEMANA:         ${weekA.length} citas
ESTE MES:            ${monthA.length} citas
INGRESOS ESTE MES:   €${monthRev.toFixed(0)} (citas completadas)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PACIENTES ACTIVOS:   ${pats.length}
NUEVOS ESTA SEMANA:  ${newPatsWk}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASA NO-SHOWS:       ${noShowRate}% (${noShows.length} de ${all.length})
TASA CANCELACIONES:  ${cancelRate}% (${cancelled.length} de ${all.length})
COMPLETADAS TOTAL:   ${completed.length}
PENDIENTES CONFIRMAR:${Array.isArray(pending) ? pending.length : 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REGLAS:
- Usa solo estos datos. Nunca inventes cifras.
- Para tendencias, solo comenta lo que los datos muestran.
- No reveles datos individuales de pacientes (GDPR).
- Sé conciso. El director necesita respuestas rápidas.`,
    max_tokens: 400,
  };
}

// -- MAIN HANDLER ---------------------------------------------
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!SB_URL || !SB_SERVICE_KEY) {
    return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY no configurada" });
  }
  if (!CLAUDE_API_KEY) {
    return res.status(500).json({ error: "CLAUDE_API_KEY no configurada" });
  }
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { messages, clinic_id: client_clinic_id, mode } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array requerido" });
  }

  // Try to resolve clinic from JWT; fall back to client-provided id (reception mode only)
  let clinic_id = await resolveClinic(req.headers.authorization);
  if (!clinic_id) clinic_id = client_clinic_id; // for unauthenticated reception use
  if (!clinic_id) return res.status(400).json({ error: "clinic_id requerido" });

  const activeMode = mode || "reception";

  let ctx;
  try {
    if      (activeMode === "copilot") ctx = await copilotContext(clinic_id);
    else if (activeMode === "ceo")     ctx = await ceoContext(clinic_id);
    else                               ctx = await receptionContext(clinic_id);
  } catch (e) {
    console.error("Context build error:", e.message);
    ctx = { system: "Eres Sofía, asistente dental. Responde en el idioma del usuario.", max_tokens: 300 };
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: ctx.max_tokens || 350,
        system:     ctx.system,
        messages:   messages.slice(-10),
      }),
    });

    if (!r.ok) {
      const e = await r.text();
      return res.status(r.status).json({ error: "AI error", detail: e.slice(0, 200) });
    }

    const data = await r.json();
    return res.status(200).json({
      text: data.content?.[0]?.text || "No pude procesar tu mensaje.",
      mode: activeMode,
    });

  } catch (e) {
    console.error("sofia-chat error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
