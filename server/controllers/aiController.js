import beautify from 'js-beautify';
import { getLogger } from '../logger/index.js';

const logger = getLogger('aiController.js');

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CODE_LENGTH = 12000;
const MAX_PROMPT_CODE_LENGTH = 14000;
const VALID_STATUS = ['continue', 'game_over'];
const REQUIRED_MODULES = ['main.js', 'triageModule.js', 'pharmacyModule.js', 'databaseMock.js'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    consequences: { type: 'string' },
    status: { type: 'string', enum: VALID_STATUS },
    newBugContext: { type: 'string' },
    files: {
      type: 'object',
      properties: {
        'main.js': { type: 'string' },
        'triageModule.js': { type: 'string' },
        'pharmacyModule.js': { type: 'string' },
        'databaseMock.js': { type: 'string' },
      },
      required: REQUIRED_MODULES,
    },
    entryPoint: { type: 'string' },
    validationLogic: { type: 'string' },
  },
  required: ['consequences', 'status', 'newBugContext', 'files', 'entryPoint', 'validationLogic'],
  propertyOrdering: [
    'consequences',
    'status',
    'newBugContext',
    'files',
    'entryPoint',
    'validationLogic',
  ],
};

const SYSTEM_INSTRUCTION = [
  'Eres el Director del Hospital Central y el Sistema Operativo de la Unidad 07 al mismo tiempo.',
  'Hablas en español, con tono burocrático, clínico y amenazante. Evalúas el sistema de software que el operador subió ayer y narras las consecuencias reales sobre pacientes, personal y sistemas.',
  'También diseñas el próximo fallo de un sistema de software compuesto por varios módulos interdependientes.',
  '',
  'REGLAS ESTRICTAS:',
  '1. Responde SIEMPRE con un único objeto JSON válido, sin texto adicional ni bloques de código markdown.',
  '2. "consequences": 1 a 3 frases narrando el impacto del sistema anterior. Si no hay sistema previo, presenta el turno.',
  '3. "status": exactamente "continue" o "game_over". Solo puedes usar "game_over" a partir del día 3.',
  '4. "newBugContext": un reporte de usuario ambiguo y SIN diagnóstico técnico (ej. "Los pacientes críticos están recibiendo paracetamol en lugar de morfina"). No reveles en qué archivo ni en qué línea está el fallo.',
  '5. "files": un objeto con módulos CommonJS. Debe incluir obligatoriamente estas claves: main.js, triageModule.js, pharmacyModule.js, databaseMock.js. Puedes añadir más si lo necesitas.',
  '6. Cada archivo debe ser JavaScript válido, usar module.exports y require("./nombreDeArchivo.js"), con saltos de línea reales e indentación de 2 espacios. Nunca devuelvas todo el código en una sola línea.',
  '7. main.js es el punto de entrada: inicializa el sistema, requiere los otros módulos y contiene console.log de diagnóstico.',
  '8. "entryPoint": la clave del archivo que arranca el sistema. Normalmente "main.js".',
  '9. El fallo debe ser SISTÉMICO, no una simple errata: un módulo exporta o entrega un tipo/estructura distinta de la que otro módulo espera, y eso hace fallar el flujo dos o tres pasos más adelante. Ejemplos: un módulo devuelve un String donde otro espera un Array; un módulo entrega un objeto plano donde otro espera una instancia; una clave inexistente que se propaga.',
  '10. NO comentes ni marques el error. El código debe parecer correcto a simple vista; el operador debe seguir el flujo de datos entre archivos para encontrarlo.',
  '11. "validationLogic": código JavaScript oculto para calificar. Puede usar require("./archivo.js") para cargar los módulos y console.log si lo desea. SIEMPRE debe terminar con return { passed: true|false, details: "..." }. Debe devolver passed:false con el sistema tal cual (sin corregir) y passed:true solo cuando el fallo se corrige. No dupliques los módulos aquí.',
  '12. La complejidad del fallo debe crecer lentamente con el día.',
  '13. Genera los archivos necesarios. El usuario no tiene la posibilidad de crear archivos nuevos',
  '14. Empieza con problemas muy sencillos en los primeros días. A medida que el usuario avance en los días, aumento de a muy poco la complejidad de los problemas'
].join('\n');

function prettyPrint(code) {
  try {
    return beautify
      .js(code, {
        indent_size: 2,
        preserve_newlines: true,
        max_preserve_newlines: 2,
        brace_style: 'collapse',
        end_with_newline: false,
      })
      .trim();
  } catch {
    return code;
  }
}

function clampText(value, max) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeDay(day) {
  const parsed = Number.parseInt(day, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, 999);
}

function parseTestResults(value) {
  if (value === true || value === false) {
    return value;
  }
  return null;
}

function normalizeFiles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const files = {};
  for (const [name, source] of Object.entries(value)) {
    if (typeof name === 'string' && typeof source === 'string') {
      files[name] = clampText(source, MAX_CODE_LENGTH);
    }
  }
  return files;
}

function summarizeFiles(files) {
  const entries = Object.entries(files);
  let total = 0;
  const parts = [];

  for (const [name, source] of entries) {
    if (total >= MAX_PROMPT_CODE_LENGTH) {
      parts.push(`--- ${name} --- (omitido por longitud)`);
      continue;
    }
    const sliced = source.slice(0, MAX_PROMPT_CODE_LENGTH - total);
    total += sliced.length;
    parts.push(`--- ${name} ---\n${sliced}`);
  }

  return parts.join('\n\n');
}

export function buildSystemInstruction() {
  return SYSTEM_INSTRUCTION;
}

export function buildUserPrompt({ day, previousFiles, testResults }) {
  const files = normalizeFiles(previousFiles);
  const hasSystem = Object.keys(files).length > 0;
  const tests = testResults === true ? 'SUPERADAS' : testResults === false ? 'FALLIDAS' : 'SIN PRUEBAS';

  return [
    `DÍA SOLICITADO: ${day}`,
    `PRUEBAS DEL SISTEMA ANTERIOR: ${tests}`,
    'SISTEMA QUE EL OPERADOR SUBIÓ AYER:',
    hasSystem ? summarizeFiles(files) : '(ninguno, es el primer turno)',
    '',
    'Evalúa el turno anterior y entrega el siguiente objeto JSON con las seis claves requeridas.',
  ].join('\n');
}

export function validatePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('La IA no devolvió un objeto');
  }

  const consequences = clampText(value.consequences, 1200).trim();
  const newBugContext = clampText(value.newBugContext, 1200).trim();
  const validationLogic = clampText(value.validationLogic, MAX_CODE_LENGTH).trim();
  const status = VALID_STATUS.includes(value.status) ? value.status : 'continue';
  const files = normalizeFiles(value.files);

  const fileNames = Object.keys(files);
  if (fileNames.length < 2) {
    throw new Error('La IA no devolvió un sistema con módulos suficientes');
  }

  let entryPoint = typeof value.entryPoint === 'string' ? value.entryPoint.trim() : '';
  if (!entryPoint || !files[entryPoint]) {
    entryPoint = files['main.js'] ? 'main.js' : fileNames[0];
  }

  if (!consequences || !newBugContext || !validationLogic) {
    throw new Error('La respuesta de la IA está incompleta');
  }

  const formattedFiles = {};
  for (const [name, source] of Object.entries(files)) {
    formattedFiles[name] = prettyPrint(source);
  }

  return {
    consequences,
    status,
    newBugContext,
    files: formattedFiles,
    entryPoint,
    validationLogic: prettyPrint(validationLogic),
  };
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const generationConfig = {
    temperature: 0.95,
    topP: 0.95,
    maxOutputTokens: 8192,
    responseMimeType: 'application/json',
    responseSchema: RESPONSE_SCHEMA,
  };

  if (DEFAULT_MODEL.includes('2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  try {
    const response = await fetch(
      `${GEMINI_ENDPOINT}/${DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Gemini respondió ${response.status}: ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const finishReason = candidate?.finishReason ?? 'UNKNOWN';
    const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

    if (!text.trim()) {
      throw new Error(`Gemini devolvió una respuesta vacía (finishReason=${finishReason})`);
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        logger.error('gemini.parse.failed', {
          finishReason,
          textChars: text.length,
          textHead: text.slice(0, 300),
        });
        throw new Error(`Gemini no devolvió JSON parseable (finishReason=${finishReason})`);
      }
      parsed = JSON.parse(match[0]);
    }

    logger.info('gemini.request.success', {
      finishReason,
      textChars: text.length,
      promptTokens: data?.usageMetadata?.promptTokenCount,
      outputTokens: data?.usageMetadata?.candidatesTokenCount,
    });

    return validatePayload(parsed);
  } finally {
    clearTimeout(timer);
  }
}

const FALLBACK_SYSTEMS = [
  {
    context:
      'Los pacientes críticos están recibiendo paracetamol en lugar de morfina en la sala 3. Recepción reporta confusión en las órdenes.',
    files: {
      'main.js': [
        "const triage = require('./triageModule.js');",
        "const pharmacy = require('./pharmacyModule.js');",
        '',
        "console.log('Diagnóstico iniciado');",
        'const criticalPatients = triage.classifyPatients();',
        "console.log('Pacientes clasificados:', criticalPatients);",
        'const orders = pharmacy.dispenseAll(criticalPatients);',
        "console.log('Órdenes generadas:', orders);",
      ].join('\n'),
      'triageModule.js': [
        "const database = require('./databaseMock.js');",
        '',
        'function classifyPatients() {',
        '  const patients = database.getAll();',
        '  return patients',
        '    .sort((a, b) => b.severity - a.severity)',
        '    .map((patient) => patient.name)',
        "    .join(', ');",
        '}',
        '',
        'module.exports = { classifyPatients };',
      ].join('\n'),
      'pharmacyModule.js': [
        'function dispenseAll(patients) {',
        '  return patients.map((patient) => `${patient.name}: ${patient.medication}`);',
        '}',
        '',
        'module.exports = { dispenseAll };',
      ].join('\n'),
      'databaseMock.js': [
        'const patients = [',
        "  { id: 1, name: 'Ana', severity: 9, medication: 'morfina' },",
        "  { id: 2, name: 'Luis', severity: 3, medication: 'paracetamol' },",
        "  { id: 3, name: 'Marta', severity: 7, medication: 'morfina' },",
        '];',
        '',
        'module.exports = {',
        '  getAll() {',
        '    return patients;',
        '  },',
        '};',
      ].join('\n'),
    },
    validationLogic: [
      "const triage = require('./triageModule.js');",
      "const pharmacy = require('./pharmacyModule.js');",
      'const classified = triage.classifyPatients();',
      'if (!Array.isArray(classified)) {',
      "  return { passed: false, details: 'triageModule debe entregar un arreglo de pacientes, no una cadena.' };",
      '}',
      'if (!classified[0] || classified[0].severity !== 9) {',
      "  return { passed: false, details: 'El paciente crítico (severidad 9) debe quedar primero.' };",
      '}',
      'const orders = pharmacy.dispenseAll(classified);',
      "if (!orders.includes('Ana: morfina')) {",
      "  return { passed: false, details: 'La orden de morfina para Ana no se generó.' };",
      '}',
      "return { passed: true, details: 'Flujo triage → farmacia restaurado.' };",
    ].join('\n'),
  },
  {
    context:
      'El inventario central aparece como vacío y el personal de enfermería no puede retirar insumos. Farmacia insiste en que los datos existen.',
    files: {
      'main.js': [
        "const pharmacy = require('./pharmacyModule.js');",
        "const database = require('./databaseMock.js');",
        '',
        "console.log('Verificando inventario...');",
        'const inventory = database.getInventory();',
        'const available = pharmacy.countAvailable(inventory);',
        "console.log('Insumos disponibles:', available);",
      ].join('\n'),
      'pharmacyModule.js': [
        'function countAvailable(items) {',
        '  return items.filter((item) => item.stock > 0).length;',
        '}',
        '',
        'module.exports = { countAvailable };',
      ].join('\n'),
      'databaseMock.js': [
        'const inventory = {',
        "  analgesicos: { stock: 12 },",
        "  sedantes: { stock: 4 },",
        "  antibioticos: { stock: 0 },",
        '};',
        '',
        'module.exports = {',
        '  getInventory() {',
        '    return inventory;',
        '  },',
        '};',
      ].join('\n'),
      'triageModule.js': [
        'function isCritical(patient) {',
        '  return patient.severity >= 8;',
        '}',
        '',
        'module.exports = { isCritical };',
      ].join('\n'),
    },
    validationLogic: [
      "const pharmacy = require('./pharmacyModule.js');",
      "const database = require('./databaseMock.js');",
      'const inventory = database.getInventory();',
      'if (!Array.isArray(inventory)) {',
      "  return { passed: false, details: 'databaseMock debe entregar un arreglo de insumos.' };",
      '}',
      'const available = pharmacy.countAvailable(inventory);',
      'if (available !== 2) {',
      "  return { passed: false, details: 'Se esperaban 2 insumos disponibles y se obtuvieron ' + available };",
      '}',
      "return { passed: true, details: 'Inventario legible por farmacia.' };",
    ].join('\n'),
  },
];

export function buildFallback({ day, testResults }) {
  const template = FALLBACK_SYSTEMS[Math.max(0, day - 1) % FALLBACK_SYSTEMS.length];
  const failed = testResults === false;
  const succeeded = testResults === true;

  let status = 'continue';
  if (failed && day >= 3 && day % 3 === 0) {
    status = 'game_over';
  }

  let consequences;
  if (day === 0) {
    consequences =
      'El turno nocturno no se presentó. El hospital funciona a medio gas y el Director te cede la Unidad 07. No hay margen para errores.';
  } else if (succeeded) {
    consequences = `El sistema del día ${day} pasó las pruebas. La sala respira tranquila, pero los reportes siguen llegando.`;
  } else {
    consequences = `El sistema del día ${day} falló en producción. El personal tuvo que intervenir a mano y el Director exige explicaciones.`;
  }

  return {
    consequences,
    status,
    newBugContext: template.context,
    files: template.files,
    entryPoint: 'main.js',
    validationLogic: template.validationLogic,
  };
}

export async function generateNextDay(req, res) {
  const body = req.body ?? {};
  const day = normalizeDay(body.day);
  const testResults = parseTestResults(body.testResults);
  const previousFiles =
    body.previousFiles && typeof body.previousFiles === 'object'
      ? normalizeFiles(body.previousFiles)
      : body.previousCode
        ? { 'main.js': clampText(body.previousCode, MAX_CODE_LENGTH) }
        : {};

  const apiKey = process.env.GEMINI_API_KEY;
  const prompt = buildUserPrompt({ day, previousFiles, testResults });
  let payload;
  let provider;

  logger.info('game.nextday.request', {
    day,
    testResults,
    previousFiles: Object.keys(previousFiles).length,
    promptChars: prompt.length,
    model: DEFAULT_MODEL,
    hasApiKey: Boolean(apiKey),
  });

  const startedAt = process.hrtime.bigint();

  try {
    if (!apiKey) {
      payload = buildFallback({ day, testResults });
      provider = 'mock';
      logger.warn('gemini.skipped', { day, reason: 'missing_api_key' });
    } else {
      payload = await callGemini(prompt);
      provider = 'gemini';
    }
  } catch (error) {
    logger.error('gemini.request.failed', { day, model: DEFAULT_MODEL, error: error.message });
    payload = buildFallback({ day, testResults });
    provider = 'fallback';
  }

  const latencyMs = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);

  logger.info('game.nextday.response', {
    day,
    provider,
    status: payload.status,
    latencyMs,
    modules: Object.keys(payload.files).length,
    entryPoint: payload.entryPoint,
    codeChars: Object.values(payload.files).reduce((total, code) => total + code.length, 0),
    validationChars: payload.validationLogic.length,
  });

  res.json({
    ok: true,
    provider,
    model: provider === 'gemini' ? DEFAULT_MODEL : 'local-fallback',
    day,
    ...payload,
  });
}
