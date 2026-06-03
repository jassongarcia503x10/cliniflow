// ============================================================
// CLINIFLOW - SOFIA CHAT PROXY
// api/sofia-chat.js
// El dashboard llama a este endpoint (no a Anthropic directo)
// Mantiene la API key segura en el servidor
// ============================================================

const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY;
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, clinic_id, system } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Construir system prompt con datos reales si hay clinic_id
  let systemPrompt = system || "You are Sofia, a professional dental assistant. Be warm, brief, and always offer to book appointments.";

  if (clinic_id) {
    try {
      // Cargar clínica y tratamientos reales para el prompt
      const [clinicRes, treatsRes] = await Promise.all([
        fetch(SUPABASE_URL + "/rest/v1/clinics?select=*&id=eq." + clinic_id + "&limit=1", {
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_KEY }
        }),
        fetch(SUPABASE_URL + "/rest/v1/treatments?select=*&clinic_id=eq." + clinic_id, {
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_KEY }
        })
      ]);

      const clinics = await clinicRes.json();
      const treats  = await treatsRes.json();
      const clinic  = Array.isArray(clinics) && clinics.length > 0 ? clinics[0] : null;

      if (clinic) {
        const curr = clinic.currency || "€";
        const priceList = Array.isArray(treats) && treats.length > 0
          ? treats.filter(t => t.active !== false).map(t =>
              t.price_mode === "exact"  ? `• ${t.name}: ${curr}${t.price}` :
              t.price_mode === "from"   ? `• ${t.name}: desde ${curr}${t.price}` :
                                          `• ${t.name}: consultar precio`
            ).join("\n")
          : "Consultar con la clínica";

        systemPrompt = `Eres Sofía, asistente virtual de ${clinic.name}.
Idioma: Responde SIEMPRE en el idioma que use el paciente.
Horario: ${clinic.hours_mon_fri || "Lun-Vie 9:00-18:00"}.
Teléfono: ${clinic.phone || "consultar"}.

TRATAMIENTOS Y PRECIOS (usa SOLO estos):
${priceList}

REGLAS:
1. Máximo 2-3 oraciones por respuesta.
2. Si preguntan precio → dar el precio exacto de la lista.
3. Si el tratamiento no está en la lista → decir que no está disponible.
4. NUNCA diagnostiques enfermedades.
5. Siempre ofrece agendar una cita al final.`;
      }
    } catch (e) {
      console.error("Failed to load clinic data:", e.message);
      // Continuar con system prompt genérico
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: messages.slice(-8), // últimos 8 mensajes para contexto
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Claude API error:", response.status, err);
      return res.status(response.status).json({ error: "AI error", detail: err.substring(0, 200) });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "Lo siento, no pude procesar tu mensaje.";

    return res.status(200).json({ text, model: data.model });

  } catch (error) {
    console.error("sofia-chat error:", error.message);
    return res.status(500).json({ error: "Internal error", detail: error.message });
  }
};
