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
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body),
  };
}

function getQuestionDistribution(questionCount) {
  const count = Number(questionCount) || 10;

  if (count === 5) return { mudah: 1, sederhana: 2, kbat: 2 };
  if (count === 10) return { mudah: 2, sederhana: 5, kbat: 3 };
  if (count === 20) return { mudah: 5, sederhana: 10, kbat: 5 };
  if (count === 40) return { mudah: 8, sederhana: 20, kbat: 12 };

  return { mudah: 2, sederhana: 5, kbat: 3 };
}

function listToBulletText(items) {
  if (!Array.isArray(items) || items.length === 0) return '- Tiada';
  return items.map(item => `- ${item}`).join('\n');
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
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
    if (!fs.existsSync(filePath)) {
      console.log('JSON file not found:', filePath);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error reading JSON file:', filePath, error);
    return null;
  }
}

function loadChapterData(selectedSkop, selectedSesi) {
  try {
    if (!selectedSkop || !selectedSesi) return null;

    const filePath = path.join(
      process.cwd(),
      'data',
      'textbooks',
      `form${selectedSkop}`,
      `chapter${selectedSesi}.json`
    );

    console.log('Trying chapter file:', filePath);
    return readJsonFile(filePath);
  } catch (error) {
    console.error('Error loading chapter data:', error);
    return null;
  }
}

function loadExamPattern(mode) {
  try {
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

    console.log('Trying exam pattern file:', filePath);
    return readJsonFile(filePath);
  } catch (error) {
    console.error('Error loading exam pattern:', error);
    return null;
  }
}

function buildVariationPlan(chapterData, examPattern, mode, totalQuestions) {
  if (chapterData) {
    const focusLimit = mode === 'mcq'
      ? Math.min(5, Math.max(3, Math.ceil(totalQuestions / 3)))
      : 4;

    const angleLimit = mode === 'mcq'
      ? Math.min(6, Math.max(4, Math.ceil(totalQuestions / 2)))
      : 4;

    const kbatLimit = mode === 'mcq' ? 3 : 2;

    return {
      sourceType: 'chapter',
      focusMix: pickItems(chapterData.focus_areas || [], focusLimit),
      questionAngles: pickItems(chapterData.possible_question_angles || [], angleLimit),
      kbatMix: pickItems(chapterData.kbat_angles || [], kbatLimit)
    };
  }

  if (examPattern) {
    if (mode === 'mcq') {
      return {
        sourceType: 'exam',
        questionStyles: pickItems(examPattern.question_styles || [], 6),
        stemPatterns: pickItems(examPattern.common_stem_patterns || [], 5),
        distractorPatterns: pickItems(examPattern.distractor_patterns || [], 4),
        kbatPatterns: pickItems(
          examPattern.difficulty_profile?.kbat || examPattern.kbat_patterns || [],
          4
        ),
        topicMix: pickItems(
          [
            ...(examPattern.topic_patterns?.form4 || []),
            ...(examPattern.topic_patterns?.form5 || [])
          ],
          Math.min(8, Math.max(4, Math.ceil(totalQuestions / 3)))
        )
      };
    }

    if (mode === 'structured') {
      return {
        sourceType: 'exam',
        stimulusMix: pickItems(examPattern.stimulus_types || [], 3),
        commandMix: pickItems(examPattern.common_command_words || [], 5),
        sectionAPatterns: examPattern.section_a_patterns || [],
        sectionBPatterns: examPattern.section_b_patterns || [],
        kbatPromptMix: pickItems(examPattern.kbat_prompt_patterns || [], 3),
        topicMix: pickItems(examPattern.topic_coverage_examples || [], 4)
      };
    }
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

function buildExamContext(examPattern, variationPlan, mode) {
  if (!examPattern) return '';

  if (mode === 'mcq') {
    return `
=== POLA MOD PERCUBAAN KERTAS 1 ===
Sumber: ${examPattern.source || 'Tidak dinyatakan'}
Struktur:
- 40 soalan penuh
- 20 soalan Tingkatan 4
- 20 soalan Tingkatan 5
- 4 pilihan jawapan

Gaya soalan:
${listToBulletText(examPattern.question_styles)}

Stem biasa:
${listToBulletText(examPattern.common_stem_patterns)}

Corak distractor:
${listToBulletText(examPattern.distractor_patterns)}

Topik campuran:
${listToBulletText([
  ...(examPattern.topic_patterns?.form4 || []),
  ...(examPattern.topic_patterns?.form5 || [])
])}

Pelan variasi set ini:
- Gaya: ${variationPlan?.questionStyles?.join(', ') || '-'}
- Stem: ${variationPlan?.stemPatterns?.join(', ') || '-'}
- KBAT: ${variationPlan?.kbatPatterns?.join(', ') || '-'}
- Topik: ${variationPlan?.topicMix?.join(', ') || '-'}
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

Pelan variasi set ini:
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
    if (!q || !Array.isArray(q.opts) || typeof q.ans !== 'number') {
      return q;
    }

    const originalOptions = [...q.opts];
    const correctAnswerText = originalOptions[q.ans];
    const shuffledOptions = shuffleArray(originalOptions);
    const newAnswerIndex = shuffledOptions.findIndex(
      (opt) => opt === correctAnswerText
    );

    return {
      ...q,
      opts: shuffledOptions,
      ans: newAnswerIndex >= 0 ? newAnswerIndex : q.ans
    };
  });
}

function sanitizeMcqQuestions(questions, totalQuestions) {
  if (!Array.isArray(questions)) return [];

  const cleaned = questions
    .filter(q =>
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
    .map(q => ({
      q: String(q.q).trim(),
      opts: q.opts.map(opt => String(opt).trim()),
      ans: Number(q.ans),
      exp: String(q.exp).trim(),
      level: ['mudah', 'sederhana', 'kbat'].includes(String(q.level).toLowerCase())
        ? String(q.level).toLowerCase()
        : 'sederhana',
      form: q.form ? Number(q.form) : undefined,
      chapter: q.chapter ? Number(q.chapter) : undefined
    }));

  return cleaned.slice(0, totalQuestions);
}

function dedupeMcqQuestions(questions) {
  const seen = new Set();
  return questions.filter(q => {
    const key = String(q.q || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function requestModelJson({ model, systemText, userText, maxOutputTokens = 3200 }) {
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
    },
    max_output_tokens: maxOutputTokens
  });

  const outputText =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text ||
    '';

  if (!outputText) {
    throw new Error('AI tidak memulangkan data.');
  }

  return JSON.parse(outputText);
}

async function generateExactMcqSet({
  totalQuestions,
  model,
  baseSystemText,
  baseUserText
}) {
  let allQuestions = [];
  let attempts = 0;

  while (allQuestions.length < totalQuestions && attempts < 3) {
    attempts += 1;
    const remaining = totalQuestions - allQuestions.length;

    const systemText = `${baseSystemText}

Anda WAJIB pulangkan TEPAT ${remaining} soalan untuk pusingan ini.
Jangan pulangkan kurang daripada ${remaining}.
Jangan ulang soalan yang sudah dihasilkan sebelum ini.`;

    const alreadyUsed = allQuestions.map(q => `- ${q.q}`).join('\n') || '- Tiada';

    const userText = `${baseUserText}

Bilangan soalan yang masih diperlukan: ${remaining}

Soalan yang telah digunakan dan DILARANG diulang:
${alreadyUsed}`;

    const parsed = await requestModelJson({
      model,
      systemText,
      userText,
      maxOutputTokens: remaining >= 20 ? 5200 : 2600
    });

    const cleaned = sanitizeMcqQuestions(parsed.questions || [], remaining);
    allQuestions = dedupeMcqQuestions([...allQuestions, ...cleaned]);
  }

  return allQuestions.slice(0, totalQuestions);
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
      selectedSesi
    } = body;

    let systemText = '';
    let userText = '';
    let model = 'gpt-5.4-mini';

    const totalQuestions = Number(questionCount) || 10;
    const distribution = getQuestionDistribution(totalQuestions);

    const isChapterMode = quizMode === 'chapter';
    const isExamMode = quizMode === 'exam';

    const chapterData = isChapterMode
      ? loadChapterData(selectedSkop, selectedSesi)
      : null;

    const examPattern = isExamMode
      ? loadExamPattern(mode)
      : null;

    const variationPlan = buildVariationPlan(chapterData, examPattern, mode, totalQuestions);
    const chapterContext = buildChapterContext(chapterData, variationPlan);
    const examContext = buildExamContext(examPattern, variationPlan, mode);

    if (mode === 'mcq') {
      model = isExamMode ? 'gpt-5.4-mini' : 'gpt-5.4-nano';

      if (isExamMode) {
        systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang membina set soalan gaya percubaan SPM.
Tugas anda ialah menjana soalan objektif gaya trial sebenar berdasarkan pola peperiksaan yang diberi.

JANGAN keluar daripada skop Sejarah SPM Tingkatan 4 dan Tingkatan 5.
JANGAN jadikan semua soalan definisi semata-mata.
JANGAN ulang stem yang sama terlalu banyak.
JANGAN pulangkan kurang daripada bilangan yang diminta.

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
- campurkan Tingkatan 4 dan 5
- pilihan jawapan mesti 4
- ans ialah 0 hingga 3
- level mesti mudah / sederhana / kbat
- jika boleh, nyatakan form dan chapter
- soalan mesti pelbagai dan tidak berulang
`;
        userText = `
Mod dipilih:
Percubaan SPM Sejarah Kertas 1

Skop:
${scopeLabel || 'Gabungan Tingkatan 4 dan Tingkatan 5'}

Set penuh:
- 40 soalan
- Tingkatan 4 dan 5
- gaya trial sebenar

Agihan aras:
- Mudah: ${distribution.mudah}
- Sederhana: ${distribution.sederhana}
- KBAT: ${distribution.kbat}
`;
      } else {
        systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang sangat ketat terhadap skop bab.
Tugas anda ialah menjana soalan HANYA daripada kandungan bab yang diberi.
JANGAN campurkan fakta daripada bab lain.

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
`;
        userText = `
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
      }

      const finalQuestions = await generateExactMcqSet({
        totalQuestions,
        model,
        baseSystemText: systemText,
        baseUserText: userText
      });

      const normalized = normalizeMcqQuestions(finalQuestions);

      return jsonResponse(200, {
        questions: normalized,
        debug_source: chapterData
          ? {
              type: 'chapter',
              form: chapterData.form,
              chapter: chapterData.chapter,
              title: chapterData.title
            }
          : examPattern
            ? {
                type: 'exam',
                paper: examPattern.paper,
                source: examPattern.source,
                exam_type: examPattern.exam_type
              }
            : null,
        debug_variation_plan: variationPlan || null
      });
    }

    if (mode === 'structured') {
      model = 'gpt-5.4-mini';

      if (isExamMode) {
        systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang membina set soalan gaya percubaan SPM Kertas 2.

Tugas anda:
- jana SATU set sahaja
- ringkas dan tepat
- jangan terlalu panjang
- jangan beri penerangan tambahan di luar JSON
- elakkan konteks terlalu panjang
- hasilkan hanya 3 subsoalan: a, b, c

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

Peraturan:
- Bahasa Melayu
- gaya trial SPM
- context maksimum 90 patah perkataan
- jawapan model padat
- bahagian a asas
- bahagian b huraian
- bahagian c KBAT / ulasan
`;
        userText = `
Mod dipilih:
Percubaan SPM Sejarah Kertas 2

Skop:
${scopeLabel || 'Gabungan Tingkatan 4 dan Tingkatan 5'}

Jana satu set ringkas dan berkualiti:
- 1 konteks
- 3 bahagian: a, b, c
- format sesuai untuk calon SPM
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

Peraturan:
- Bahasa Melayu
- hanya skop bab
- context ringkas
- jawapan model padat
`;
        userText = `
Skop dipilih pengguna:
${scopeLabel}

Tingkatan dipilih:
${selectedSkop}

Bab dipilih:
${selectedSesi}

${chapterData ? `Tajuk bab sebenar: ${chapterData.title}` : 'TIADA DATA BAB DIJUMPAI'}

Jana satu set soalan struktur.
`;
      }

      const parsed = await requestModelJson({
        model,
        systemText,
        userText,
        maxOutputTokens: 1200
      });

      return jsonResponse(200, {
        ...parsed,
        debug_source: chapterData
          ? {
              type: 'chapter',
              form: chapterData.form,
              chapter: chapterData.chapter,
              title: chapterData.title
            }
          : examPattern
            ? {
                type: 'exam',
                paper: examPattern.paper,
                source: examPattern.source,
                exam_type: examPattern.exam_type
              }
            : null,
        debug_variation_plan: variationPlan || null
      });
    }

    if (mode === 'mark-structured') {
      model = 'gpt-5.4-mini';

      const parsed = await requestModelJson({
        model,
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
        maxOutputTokens: 1400
      });

      return jsonResponse(200, parsed);
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
      String(apiMessage).toLowerCase().includes('mismatched source ip') ||
      String(apiMessage).toLowerCase().includes('mismatched client ip') ||
      String(errorCode).toLowerCase().includes('mismatched_client_ip')
    ) {
      userMessage = 'Ralat sambungan rangkaian dikesan (mismatched source IP). Cuba matikan VPN/Private Relay dan mulakan semula netlify dev.';
    } else if (
      String(apiMessage).toLowerCase().includes('timeout') ||
      String(apiMessage).toLowerCase().includes('inactivity timeout')
    ) {
      userMessage = 'Permintaan mengambil masa terlalu lama. Cuba jana semula set itu.';
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