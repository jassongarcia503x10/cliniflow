// ============================================================
// CLINIFLOW - TEST SEND FINAL
// 360dialog waba-v2
// Uso:
// /api/test-send?phone=385976769215
// ============================================================

module.exports = async function handler(req, res) {
  const targetPhone = req.query.phone;

  if (!targetPhone) {
    return res.status(400).json({
      error: 'Falta parametro phone',
      uso: '/api/test-send?phone=385976769215',
      nota: 'Numero sin + ni espacios'
    });
  }

  const API_KEY = process.env.DIALOG360_API_KEY;

  console.log('=== CLINIFLOW TEST SEND ===');
  console.log('Target:', targetPhone);
  console.log('API KEY EXISTS:', !!API_KEY);

  // Payload oficial Meta / 360dialog
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: targetPhone,
    type: 'text',
    text: {
      body: 'Sofia test OK 🚀 CliniFlow funcionando correctamente'
    }
  };

  console.log('PAYLOAD:', JSON.stringify(payload));

  try {

    // ENDPOINT CORRECTO
    const response = await fetch(
      'https://waba-v2.360dialog.io/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'D360-API-KEY': API_KEY,
        },
        body: JSON.stringify(payload),
      }
    );

    const responseText = await response.text();

    console.log('STATUS:', response.status);
    console.log('RESPONSE:', responseText);

    return res.status(200).json({
      success: response.ok,
      status: response.status,
      target_phone: targetPhone,
      api_key_exists: !!API_KEY,
      payload_sent: payload,
      response: responseText
    });

  } catch (error) {

    console.error('ERROR:', error.message);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
