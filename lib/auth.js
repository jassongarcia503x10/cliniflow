const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SERVICE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
};

function authError(message, status) {
  return Object.assign(new Error(message), { status });
}

async function requireClinicUser(authHeader, allowedRoles) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw authError("Supabase no configurado", 500);
  }
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw authError("Token requerido", 401);
  }

  const token = authHeader.slice(7).trim();
  const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: "Bearer " + token },
  });
  if (!userRes.ok) throw authError("Token invalido o expirado", 401);

  const user = await userRes.json();
  if (!user.id) throw authError("Usuario no autenticado", 401);

  const membershipRes = await fetch(
    SUPABASE_URL + "/rest/v1/clinic_users?select=clinic_id,role&user_id=eq." +
      encodeURIComponent(user.id) + "&limit=1",
    { headers: SERVICE_HEADERS }
  );
  if (!membershipRes.ok) throw authError("No se pudo verificar la clinica", 500);

  const memberships = await membershipRes.json();
  if (!Array.isArray(memberships) || memberships.length === 0) {
    throw authError("Sin clinica asignada", 403);
  }

  const membership = memberships[0];
  if (Array.isArray(allowedRoles) && !allowedRoles.includes(membership.role)) {
    throw authError("Permisos insuficientes", 403);
  }

  return {
    user_id: user.id,
    email: user.email || null,
    clinic_id: membership.clinic_id,
    role: membership.role,
  };
}

module.exports = { requireClinicUser };
