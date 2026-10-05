/**
 * Text helpers for the Smart Quote rule engines. Pure functions — no I/O — so they are unit-tested
 * directly (tests/ai-unit.test.ts).
 */

/** Lower-case, strip punctuation (keeping intra-word apostrophes/hyphens) and collapse whitespace. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits text into clauses: negation never carries across sentence or "but" boundaries. */
function clauses(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[.!?;\n,]+|\bbut\b|\bhowever\b|\balthough\b/)
    .map(normalise)
    .filter(Boolean);
}

const NEGATORS = new Set(['no', 'not', 'never', 'without', "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't", 'nothing', 'none', "haven't", "hasn't", 'nor', 'neither']);

export interface PhraseHit {
  phrase: string;
  negated: boolean;
}

/**
 * Finds `phrases` in `text` as whole words. A hit preceded (within 3 words, same clause) by a negator
 * — "no burning smell", "there is not any smoke" — is reported as negated rather than dropped, so the
 * caller decides (safety rules ignore negated hits but keep them for the admin's audit view).
 */
export function findPhrases(text: string, phrases: string[]): PhraseHit[] {
  const hits: PhraseHit[] = [];
  const parts = clauses(text);
  for (const phrase of phrases) {
    const p = normalise(phrase);
    if (!p) continue;
    const re = new RegExp(`(^| )${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?= |$)`, 'g');
    let best: PhraseHit | null = null;
    for (const clause of parts) {
      for (const m of clause.matchAll(re)) {
        const before = clause.slice(0, m.index).trim().split(' ').filter(Boolean).slice(-3);
        const negated = before.some((w) => NEGATORS.has(w));
        if (!best || (best.negated && !negated)) best = { phrase, negated };
      }
    }
    if (best) hits.push(best);
  }
  return hits;
}

const STOPWORDS = new Set(
  ('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
    'just me my no not of on or our she so some than that the their them then there these they this to too us was we were ' +
    'what when where which who will with would you your yes also very really please thanks thank hi hello any about after ' +
    'again all am because before being both each few more most other own same should only out up down off over under once ' +
    'here why get got keep keeps going went one two now time times today yesterday house home').split(' '),
);

/** Normalised content words (≥ 3 chars, no stop-words), de-duplicated in order of first appearance. */
export function extractKeywords(text: string, limit = 40): string[] {
  const out: string[] = [];
  for (const w of normalise(text).split(' ')) {
    const word = w.replace(/^['-]+|['-]+$/g, '');
    if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    if (!out.includes(word)) out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Removes personal details before text is sent to an external AI provider (POPIA minimisation).
 * The provider never needs who or where the customer is — only what the problem is.
 */
export function redactPii(text: string, names: string[] = []): string {
  let out = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\b\d{13}\b/g, '[ID_NUMBER]')
    .replace(/(\+?27|\b0)[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{4}\b/g, '[PHONE]')
    .replace(/\+\d[\d\s()-]{8,}\d/g, '[PHONE]')
    .replace(
      /\b\d{1,5}[a-z]?\s+(?:[A-Z][A-Za-z'-]+\s+){1,3}(?:road|rd|street|st|avenue|ave|drive|dr|lane|ln|crescent|cres|close|way|boulevard|blvd|place|pl|park|court|ct)\b\.?/gi,
      '[ADDRESS]',
    )
    .replace(/\b(?:erf|stand|unit|flat)\s*(?:no\.?\s*)?\d+\b/gi, '[ADDRESS]');
  for (const n of names) {
    const name = n.trim();
    if (name.length < 3) continue;
    out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[CUSTOMER]');
  }
  return out;
}

/**
 * Patterns that indicate DIY repair / hazardous instructions. The assistant is an assessment, triage and
 * quotation tool — any sentence that tells the customer how to work on electrical or solar equipment is
 * removed before it can be shown, and the case is flagged for review.
 */
const UNSAFE_PATTERNS: RegExp[] = [
  /\bstep\s*\d/i,
  /\b(you|yourself)\s+(can|could|should|need to|must|may want to|might)\s+(try\s+(to\s+)?)?(replace|rewire|re-wire|repair|fix|remove|open|unscrew|disconnect|reconnect|bypass|bridge|strip|solder|test the|wire|install|swap|tighten|reset the inverter)\b/i,
  /\b(unscrew|rewire|re-wire|solder|strip the (wire|insulation)|bridge the|jumper the|bypass the)\b/i,
  /\b(remove|take off|open)\s+(the\s+)?(db\s+)?(cover|panel|faceplate|lid|front plate|board cover|inverter casing|casing)\b/i,
  /\bopen (up )?the (db|distribution board|board|inverter|battery|meter|isolator)\b/i,
  /\b(replace|swap out)\s+the\s+(breaker|element|thermostat|fuse|socket|wire|wiring|cable|isolator|elu|earth leakage)\b/i,
  /\bconnect the (live|neutral|earth|red|black|brown|blue)\b/i,
  /\b(diy|do it yourself|yourself instead of an electrician)\b/i,
  /\b(multimeter|voltage tester|test pen)\b/i,
  /\boverride (the )?(protection|breaker|bms)\b/i,
];

export function isUnsafeInstruction(text: string): boolean {
  return UNSAFE_PATTERNS.some((re) => re.test(text));
}

/** Drops unsafe sentences from a free-text field; reports whether anything was removed. */
export function stripUnsafeSentences(text: string): { text: string; removed: boolean } {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !isUnsafeInstruction(s));
  return { text: kept.join(' ').trim(), removed: kept.length !== sentences.length };
}

/** Short human title for a case from the first customer message. */
export function caseTitle(message: string): string {
  const first = message.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? message;
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
}
