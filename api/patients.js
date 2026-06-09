// ============================================================
// CLINIFLOW - api/patients.js
// Handles GET + POST + PATCH for patients
// Uses service_role key - bypasses RLS entirely
// Auth: verifies JWT, resolves clinic_id from clinic_users
// Never trusts clinic_id from frontend
// ============================================================

const SB_URL          = process.env.SUPABASE_URL;
const SB_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const SB = {
  apikey:        SB_SERVICE_KEY,
  Authorization: "Bearer " + SB_SERVICE_KEY,
  "Content-Type": "application/json",
};

// Verify JWT and return { user_id, clinic_id } or throw
async function resolveClinic(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw Object.assign(new Error("Token requerido"), { status: 401 });
  }
  const token = authHeader.slice(7);

  // 1. Verify token with Supabase Auth
  const userRes = await fetch(SB_URL + "/auth/v1/user", {
    headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + token },
  });
  if (!userRes.ok) {
    throw Object.assign(new Error("Token inválido"), { status: 401 });
  }
  const user = await userRes.json();
  if (!user.id) throw Object.assign(new Error("Usuario no autenticado"), { status: 401 });

  // 2. Get clinic_id from clinic_users (service key - no RLS)
  const cuRes = await fetch(
    SB_URL + "/rest/v1/clinic_users?select=clinic_id&user_id=eq." + user.id + "&limit=1",
    { headers: SB }
  );
  const cu = await cuRes.json();
  if (!Array.isArray(cu) || cu.length === 0) {
    throw Object.assign(new Error("Sin clínica asignada"), { status: 403 });
  }

  return { user_id: user.id, clinic_id: cu[0].clinic_id };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!SB_URL || !SB_SERVICE_KEY) {
    return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY no configurada" });
  }

  let clinic_id, user_id;
  try {
    ({ clinic_id, user_id } = await resolveClinic(req.headers.authorization));
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  // -- GET - list patients for the clinic ---------------------
  if (req.method === "GET") {
    const r = await fetch(
      SB_URL + "/rest/v1/patients?select=*&clinic_id=eq." + clinic_id + "&order=name.asc",
      { headers: SB }
    );
    const data = await r.json();
    return res.status(200).json(Array.isArray(data) ? data : []);
  }

  // -- POST - create new patient -------------------------------
  if (req.method === "POST") {
    const { name, phone, email, allergies, notes } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "El nombre es requerido" });
    }

    const payload = {
      clinic_id,                                    // always from verified JWT
      name:      String(name).trim(),
      phone:     phone  ? String(phone).trim()  : null,
      email:     email  ? String(email).trim()  : null,
      allergies: Array.isArray(allergies) ? allergies : [],
      notes:     notes  ? String(notes)         : null,
      source:    "manual",
      active:    true,
    };

    const r = await fetch(SB_URL + "/rest/v1/patients", {
      method:  "POST",
      headers: Object.assign({}, SB, { Prefer: "return=representation" }),
      body:    JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });
    return res.status(201).json(Array.isArray(data) ? data[0] : data);
  }

  // -- PATCH - update existing patient ------------------------
  if (req.method === "PATCH") {
    const { id, name, phone, email, allergies, notes, active } = req.body || {};
    if (!id) return res.status(400).json({ error: "id requerido" });

    // Confirm patient belongs to this clinic (security check)
    const checkRes = await fetch(
      SB_URL + "/rest/v1/patients?select=id&id=eq." + id + "&clinic_id=eq." + clinic_id + "&limit=1",
      { headers: SB }
    );
    const check = await checkRes.json();
    if (!Array.isArray(check) || check.length === 0) {
      return res.status(403).json({ error: "Paciente no encontrado en tu clínica" });
    }

    const patch = {};
    if (name     !== undefined) patch.name      = String(name).trim();
    if (phone    !== undefined) patch.phone     = phone  ? String(phone).trim()  : null;
    if (email    !== undefined) patch.email     = email  ? String(email).trim()  : null;
    if (allergies !== undefined) patch.allergies = Array.isArray(allergies) ? allergies : [];
    if (notes    !== undefined) patch.notes     = notes  ? String(notes)         : null;
    if (active   !== undefined) patch.active    = Boolean(active);

    const r = await fetch(
      SB_URL + "/rest/v1/patients?id=eq." + id + "&clinic_id=eq." + clinic_id,
      {
        method:  "PATCH",
        headers: Object.assign({}, SB, { Prefer: "return=representation" }),
        body:    JSON.stringify(patch),
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });
    return res.status(200).json(Array.isArray(data) ? data[0] : data);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
