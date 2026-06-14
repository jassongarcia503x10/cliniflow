// ============================================================
// CLINIFLOW - api/treatment-catalog.js
// GET -> search the GLOBAL treatment_catalog (read-only)
//
// Returns global reference procedures with an `already_activated`
// flag computed per-clinic by checking treatments.catalog_id.
//
// Security:
//   - JWT -> clinic_users -> clinic_id  (never from query params)
//   - service-role key used server-side; every clinic-scoped read
//     is filtered manually by the JWT-derived clinic_id
//   - reads treatment_catalog (global) and treatments (own clinic)
//   - never returns clinic prices
// ============================================================

const { requireClinicUser } = require("../lib/auth");

const SB_URL         = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SB = {
  apikey:         SB_SERVICE_KEY,
  Authorization:  "Bearer " + SB_SERVICE_KEY,
  "Content-Type": "application/json",
};

// Valid category values — must match the treatment_catalog CHECK constraint
// (202606140001_treatment_catalog.sql). Used to reject unknown categories.
const VALID_CATEGORIES = new Set([
  "preventive", "restorative", "endodontics", "surgery",
  "orthodontics", "prosthetics", "periodontics", "diagnostic",
  "pediatric", "anesthesia", "other",
]);

const VALID_LANGS = new Set(["es", "en", "hr"]);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT     = 50;
const MAX_Q_LENGTH  = 100;

// Log full Supabase failure details server-side, but never leak raw
// database messages or codes to the client — return a generic 502.
function returnSupabaseError(res, response, data, operation) {
  const details = data && typeof data === "object" ? data : {};

  console.error("[treatment-catalog] Supabase " + operation + " failed", {
    status:  response.status,
    code:    details.code,
    message: details.message || (typeof data === "string" ? data : undefined),
    details: details.details,
    hint:    details.hint,
  });

  return res.status(502).json({ error: "Error al consultar el catálogo" });
}

// -- Sanitize a free-text search term for use inside a PostgREST
// or=() filter. Strips the structural characters PostgREST uses to
// parse filters so a term can never inject extra conditions.
function sanitizeTerm(raw) {
  return String(raw)
    .slice(0, MAX_Q_LENGTH)
    .trim()
    .replace(/[,()"{}\\*]/g, " ")  // PostgREST/array structural chars + ilike wildcard
    .replace(/\s+/g, " ")
    .trim();
}

// -- MAIN HANDLER ---------------------------------------------
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!SB_URL || !SB_SERVICE_KEY) {
    return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY no configurada" });
  }

  // GET only — reject everything else
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Método no permitido" });
  }

  // -- Authenticate; clinic_id derives only from the JWT ------
  let clinic_id;
  try {
    ({ clinic_id } = await requireClinicUser(req.headers.authorization));
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const params = req.query || {};

  // -- Validate inputs ----------------------------------------
  // lang
  let lang = typeof params.lang === "string" ? params.lang.toLowerCase().trim() : "es";
  if (!VALID_LANGS.has(lang)) lang = "es";

  // category (optional). Reject unknown values to fail fast.
  let category = null;
  if (params.category !== undefined && params.category !== "") {
    const c = String(params.category).toLowerCase().trim();
    if (!VALID_CATEGORIES.has(c)) {
      return res.status(400).json({
        error: "Categoría inválida",
        valid_categories: Array.from(VALID_CATEGORIES),
      });
    }
    category = c;
  }

  // limit: integer, default 20, clamped to [1, 50]
  let limit = DEFAULT_LIMIT;
  if (params.limit !== undefined && params.limit !== "") {
    const parsed = parseInt(params.limit, 10);
    if (!Number.isNaN(parsed)) limit = Math.min(Math.max(parsed, 1), MAX_LIMIT);
  }

  // q: trim, cap length, sanitize for filter safety
  const rawQ = typeof params.q === "string" ? params.q : "";
  const trimmedQ = rawQ.trim().slice(0, MAX_Q_LENGTH);
  const term = sanitizeTerm(rawQ);

  // -- Build the catalog query (global, active only) ----------
  let url = SB_URL + "/rest/v1/treatment_catalog"
    + "?select=id,slug,name_es,name_en,name_hr,aliases,category,"
    + "default_duration_minutes,default_price_mode"
    + "&active=eq.true";

  if (category) url += "&category=eq." + encodeURIComponent(category);

  // q searches name_es / name_en / name_hr / slug (substring, ilike)
  // and aliases (exact element membership — the safe array operation).
  if (term) {
    const pat = "*" + term + "*";
    const orParts = [
      "name_es.ilike." + pat,
      "name_en.ilike." + pat,
      "name_hr.ilike." + pat,
      "slug.ilike."    + pat,
      "aliases.cs.{" + term + "}",
    ];
    url += "&or=(" + encodeURIComponent(orParts.join(",")) + ")";
  }

  // Order: name in the requested language, then slug for stability
  url += "&order=name_" + lang + ".asc,slug.asc";
  url += "&limit=" + limit;

  const catRes  = await fetch(url, { headers: SB });
  const catalog = await catRes.json();
  if (!catRes.ok) return returnSupabaseError(res, catRes, catalog, "catalog search");

  const rows = Array.isArray(catalog) ? catalog : [];

  // -- Resolve activation status for THIS clinic --------------
  // Include inactive linked treatments too, so already_activated is
  // true even when a clinic has soft-deleted (active=false) its copy.
  const activationByCatalog = {};
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const inList = "(" + ids.map((id) => encodeURIComponent(id)).join(",") + ")";
    const actRes = await fetch(
      SB_URL + "/rest/v1/treatments"
        + "?select=id,catalog_id,active"
        + "&clinic_id=eq." + encodeURIComponent(clinic_id)
        + "&catalog_id=in." + inList,
      { headers: SB }
    );
    const acts = await actRes.json();
    if (!actRes.ok) return returnSupabaseError(res, actRes, acts, "activation lookup");
    if (Array.isArray(acts)) {
      // If multiple clinic treatments link to one catalog row, prefer
      // an active one so already_activated reflects the live state.
      for (const a of acts) {
        if (!a.catalog_id) continue;
        const existing = activationByCatalog[a.catalog_id];
        if (!existing || (a.active && !existing.active)) {
          activationByCatalog[a.catalog_id] = { id: a.id, active: !!a.active };
        }
      }
    }
  }

  // -- Shape the response (no clinic prices) ------------------
  const data = rows.map((r) => {
    const link = activationByCatalog[r.id] || null;
    return {
      id:    r.id,
      slug:  r.slug,
      name:  r["name_" + lang] || r.name_es,
      names: { es: r.name_es, en: r.name_en, hr: r.name_hr },
      category: r.category,
      aliases:  Array.isArray(r.aliases) ? r.aliases : [],
      default_duration_minutes: r.default_duration_minutes,
      default_price_mode:       r.default_price_mode,
      already_activated:        !!link,
      clinic_treatment:         link ? { id: link.id, active: link.active } : null,
    };
  });

  return res.status(200).json({
    data,
    meta: {
      query:    trimmedQ,
      category: category,
      lang,
      limit,
      count: data.length,
    },
  });
};
