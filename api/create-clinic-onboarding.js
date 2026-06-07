// ============================================================
// CLINIFLOW — CREATE CLINIC ONBOARDING
// api/create-clinic-onboarding.js
//
// Flujo: usuario nuevo se registra → llama este endpoint
// El endpoint verifica JWT, crea clínica limpia, vincula usuario
// Usa service key SOLO en backend — nunca en el frontend
// ============================================================

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SB_HDR = {
  apikey:        SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
  "Content-Type": "application/json",
  Prefer:        "return=representation",
};

async function sbGet(path) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: Object.assign({}, SB_HDR, { Prefer: undefined }),
  });
  const t = await r.text();
  return t ? JSON.parse(t) : [];
}

async function sbPost(table, data) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + table, {
    method:  "POST",
    headers: SB_HDR,
    body:    JSON.stringify(data),
  });
  const t = await r.text();
  if (!r.ok) throw new Error("SB " + r.status + ": " + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // ── 1. VERIFICAR JWT DEL USUARIO ─────────────────────────
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Token requerido" });

  // Verificar token con Supabase Auth (service key valida cualquier JWT del proyecto)
  const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      apikey:        SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + token,
    },
  });
  if (!userRes.ok) return res.status(401).json({ error: "Token inválido o expirado" });

  const user = await userRes.json();
  if (!user.id) return res.status(401).json({ error: "Usuario no autenticado" });

  const userId = user.id;
  const email  = user.email || "";

  // ── 2. VERIFICAR QUE NO TENGA CLÍNICA YA ─────────────────
  const existing = await sbGet(
    "clinic_users?select=clinic_id,role,clinics(*)&user_id=eq." + userId + "&limit=1"
  );
  if (existing && existing.length > 0 && existing[0].clinics) {
    // Ya tiene clínica — devolver la existente sin crear otra
    return res.status(200).json({
      clinic:    existing[0].clinics,
      role:      existing[0].role,
      created:   false,
      message:   "Clínica existente encontrada",
    });
  }

  // ── 3. CREAR CLÍNICA NUEVA LIMPIA ─────────────────────────
  const now = new Date().toISOString();
  const clinicName = email.split("@")[0].charAt(0).toUpperCase() +
                     email.split("@")[0].slice(1) + " Dental";

  const clinicRows = await sbPost("clinics", {
    name:           clinicName,
    email:          email,
    city:           "",
    country:        "",
    currency:       "EUR",
    plan:           "trial",
    language:       "es",
    timezone:       "Europe/Madrid",
    brand_color:    "#0066ff",
    hours_mon_fri:  "9:00-18:00",
    hours_saturday: "Cerrado",
    created_at:     now,
  });

  if (!clinicRows || !clinicRows[0]) {
    return res.status(500).json({ error: "No se pudo crear la clínica" });
  }
  const clinic = clinicRows[0];

  // ── 4. VINCULAR USUARIO → CLÍNICA (owner) ─────────────────
  const cuRows = await sbPost("clinic_users", {
    user_id:    userId,
    clinic_id:  clinic.id,
    role:       "owner",
    created_at: now,
  });

  if (!cuRows || !cuRows[0]) {
    return res.status(500).json({ error: "No se pudo vincular usuario a clínica" });
  }

  return res.status(201).json({
    clinic,
    role:    "owner",
    created: true,
    message: "Clínica creada correctamente",
  });
};
