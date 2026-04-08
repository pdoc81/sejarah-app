const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function getQuestionDistribution(questionCount) {
  const count = Number(questionCount) || 10;
  if (count === 5) return { mudah: 1, sederhana: 2, kbat: 2 };
  if (count === 10) return { mudah: 2, sederhana: 5, kbat: 3 };
  if (count === 20) return { mudah: 5, sederhana: 10, kbat: 5 };
  return { mudah: 2, sederhana: 5, kbat: 3 };
}

function listToBulletText(items) {
  if (!Array.isArray(items) || items.length === 0) return '- Tiada';
  return items.map((item) => `- ${item}`).join('\n');
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickItems(items, limit = 4) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return shuffleArray(items).slice(0, Math.min(limit, items.length));
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error('Error reading JSON file:', filePath, error);
    return null;
  }
}

function loadChapterData(selectedSkop, selectedSesi) {
  if (!selectedSkop || !selectedSesi) return null;

  const filePath = path.join(
    process.cwd(),
    'data',
    'textbooks',
    `form${selectedSkop}`,
    `chapter${selectedSesi}.json`
  );

  return readJsonFile(filePath);
}

function loadExamPattern(mode) {
  const fileName =
    mode === 'mcq'
      ? 'kertas1_patterns.json'
      : mode === 'structured'
        ? 'kertas2_patterns.json'
        : null;

  if (!fileName) return null;

  const filePath = path.join(
    process.cwd(),
    'data',
    'exams',
    'form45',
    fileName
  );

  return readJsonFile(filePath);
}

function buildVariationPlan(chapterData, examPattern, mode, totalQuestions) {
  if (chapterData) {
    return {
      sourceType: 'chapter',
      focusMix: pickItems(
        chapterData.focus_areas || chapterData.learning_points || [],
        mode === 'mcq' ? 5 : 4
      ),
      questionAngles: pickItems(
        chapterData.possible_question_angles || [],
        mode === 'mcq' ? 6 : 4
      ),
      kbatMix: pickItems(
        chapterData.kbat_angles || [],
        mode === 'mcq' ? 3 : 2
      ),
    };
  }

  if (examPattern) {
    if (mode === 'mcq') {
      return {
        sourceType: 'exam',
        questionStyles: pickItems(examPattern.question_styles || [], 5),
        stemPatterns: pickItems(examPattern.common_stem_patterns || [], 4),
        distractorPatterns: pickItems(examPattern.distractor_patterns || [], 3),
        kbatPatterns: pickItems(examPattern.difficulty_profile?.kbat || [], 3),
        topicMix: pickItems(
          [
            ...(examPattern.topic_patterns?.form4 || []),
            ...(examPattern.topic_patterns?.form5 || []),
          ],
          Math.min(6, Math.max(4, Math.ceil(totalQuestions / 2)))
        ),
      };
    }

    return {
      sourceType: 'exam',
      stimulusMix: pickItems(examPattern.stimulus_types || [], 3),
      commandMix: pickItems(examPattern.common_command_words || [], 5),
      kbatPromptMix: pickItems(examPattern.kbat_prompt_patterns || [], 3),
      topicMix: pickItems(examPattern.topic_coverage_examples || [], 4),
    };
  }

  return { sourceType: 'none' };
}

function buildChapterContext(chapterData, variationPlan) {
  if (!chapterData) return '';

  return `
=== KANDUNGAN WAJIB BAB ===
Tingkatan: ${chapterData.form}
Bab: ${chapterData.chapter}
Tajuk: ${chapterData.title}

Sinopsis:
${chapterData.synopsis || 'Tiada sinopsis'}

Isi pembelajaran:
${listToBulletText(chapterData.learning_points)}

Istilah penting:
${listToBulletText(chapterData.key_terms)}

Fakta penting:
${listToBulletText(chapterData.key_facts)}

Fokus penguasaan bab:
${listToBulletText(chapterData.focus_areas)}

Sudut soalan yang dibenarkan:
${listToBulletText(chapterData.possible_question_angles)}

Sudut KBAT:
${listToBulletText(chapterData.kbat_angles)}
=== AKHIR KANDUNGAN WAJIB BAB ===

=== PELAN VARIASI ===
Fokus:
${listToBulletText(variationPlan?.focusMix || [])}

Sudut soalan:
${listToBulletText(variationPlan?.questionAngles || [])}

Sudut KBAT:
${listToBulletText(variationPlan?.kbatMix || [])}
=== AKHIR PELAN VARIASI ===
`;
}

function getExamBatchPlan(examBatchLabel) {
  const plans = {
    form4_a: {
      label: 'Form 4 A',
      form: 4,
      chapters: [1, 2, 3, 4, 5],
      topics: [
        'warisan negara bangsa',
        'nasionalisme',
        'konflik dunia dan pendudukan Jepun',
        'era peralihan kuasa British',
        'Persekutuan Tanah Melayu 1948',
      ],
    },
    form4_b: {
      label: 'Form 4 B',
      form: 4,
      chapters: [6, 7, 8, 9, 10],
      topics: [
        'darurat',
        'usaha ke arah kemerdekaan',
        'pilihan raya',
        'Perlembagaan Persekutuan Tanah Melayu 1957',
        'pemasyhuran kemerdekaan',
      ],
    },
    form5_a: {
      label: 'Form 5 A',
      form: 5,
      chapters: [1, 2, 3, 4, 5],
      topics: [
        'kedaulatan negara',
        'Perlembagaan Persekutuan',
        'Raja Berperlembagaan dan Demokrasi Berparlimen',
        'sistem Persekutuan',
        'pembentukan Malaysia',
      ],
    },
    form5_b: {
      label: 'Form 5 B',
      form: 5,
      chapters: [6, 7, 8, 9, 10],
      topics: [
        'cabaran selepas pembentukan Malaysia',
        'membina kesejahteraan negara',
        'membina kemakmuran negara',
        'dasar luar Malaysia',
        'kecemerlangan Malaysia di persada dunia',
      ],
    },
  };

  return plans[examBatchLabel] || null;
}

function buildExamContext(examPattern, variationPlan, mode, examBatchPlan = null) {
  if (!examPattern) return '';

  if (mode === 'mcq') {
    return `
=== POLA MOD PERCUBAAN KERTAS 1 ===
Sumber: ${examPattern.source || 'Tidak dinyatakan'}
Struktur:
- 20 soalan
- 10 soalan Tingkatan 4
- 10 soalan Tingkatan 5
- 4 pilihan jawapan

Gaya soalan:
${listToBulletText(examPattern.question_styles)}

Stem biasa:
${listToBulletText(examPattern.common_stem_patterns)}

Corak distractor:
${listToBulletText(examPattern.distractor_patterns)}

Topik Tingkatan 4:
${listToBulletText(examPattern.topic_patterns?.form4 || [])}

Topik Tingkatan 5:
${listToBulletText(examPattern.topic_patterns?.form5 || [])}

Pelan variasi:
- Gaya: ${variationPlan?.questionStyles?.join(', ') || '-'}
- Stem: ${variationPlan?.stemPatterns?.join(', ') || '-'}
- KBAT: ${variationPlan?.kbatPatterns?.join(', ') || '-'}
- Topik: ${variationPlan?.topicMix?.join(', ') || '-'}

${examBatchPlan ? `
=== FOKUS BATCH INI ===
Label batch: ${examBatchPlan.label}
Tingkatan fokus: ${examBatchPlan.form}
Bab fokus: ${examBatchPlan.chapters.join(', ')}
Topik fokus: ${examBatchPlan.topics.join(', ')}
=== AKHIR FOKUS BATCH ===
` : ''}
=== AKHIR POLA ===
`;
  }

  return `
=== POLA MOD PERCUBAAN KERTAS 2 ===
Sumber: ${examPattern.source || 'Tidak dinyatakan'}

Stimulus biasa:
${listToBulletText(examPattern.stimulus_types)}

Kata tugas biasa:
${listToBulletText(examPattern.common_command_words)}

Pelan variasi:
- Stimulus: ${variationPlan?.stimulusMix?.join(', ') || '-'}
- Kata tugas: ${variationPlan?.commandMix?.join(', ') || '-'}
- KBAT: ${variationPlan?.kbatPromptMix?.join(', ') || '-'}
- Topik: ${variationPlan?.topicMix?.join(', ') || '-'}
=== AKHIR POLA ===
`;
}

function normalizeMcqQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions.map((q) => {
    if (!q || !Array.isArray(q.opts) || typeof q.ans !== 'number') return q;

    const originalOptions = [...q.opts];
    const correctAnswerText = originalOptions[q.ans];
    const shuffledOptions = shuffleArray(originalOptions);
    const newAnswerIndex = shuffledOptions.findIndex((opt) => opt === correctAnswerText);

    return {
      ...q,
      opts: shuffledOptions,
      ans: newAnswerIndex >= 0 ? newAnswerIndex : q.ans,
    };
  });
}

function sanitizeMcqQuestions(questions, totalQuestions) {
  if (!Array.isArray(questions)) return [];

  const cleaned = questions
    .filter((q) =>
      q &&
      typeof q.q === 'string' &&
      q.q.trim() &&
      Array.isArray(q.opts) &&
      q.opts.length === 4 &&
      typeof q.ans === 'number' &&
      q.ans >= 0 &&
      q.ans <= 3 &&
      typeof q.exp === 'string' &&
      q.exp.trim()
    )
    .map((q) => ({
      q: String(q.q).trim(),
      opts: q.opts.map((opt) => String(opt).trim()),
      ans: Number(q.ans),
      exp: String(q.exp).trim(),
      level: ['mudah', 'sederhana', 'kbat'].includes(String(q.level).toLowerCase())
        ? String(q.level).toLowerCase()
        : 'sederhana',
      form: q.form ? Number(q.form) : undefined,
      chapter: q.chapter ? Number(q.chapter) : undefined,
    }));

  return cleaned.slice(0, totalQuestions);
}

function dedupeMcqQuestions(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    const key = String(q.q || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeStructuredSet(parsed) {
  const context = typeof parsed?.context === 'string' ? parsed.context.trim() : '';
  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];

  const questions = rawQuestions
    .filter((q) =>
      q &&
      typeof q.id === 'string' &&
      q.id.trim() &&
      typeof q.q === 'string' &&
      q.q.trim() &&
      Number.isFinite(Number(q.marks)) &&
      typeof q.model === 'string'
    )
    .map((q) => ({
      id: String(q.id).trim().toLowerCase(),
      q: String(q.q).trim(),
      marks: Number(q.marks),
      model: String(q.model).trim(),
    }))
    .slice(0, 3);

  return {
    context: context || 'Tiada konteks.',
    questions,
  };
}

function sanitizeMarkedStructured(parsed) {
  const rawResults = Array.isArray(parsed?.results) ? parsed.results : [];
  const results = rawResults
    .filter((r) => r && typeof r.id === 'string')
    .map((r) => ({
      id: String(r.id).trim().toLowerCase(),
      marks_awarded: Number.isFinite(Number(r.marks_awarded)) ? Number(r.marks_awarded) : 0,
      feedback: typeof r.feedback === 'string' && r.feedback.trim()
        ? String(r.feedback).trim()
        : 'Tiada maklum balas.',
    }));

  const total =
    Number.isFinite(Number(parsed?.total))
      ? Number(parsed.total)
      : results.reduce((sum, item) => sum + item.marks_awarded, 0);

  return { results, total };
}

function cleanModelText(text) {
  let cleaned = String(text || '').trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

async function requestModelJsonOnce({ model, systemText, userText, maxOutputTokens = 2200 }) {
  const response = await client.responses.create({
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemText }] },
      { role: 'user', content: [{ type: 'input_text', text: userText }] },
    ],
    text: { format: { type: 'json_object' } },
    max_output_tokens: maxOutputTokens,
  });

  const outputText =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text ||
    '';

  if (!outputText) {
    throw new Error('AI tidak memulangkan data.');
  }

  return JSON.parse(cleanModelText(outputText));
}

async function requestModelJsonWithRetry({
  model,
  systemText,
  userText,
  maxOutputTokens = 2200,
  retries = 3,
}) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const retrySystem =
        attempt === 1
          ? systemText
          : `${systemText}

AMARAN TAMBAHAN:
- Respons sebelum ini rosak.
- Pulangkan JSON SAH sahaja.
- Jangan tambah apa-apa di luar objek JSON.
- Pastikan semua string ditutup dengan betul.
- Pastikan array dan koma lengkap.`;

      return await requestModelJsonOnce({
        model,
        systemText: retrySystem,
        userText,
        maxOutputTokens,
      });
    } catch (error) {
      lastError = error;
      console.error(`JSON parse/model attempt ${attempt} failed:`, error.message);
    }
  }

  throw lastError || new Error('Gagal mendapatkan JSON sah daripada AI.');
}

function buildChapterMcqPrompts({
  totalQuestions,
  distribution,
  chapterData,
  chapterContext,
  scopeLabel,
  selectedSkop,
  selectedSesi,
}) {
  const systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang sangat ketat terhadap skop bab.
Tugas anda ialah menjana soalan HANYA daripada kandungan bab yang diberi.
JANGAN campurkan fakta daripada bab lain.
JANGAN hasilkan soalan umum di luar bab.
JANGAN hasilkan soalan yang tidak boleh disokong oleh data bab.

${chapterContext}

Balas dalam JSON SAHAJA dengan format:
{
  "questions": [
    {
      "q": "Soalan",
      "opts": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "ans": 0,
      "exp": "Penjelasan ringkas yang merujuk kandungan bab",
      "level": "mudah"
    }
  ]
}

Peraturan:
- Bahasa Melayu
- semua soalan mesti datang daripada kandungan bab
- pilihan jawapan mesti 4
- ans ialah 0 hingga 3
- level mesti mudah / sederhana / kbat
- jangan ulang pola soalan yang sama
- pulangkan TEPAT ${totalQuestions} soalan
- exp maksimum 25 patah perkataan
`;

  const userText = `
Skop dipilih pengguna:
${scopeLabel}

Tingkatan dipilih:
${selectedSkop}

Bab dipilih:
${selectedSesi}

${chapterData ? `Tajuk bab sebenar: ${chapterData.title}` : 'TIADA DATA BAB DIJUMPAI'}

Jana ${totalQuestions} soalan objektif.
Agihan wajib:
- Mudah: ${distribution.mudah}
- Sederhana: ${distribution.sederhana}
- KBAT: ${distribution.kbat}
`;

  return { systemText, userText };
}

function buildExamMcqPrompts({
  totalQuestions,
  distribution,
  scopeLabel,
  examContext,
}) {
  const systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang membina set soalan gaya percubaan SPM.
Tugas anda ialah menjana soalan objektif gaya trial sebenar berdasarkan pola peperiksaan yang diberi.

JANGAN keluar daripada skop Sejarah SPM Tingkatan 4 dan Tingkatan 5.
JANGAN jadikan semua soalan definisi semata-mata.
JANGAN ulang stem yang sama terlalu banyak.
JANGAN tulis penjelasan terlalu panjang.

${examContext}

Balas dalam JSON SAHAJA dengan format:
{
  "questions": [
    {
      "q": "Soalan",
      "opts": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "ans": 0,
      "exp": "Penjelasan ringkas",
      "level": "mudah",
      "form": 4,
      "chapter": 1
    }
  ]
}

Peraturan:
- Bahasa Melayu
- gaya trial SPM Sejarah
- pulangkan TEPAT ${totalQuestions} soalan
- pilihan jawapan mesti 4
- ans ialah 0 hingga 3
- level mesti mudah / sederhana / kbat
- jika boleh, nyatakan form dan chapter
- soalan mesti pelbagai dan tidak berulang
- exp maksimum 25 patah perkataan
`;

  const userText = `
Mod dipilih:
Percubaan SPM Sejarah Kertas 1

Skop:
${scopeLabel || 'Gabungan Tingkatan 4 dan Tingkatan 5'}

Bilangan soalan:
${totalQuestions}

Agihan aras:
- Mudah: ${distribution.mudah}
- Sederhana: ${distribution.sederhana}
- KBAT: ${distribution.kbat}
`;

  return { systemText, userText };
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
      questionCount,
      quizMode,
      selectedSkop,
      selectedSesi,
      examBatchLabel,
    } = body;

    const totalQuestions = Number(questionCount) || 10;
    const distribution = getQuestionDistribution(totalQuestions);

    const isChapterMode = quizMode === 'chapter';
    const isExamMode = quizMode === 'exam';

    const chapterData = isChapterMode ? loadChapterData(selectedSkop, selectedSesi) : null;
    const examPattern = isExamMode ? loadExamPattern(mode) : null;
    const examBatchPlan = isExamMode && mode === 'mcq'
      ? getExamBatchPlan(examBatchLabel)
      : null;

    const variationPlan = buildVariationPlan(chapterData, examPattern, mode, totalQuestions);
    const chapterContext = buildChapterContext(chapterData, variationPlan);
    const examContext = buildExamContext(examPattern, variationPlan, mode, examBatchPlan);

    if (mode === 'mcq') {
      const model = isExamMode ? 'gpt-5.4-mini' : 'gpt-5.4-nano';

      const { systemText, userText } = isExamMode
        ? buildExamMcqPrompts({
            totalQuestions,
            distribution,
            scopeLabel,
            examContext,
          })
        : buildChapterMcqPrompts({
            totalQuestions,
            distribution,
            chapterData,
            chapterContext,
            scopeLabel,
            selectedSkop,
            selectedSesi,
          });

      const parsed = await requestModelJsonWithRetry({
        model,
        systemText,
        userText,
        maxOutputTokens: 1400,
        retries: 3,
      });

      const finalQuestions = normalizeMcqQuestions(
        dedupeMcqQuestions(
          sanitizeMcqQuestions(parsed.questions || [], totalQuestions)
        )
      );

      if (!finalQuestions.length) {
        return jsonResponse(500, {
          error: 'AI tidak berjaya menjana soalan yang sah. Cuba jana semula.',
        });
      }

      return jsonResponse(200, {
        questions: finalQuestions,
      });
    }

    if (mode === 'structured') {
      const model = 'gpt-5.4-mini';
      let systemText = '';
      let userText = '';

      if (isExamMode) {
        systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang membina set soalan gaya percubaan SPM Kertas 2.

Tugas anda:
- jana SATU set sahaja
- ringkas dan tepat
- jangan terlalu panjang
- context maksimum 60 patah perkataan
- hasilkan hanya 3 subsoalan: a, b, c
- jawapan model padat

${examContext}

Balas dalam JSON SAHAJA dengan format:
{
  "context": "Petikan atau rangsangan ringkas",
  "questions": [
    { "id": "a", "q": "Soalan", "marks": 2, "model": "Jawapan contoh ringkas" },
    { "id": "b", "q": "Soalan", "marks": 4, "model": "Jawapan contoh ringkas" },
    { "id": "c", "q": "Soalan", "marks": 4, "model": "Jawapan contoh ringkas" }
  ]
}
`;
        userText = `
Mod dipilih:
Percubaan SPM Sejarah Kertas 2

Jana satu set ringkas:
- 1 konteks pendek
- 3 subsoalan sahaja
- sesuai untuk calon SPM
`;
      } else {
        systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang sangat ketat terhadap skop bab.
Jana SATU set soalan struktur berdasarkan bab sahaja.

${chapterContext}

Balas dalam JSON SAHAJA dengan format:
{
  "context": "Petikan atau rangsangan ringkas",
  "questions": [
    { "id": "a", "q": "Soalan", "marks": 2, "model": "Jawapan contoh" },
    { "id": "b", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" },
    { "id": "c", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" }
  ]
}
`;
        userText = `
Skop dipilih pengguna:
${scopeLabel}

Jana satu set soalan struktur.
`;
      }

      const parsed = await requestModelJsonWithRetry({
        model,
        systemText,
        userText,
        maxOutputTokens: 900,
        retries: 3,
      });

      const cleaned = sanitizeStructuredSet(parsed);

      if (!cleaned.questions.length) {
        return jsonResponse(500, {
          error: 'AI tidak berjaya menjana set struktur yang sah. Cuba jana semula.',
        });
      }

      return jsonResponse(200, cleaned);
    }

    if (mode === 'mark-structured') {
      const parsed = await requestModelJsonWithRetry({
        model: 'gpt-5.4-mini',
        systemText: `
Anda ialah pemeriksa Sejarah KSSM Malaysia.
Semak jawapan murid dengan adil.

Balas dalam JSON SAHAJA dengan format:
{
  "results": [
    { "id": "a", "marks_awarded": 1, "feedback": "Maklum balas ringkas" }
  ],
  "total": 0
}
`,
        userText: `
Konteks:
${context || ''}

Soalan:
${JSON.stringify(questions || [])}

Jawapan murid:
${JSON.stringify(studentAnswers || {})}
`,
        maxOutputTokens: 1000,
        retries: 3,
      });

      const cleaned = sanitizeMarkedStructured(parsed);

      return jsonResponse(200, cleaned);
    }

    return jsonResponse(400, { error: 'Mode tidak sah.' });
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
      String(apiMessage).toLowerCase().includes('timeout') ||
      String(apiMessage).toLowerCase().includes('inactivity timeout')
    ) {
      userMessage = 'Permintaan mengambil masa terlalu lama. Cuba jana semula set itu.';
    } else if (
      String(apiMessage).toLowerCase().includes('mismatched source ip') ||
      String(apiMessage).toLowerCase().includes('mismatched client ip') ||
      String(errorCode).toLowerCase().includes('mismatched_client_ip')
    ) {
      userMessage = 'Ralat sambungan rangkaian dikesan. Cuba matikan VPN atau Private Relay dan mulakan semula server tempatan.';
    } else if (
      String(apiMessage).toLowerCase().includes('unexpected token') ||
      String(apiMessage).toLowerCase().includes('unterminated string') ||
      String(apiMessage).toLowerCase().includes('json')
    ) {
      userMessage = 'Respons AI tidak lengkap atau rosak. Cuba jana semula.';
    } else if (apiMessage) {
      userMessage = apiMessage;
    }

    return jsonResponse(500, {
      error: userMessage,
      debug: {
        message: apiMessage || null,
        code: errorCode,
        type: errorType || null,
        status: errorStatus || null,
      },
    });
  }
};