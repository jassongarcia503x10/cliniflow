// ============================================================
// CLINIFLOW - SOFIA VISION
// api/sofia-vision.js
// Análisis asistido de radiografías con Claude Vision
// ============================================================

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const HDR = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
  "Content-Type": "application/json",
};

const XRAY_PROMPT = `Eres un asistente de análisis radiográfico dental. Tu función es apoyar al odontólogo identificando hallazgos visuales en imágenes radiográficas.

INSTRUCCIONES:
1. Analiza la imagen con detalle clínico.
2. Identifica hallazgos relevantes (caries, pérdida ósea, lesiones, implantes, restauraciones, etc.).
3. Describe la ubicación usando nomenclatura dental estándar (FDI/ISO).
4. Genera un resumen clínico estructurado.
5. NO emitas diagnósticos definitivos.
6. NO recomiendes tratamientos específicos.
7. Siempre indica que el análisis requiere validación profesional.

FORMATO DE RESPUESTA (JSON):
{
  "tipo_imagen": "panorámica|periapical|bitewing|cbct|desconocida",
  "calidad_imagen": "buena|regular|mala",
  "hallazgos": [
    {
      "pieza": "número FDI o zona",
      "hallazgo": "descripción del hallazgo",
      "severidad": "leve|moderada|severa|no determinada",
      "requiere_atencion": true/false
    }
  ],
  "areas_sin_patologia": ["descripción de áreas normales relevantes"],
  "resumen_clinico": "Resumen general en 2-3 oraciones",
  "recomendacion_general": "Evaluación clínica recomendada",
  "disclaimer": "Este análisis es una herramienta de apoyo diagnóstico. No sustituye el criterio clínico del odontólogo tratante. La interpretación final y el diagnóstico son responsabilidad del profesional.",
  "confianza": "alta|media|baja"
}`;

async function saveAnalysis(data) {
  try {
    const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/xray_analyses";
    await fetch(url, {
      method: "POST",
      headers: { ...HDR, Prefer: "return=minimal" },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.error("Failed to save xray analysis:", e.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image_base64, image_type, media_type, clinic_id, patient_name, patient_phone } = req.body || {};

  if (!image_base64) return res.status(400).json({ error: "image_base64 requerido" });
  if (!clinic_id)    return res.status(400).json({ error: "clinic_id requerido" });

  const mediaType = media_type || "image/jpeg";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6", // Usar modelo más capaz para imágenes médicas
        max_tokens: 1500,
        system: XRAY_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: image_base64,
              },
            },
            {
              type: "text",
              text: `Analiza esta ${image_type || "radiografía dental"} y responde ÚNICAMENTE con el JSON especificado en el sistema. No agregues texto fuera del JSON.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: "Vision API error", detail: err.substring(0, 300) });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "{}";

    // Parsear JSON de respuesta
    let analysis;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "No se pudo parsear", raw: rawText };
    } catch (e) {
      analysis = { error: "Parse error", raw: rawText.substring(0, 500) };
    }

    // Guardar en Supabase
    await saveAnalysis({
      clinic_id,
      patient_name:  patient_name || "Paciente",
      patient_phone: patient_phone || null,
      image_type:    image_type || "unknown",
      findings:      analysis,
      ai_summary:    analysis.resumen_clinico || null,
      created_at:    new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      analysis,
      disclaimer: "⚠️ Análisis asistido por IA. No sustituye el criterio clínico del odontólogo. Requiere validación profesional.",
    });

  } catch (error) {
    console.error("sofia-vision error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
