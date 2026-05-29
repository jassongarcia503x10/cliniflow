// ============================================================
// CLINIFLOW - TEST SUPABASE
// Diagnostico completo de conexion Supabase
// Uso: abrir en navegador
// https://cliniflow-theta.vercel.app/api/test-supabase
// ============================================================

module.exports = async function handler(req, res) {
  console.log('=== TEST SUPABASE INICIADO ===');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  // 1. Verificar variables de entorno
  const envCheck = {
    SUPABASE_URL_exists: !!SUPABASE_URL,
    SUPABASE_URL_value: SUPABASE_URL,
    SUPABASE_URL_has_trailing_slash: SUPABASE_URL?.endsWith('/'),
    SUPABASE_URL_length: SUPABASE_URL?.length,
    SERVICE_KEY_exists: !!SUPABASE_SERVICE_KEY,
    SERVICE_KEY_first_20: SUPABASE_SERVICE_KEY?.substring(0, 20),
    SERVICE_KEY_length: SUPABASE_SERVICE_KEY?.length,
  };

  console.log('ENV CHECK:', JSON.stringify(envCheck, null, 2));

  // 2. Construir URL exactamente como lo hace getClinic()
  const urlWithPossibleSlash = SUPABASE_URL + '/rest/v1/clinics?select=*&limit=1';
  const urlClean = SUPABASE_URL?.replace(/\/$/, '') + '/rest/v1/clinics?select=*&limit=1';

  console.log('URL con posible slash:', urlWithPossibleSlash);
  console.log('URL limpia:', urlClean);

  const results = {};

  // 3. Test con URL original (como la usa el webhook actual)
  try {
    console.log('Test 1: URL original...');
    const r1 = await fetch(urlWithPossibleSlash, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
      },
    });
    const text1 = await r1.text();
    console.log('Test 1 status:', r1.status);
    console.log('Test 1 response:', text1.substring(0, 500));
    results.test1_original_url = {
      status: r1.status,
      ok: r1.ok,
      response: text1.substring(0, 500),
      data: r1.ok ? JSON.parse(text1) : null
    };
  } catch (e) {
    console.error('Test 1 error:', e.message);
    results.test1_original_url = { error: e.message };
  }

  // 4. Test con URL limpia (sin trailing slash)
  try {
    console.log('Test 2: URL limpia...');
    const r2 = await fetch(urlClean, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
      },
    });
    const text2 = await r2.text();
    console.log('Test 2 status:', r2.status);
    console.log('Test 2 response:', text2.substring(0, 500));
    results.test2_clean_url = {
      status: r2.status,
      ok: r2.ok,
      response: text2.substring(0, 500),
      data: r2.ok ? JSON.parse(text2) : null
    };
  } catch (e) {
    console.error('Test 2 error:', e.message);
    results.test2_clean_url = { error: e.message };
  }

  // 5. Test con Prefer header
  try {
    console.log('Test 3: Con Prefer header...');
    const r3 = await fetch(urlClean, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });
    const text3 = await r3.text();
    console.log('Test 3 status:', r3.status);
    console.log('Test 3 response:', text3.substring(0, 500));
    results.test3_with_prefer = {
      status: r3.status,
      ok: r3.ok,
      response: text3.substring(0, 500)
    };
  } catch (e) {
    console.error('Test 3 error:', e.message);
    results.test3_with_prefer = { error: e.message };
  }

  // 6. Test con anon key (para comparar)
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (ANON_KEY) {
    try {
      console.log('Test 4: Con anon key...');
      const r4 = await fetch(urlClean, {
        method: 'GET',
        headers: {
          'apikey': ANON_KEY,
          'Authorization': 'Bearer ' + ANON_KEY,
        },
      });
      const text4 = await r4.text();
      results.test4_anon_key = {
        status: r4.status,
        ok: r4.ok,
        response: text4.substring(0, 500)
      };
    } catch (e) {
      results.test4_anon_key = { error: e.message };
    }
  }

  // 7. Identificar cual funciono
  const working = Object.entries(results).find(([, v]) => v.ok && v.data?.length > 0);

  console.log('=== RESULTADO FINAL ===');
  console.log('Funcionando:', working ? working[0] : 'ninguno');
  console.log('======================');

  return res.status(200).json({
    env_check: envCheck,
    urls_tested: {
      original: urlWithPossibleSlash,
      clean: urlClean,
    },
    working_test: working ? working[0] : 'NINGUNO - ver detalles',
    clinic_data_found: working ? working[1].data : null,
    all_results: results
  });
};
