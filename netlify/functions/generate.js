const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method tidak dibenarkan.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const {
      mode,
      scopeLabel,
      questions,
      context,
      studentAnswers,
      questionCount
    } = body;

    let systemText = '';
    let userText = '';
    let model = 'gpt-5.4-mini';
    const totalQuestions = Number(questionCount) || 10;

    if (mode === 'mcq') {
      model = 'gpt-5.4-nano';

      systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang teliti.
Jana TEPAT ${totalQuestions} soalan objektif berkualiti tinggi.
Balas dalam JSON SAHAJA dengan format:
{
  "questions": [
    {
      "q": "Soalan",
      "opts": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "ans": 0,
      "exp": "Penjelasan ringkas"
    }
  ]
}

Peraturan:
- Bahasa Melayu
- Fakta tepat
- Tiada soalan berulang
- Sesuai untuk murid sekolah menengah
- Pilihan jawapan mesti 4 sahaja
- "ans" ialah index 0 hingga 3
- Pastikan jawapan tepat
- Elakkan pilihan jawapan yang terlalu jelas salah
`;

      userText = `Jana ${totalQuestions} soalan objektif Sejarah KSSM bagi skop: ${scopeLabel}.`;
    } else if (mode === 'structured') {
      model = 'gpt-5.4-mini';

      systemText = `
Anda ialah guru Sejarah KSSM Malaysia.
Jana satu set soalan Kertas 2 berstruktur.
Balas dalam JSON SAHAJA dengan format:
{
  "context": "Petikan atau rangsangan ringkas",
  "questions": [
    { "id": "a", "q": "Soalan", "marks": 2, "model": "Jawapan contoh" },
    { "id": "b", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" },
    { "id": "c", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" }
  ]
}

Peraturan:
- Bahasa Melayu
- Jumlah markah 10
- Fakta tepat
- Sesuai gaya SPM Sejarah
- Jawapan model perlu padat dan berguna
`;

      userText = `Jana satu set soalan struktur Sejarah untuk skop: ${scopeLabel}.`;
    } else if (mode === 'mark-structured') {
      model = 'gpt-5.4-mini';

      systemText = `
Anda ialah pemeriksa Sejarah KSSM Malaysia.
Semak jawapan murid dengan adil berdasarkan kehendak soalan dan jawapan model.
Balas dalam JSON SAHAJA dengan format:
{
  "results": [
    { "id": "a", "marks_awarded": 1, "feedback": "Maklum balas ringkas" }
  ],
  "total": 0
}

Peraturan:
- Bahasa Melayu
- Maklum balas jelas dan membina
- Markah realistik
- Jangan terlalu kedekut dan jangan terlalu murah markah
`;

      userText = `
Konteks:
${context || ''}

Soalan:
${JSON.stringify(questions || [])}

Jawapan murid:
${JSON.stringify(studentAnswers || {})}
`;
    } else {
      return jsonResponse(400, { error: 'Mode tidak sah.' });
    }

    const response = await client.responses.create({
      model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemText }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userText }]
        }
      ],
      text: {
        format: {
          type: 'json_object'
        }
      }
    });

    const outputText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      '';

    if (!outputText) {
      return jsonResponse(500, { error: 'AI tidak memulangkan data.' });
    }

    const parsed = JSON.parse(outputText);
    return jsonResponse(200, parsed);

  } catch (error) {
    console.error('Function error full:', error);

    let userMessage = 'Ralat backend AI.';
    const apiMessage = error?.error?.message || error?.message || '';
    const errorCode = error?.code || error?.error?.code || null;
    const errorType = error?.type || error?.error?.type || null;
    const errorStatus = error?.status || null;

    if (
      errorStatus === 429 ||
      errorCode === 'insufficient_quota' ||
      errorType === 'insufficient_quota'
    ) {
      userMessage = 'Kuota AI telah habis atau billing API belum aktif. Sila semak OpenAI billing.';
    } else if (errorStatus === 401) {
      userMessage = 'API key tidak sah atau tidak dibaca oleh server.';
    } else if (errorStatus === 404) {
      userMessage = 'Model AI tidak dijumpai.';
    } else if (
      String(apiMessage).toLowerCase().includes('mismatched source ip') ||
      String(apiMessage).toLowerCase().includes('mismatched client ip') ||
      String(errorCode).toLowerCase().includes('mismatched_client_ip')
    ) {
      userMessage = 'Ralat sambungan rangkaian dikesan (mismatched source IP). Cuba matikan VPN/Private Relay dan mulakan semula netlify dev.';
    } else if (apiMessage) {
      userMessage = apiMessage;
    }

    return jsonResponse(500, {
      error: userMessage,
      debug: {
        message: apiMessage || null,
        code: errorCode,
        type: errorType,
        status: errorStatus
      }
    });
  }
};