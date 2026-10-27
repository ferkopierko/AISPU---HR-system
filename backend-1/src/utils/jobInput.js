// Validácia pozície (POST/PUT /api/admin/jobs) vrátane formátu jobs.requirements.

const HttpError = require('./httpError');

const JOB_STATUSES = ['draft', 'open', 'closed'];
const MAX_SKILLS = 50;

/** Povinný / voliteľný text s max. dĺžkou; prázdny voliteľný = null. */
function parseText(value, name, { max, required = false }) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (required) throw new HttpError(400, `Pole ${name} je povinné`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, `Pole ${name} musí byť text`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `Pole ${name} môže mať najviac ${max} znakov`);
  return text;
}

/**
 * requirements -> hodnota pre stĺpec jobs.requirements (NVARCHAR(MAX)) alebo null.
 *
 * Povolené formáty (rovnaké číta frontend aj Backend 2):
 *   - voľný text                          "Java, SQL, 2 roky praxe"
 *   - pole zručností                      ["Java", "SQL"]
 *   - pole zručností s váhou (súčet 100)  [{"skill": "Java", "weight": 60}, {"skill": "SQL", "weight": 40}]
 * Pole môže prísť ako JSON pole aj ako reťazec s JSON poľom; uloží sa ako JSON.
 */
function parseRequirements(value) {
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      value = JSON.parse(value);
    } catch {
      throw new HttpError(400, 'requirements: neplatné JSON pole');
    }
  }
  if (!Array.isArray(value)) {
    return parseText(value, 'requirements', { max: 4000 });
  }
  if (value.length === 0) return null;
  if (value.length > MAX_SKILLS) throw new HttpError(400, `requirements: najviac ${MAX_SKILLS} zručností`);

  const weighted = typeof value[0] === 'object' && value[0] !== null;
  const items = value.map((item, i) => {
    const where = `requirements[${i}]`;
    if (weighted !== (typeof item === 'object' && item !== null)) {
      throw new HttpError(400, 'requirements: buď všetky zručnosti s váhou, alebo žiadna');
    }
    const skill = parseText(weighted ? item.skill : item, `${where}.skill`, { max: 100, required: true });
    if (!weighted) return skill;
    const { weight } = item;
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
      throw new HttpError(400, `${where}.weight musí byť celé číslo 1–100`);
    }
    return { skill, weight };
  });

  const names = items.map((it) => (weighted ? it.skill : it).toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new HttpError(400, 'requirements: zručnosti sa nesmú opakovať');
  }
  if (weighted) {
    const total = items.reduce((sum, it) => sum + it.weight, 0);
    if (total !== 100) throw new HttpError(400, `requirements: súčet váh musí byť 100 (je ${total})`);
  }
  return JSON.stringify(items);
}

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship'];
const WORK_MODES = ['onsite', 'hybrid', 'remote'];
const SALARY_PERIODS = ['month', 'year', 'hour'];
const MAX_SALARY = 10_000_000;

/** Voliteľná hodnota z povoleného zoznamu; chýbajúca = null. */
function parseEnum(value, name, allowed) {
  if (value === undefined || value === null || value === '') return null;
  if (!allowed.includes(value)) throw new HttpError(400, `${name} musí byť jeden z: ${allowed.join(', ')}`);
  return value;
}

function parseSalary(value, name) {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_SALARY) {
    throw new HttpError(400, `${name} musí byť celé číslo 0–${MAX_SALARY}`);
  }
  return value;
}

/** Dátum 'YYYY-MM-DD' (platný kalendárny deň); chýbajúci = null. */
function parseDate(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const ok = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
  if (!ok) throw new HttpError(400, `${name} musí byť dátum v tvare RRRR-MM-DD`);
  return value;
}

/** Telo POST/PUT /api/admin/jobs -> parametre pre SQL. */
function parseJobInput(body) {
  const status = body?.status ?? 'open';
  if (!JOB_STATUSES.includes(status)) {
    throw new HttpError(400, `status musí byť jeden z: ${JOB_STATUSES.join(', ')}`);
  }

  const salaryMin = parseSalary(body?.salaryMin, 'salaryMin');
  const salaryMax = parseSalary(body?.salaryMax, 'salaryMax');
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    throw new HttpError(400, 'salaryMin nesmie byť väčší ako salaryMax');
  }
  const hasSalary = salaryMin !== null || salaryMax !== null;
  // obdobie má zmysel iba s platom; bez neho sa berie mesačne
  const salaryPeriod = hasSalary ? (parseEnum(body?.salaryPeriod, 'salaryPeriod', SALARY_PERIODS) ?? 'month') : null;

  return {
    title: parseText(body?.title, 'title', { max: 200, required: true }),
    department: parseText(body?.department, 'department', { max: 100, required: true }),
    description: parseText(body?.description, 'description', { max: 10000 }),
    requirements: parseRequirements(body?.requirements),
    status,
    location: parseText(body?.location, 'location', { max: 200 }),
    employmentType: parseEnum(body?.employmentType, 'employmentType', EMPLOYMENT_TYPES),
    workMode: parseEnum(body?.workMode, 'workMode', WORK_MODES),
    salaryMin,
    salaryMax,
    salaryPeriod,
    responsibilities: parseText(body?.responsibilities, 'responsibilities', { max: 10000 }),
    benefits: parseText(body?.benefits, 'benefits', { max: 10000 }),
    deadline: parseDate(body?.deadline, 'deadline'),
  };
}

// Stĺpce pozície v odpovediach API (snake_case v DB -> camelCase v JSON).
// deadline sa vracia ako 'YYYY-MM-DD' (DATE by mssql poslal ako polnoc v UTC).
const JOB_FIELDS = [
  ['id'], ['title'], ['department'], ['description'], ['requirements'], ['status'],
  ['location'], ['employment_type', 'employmentType'], ['work_mode', 'workMode'],
  ['salary_min', 'salaryMin'], ['salary_max', 'salaryMax'], ['salary_period', 'salaryPeriod'],
  ['responsibilities'], ['benefits'], ['published_at', 'publishedAt'],
];

/** SELECT / OUTPUT zoznam stĺpcov s prefixom (napr. 'j' alebo 'inserted'). */
function jobColumns(prefix) {
  return [
    ...JOB_FIELDS.map(([col, alias]) => `${prefix}.${col}${alias ? ` AS ${alias}` : ''}`),
    `CONVERT(char(10), ${prefix}.deadline, 23) AS deadline`,
  ].join(', ');
}

// Pozícia je verejná: otvorená a uzávierka ešte neprešla (uzávierka = posledný deň, slovenský čas).
const PUBLIC_JOB_SQL = (alias) => `${alias}.status = N'open' AND (${alias}.deadline IS NULL OR ${alias}.deadline >=
  CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central European Standard Time' AS DATE))`;

module.exports = { parseJobInput, parseRequirements, jobColumns, PUBLIC_JOB_SQL, JOB_STATUSES };
