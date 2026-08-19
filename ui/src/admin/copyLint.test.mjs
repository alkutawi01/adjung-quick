// copyLint.test.mjs — Piawai bahasa Polish 3-10 (arahan ChatGPT selepas
// teguran Izzat tentang "--" dan kualiti bahasa UI). Ujian statik ringkas
// sahaja -- BUKAN pemeriksa tatabahasa. Ia gagal (exit 1) apabila teks
// paparan (JSX text nodes / string literal dalam JSX) dalam ui/src/admin/
// mengandungi:
//   1. "--" ASCII dua tanda sempang (patut jadi em dash "—" atau en dash "–");
//   2. "..." tiga titik ASCII (patut jadi elipsis "…");
//   3. singkatan SMS terpilih (tak/ni/tu/dgn/utk/drpd/yg/sbb) sebagai
//      perkataan penuh (bukan sebahagian perkataan lain);
//   4. nama modul/jadual/enum backend yang dilarang bocor ke UI.
//
// Skop: hanya teks yang BENAR-BENAR dipaparkan kepada pengguna -- string
// literal single/double-quote dan template literal DALAM fail .jsx, minus
// komen. Sengaja TIDAK cuba parse JSX text node secara penuh (perlukan
// parser AST); heuristik regex atas string literal + JSX children ringkas
// sudah cukup untuk menangkap corak paling kerap berulang dalam projek ni.
// Fail import/eksport, nama fungsi, className, dsb ditapis keluar oleh
// senarai pengecualian di bawah -- kalau ada positif palsu baharu, tambah
// pengecualian eksplisit di sini (BUKAN longgarkan corak carian).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ADMIN_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');

const SMS_ABBREVIATIONS = ['tak', 'ni', 'tu', 'dgn', 'utk', 'drpd', 'yg', 'sbb'];
// Nama backend yang dilarang bocor ke teks paparan (bukan komen kod).
const BANNED_BACKEND_TERMS = [
  'classification_rules', 'editorial_objects', 'editorial_revisions',
  'editorial_attribute_values', 'service_role', 'subject_code', 'field_code',
  'known_category', 'sources.known_category', 'rule_type', '.mjs', '.jsx',
];

// Baris/corak yang diketahui SELAMAT (bukan teks paparan sebenar) --
// dikecualikan secara eksplisit supaya senarai larangan di atas boleh
// kekal ketat tanpa positif palsu berulang.
const ALLOWLIST_SUBSTRINGS = [
  'CONTENT_PHRASE_RULES', // nama const dalaman fail, bukan label UI
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    // baris import -- laluan modul (./Foo.jsx, ../../../db/x.mjs) bukan
    // teks paparan, dan mengandungi ".jsx"/".mjs" secara sah.
    .replace(/^\s*import\b.*$/gm, '');
}

function extractStringLiterals(src) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(src))) out.push(m[2]);
  return out;
}

// Teks JSX MENTAH (bukan dalam string literal) -- corak
// `>teks di sini<` antara tag. Ditambah selepas dijumpai bug sebenar
// (KaedahNilaiPanel.jsx, Polish 4A): "production -- ubah berat..."
// ditulis terus sebagai anak JSX <p>, bukan string literal, jadi
// extractStringLiterals() di atas TIDAK PERNAH melihatnya. Heuristik
// sahaja (bukan parser JSX) -- {ekspresi} & atribut tag boleh sisip teks
// tak berkaitan, jadi corak dilonggarkan (baris 80 ke bawah tetap sama).
function extractJsxTextNodes(src) {
  const out = [];
  const re = />([^<>{}]+)</g;
  let m;
  while ((m = re.exec(src))) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return out;
}

// Corak "kelas CSS/BEM" -- token dipisah ruang, setiap token huruf kecil/
// nombor/underscore/hyphen sahaja (contoh "digest__row digest__row--
// attention"). Ini BUKAN teks paparan, jadi dikecualikan supaya senarai
// larangan boleh kekal ketat pada teks Melayu sebenar tanpa banjir
// positif palsu daripada className.
function looksLikeClassNameList(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every(t => /^[a-z0-9_-]+$/.test(t));
}

function findViolations(filePath, src) {
  const violations = [];
  const clean = stripComments(src);
  const candidates = [...extractStringLiterals(clean), ...extractJsxTextNodes(clean)];

  for (const rawText of candidates) {
    // Buang ${...} interpolasi template literal dahulu -- selalunya nilai
    // status/kelas dinamik (contoh "foo--${bar}"), bukan sebahagian teks
    // Melayu yang perlu diperiksa tanda baca/singkatannya.
    const text = rawText.replace(/\$\{[^}]*\}/g, ' ');
    if (ALLOWLIST_SUBSTRINGS.some(s => rawText.includes(s))) continue;
    if (text.length < 2) continue;
    if (!text.includes(' ')) continue; // teks paparan sebenar sentiasa >1 perkataan
    if (looksLikeClassNameList(text)) continue;
    if (/^[./]/.test(text)) continue; // laluan modul yang terlepas dari strip import
    // Kod JS tersasar antara dua "<"/">" tak berkaitan (extractJsxTextNodes
    // ialah heuristik, bukan parser JSX sebenar -- boleh salah anggap
    // ungkapan boolean/operator sebagai teks paparan). Bukan teks Melayu
    // sebenar kalau ada corak operator JS macam ni.
    if (/===|!==|&&|\|\||=>|\?\?/.test(text)) continue;

    if (/[^-]--[^-]|^--|--$/.test(text) && !text.includes('http')) {
      violations.push({ file: filePath, text, rule: 'ASCII "--" (guna em/en dash sebenar)' });
    }
    if (/\.\.\./.test(text) && !text.trim().startsWith('...')) {
      // "..." pada permulaan trim = kemungkinan spread ditangkap oleh regex
      // string literal (jarang, tapi label defensif) -- selain itu, "..."
      // dalam teks paparan sepatutnya elipsis sebenar "…".
      violations.push({ file: filePath, text, rule: 'ASCII "..." (guna elipsis "…" sebenar)' });
    }
    for (const term of BANNED_BACKEND_TERMS) {
      if (text.includes(term)) {
        violations.push({ file: filePath, text, rule: `nama backend bocor: "${term}"` });
      }
    }
    for (const abbr of SMS_ABBREVIATIONS) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${abbr}(?![\\p{L}\\p{N}])`, 'u');
      if (re.test(text)) {
        violations.push({ file: filePath, text, rule: `singkatan SMS: "${abbr}"` });
      }
    }
  }
  return violations;
}

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (entry.endsWith('.jsx')) files.push(full);
  }
  return files;
}

const files = walk(ADMIN_DIR);
let allViolations = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  allViolations.push(...findViolations(file, src));
}

if (allViolations.length > 0) {
  console.error(`copyLint: ${allViolations.length} pelanggaran piawai bahasa ditemui:\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file.replace(ADMIN_DIR, '')}: ${v.rule}\n    "${v.text.slice(0, 80)}"`);
  }
  process.exit(1);
} else {
  console.log(`copyLint: ${files.length} fail .jsx diperiksa, tiada pelanggaran.`);
}
