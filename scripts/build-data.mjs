// Builds a clean medicines dataset from the stock CSV and writes it to public/data/medicines.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV = path.join(ROOT, 'Stock Record (1).csv');
const OUT = path.join(ROOT, 'public', 'data', 'medicines.json');

const raw = fs.readFileSync(CSV, 'utf8');

// ---- Robust CSV parse (handles quoted fields + commas inside quotes) ----
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(f => f.trim() !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f.trim() !== '')) rows.push(row); }
  return rows;
}

const rows = parseCsv(raw);
const header = rows[0].map(h => h.trim().replace(/\uFEFF/g, ''));

function num(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/,/g, '').replace(/₹/g, '');
  if (t === '' || t === '—' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const FORM_MAP = {
  TAB: 'Tablets',
  CAPs: 'Capsules',
  CAP: 'Capsules',
  CAPSULE: 'Capsules',
  SYRUP: 'Syrups & Liquids',
  SUSP: 'Syrups & Liquids',
  'Solution': 'Syrups & Liquids',
  DROP: 'Drops & Sprays',
  'OINTMENT': 'Creams & Ointments',
  'Tube': 'Creams & Ointments',
  'GEL': 'Creams & Ointments',
  'Jelly': 'Creams & Ointments',
  'INJ': 'Injections',
  'AMP': 'Injections',
  'VIAL': 'Injections',
  'IV': 'Injections',
  'Sachet': 'Sachets & Powders',
  'Powder': 'Sachets & Powders',
  'RESPules': 'Respules',
  'STRIPS': 'Surgical & Consumables',
  'General': 'Surgical & Consumables',
  'Bandage': 'Surgical & Consumables',
  'MASK': 'Surgical & Consumables',
  'GlOVES': 'Surgical & Consumables',
  'CATHETER': 'Surgical & Consumables',
  'Syringe': 'Surgical & Consumables',
  'Needle': 'Surgical & Consumables',
  'Cannula': 'Surgical & Consumables',
  'Bag': 'Surgical & Consumables',
  'Fixer': 'Surgical & Consumables',
  'Sanitizer': 'Surgical & Consumables',
  'Suture': 'Surgical & Consumables',
  'Bottle': 'Syrups & Liquids'
};

// Formulations where the pack is a strip/sheet of countable units
const COUNTABLE = new Set(['Tablets', 'Capsules']);

const byName = new Map();
for (const r of rows.slice(1)) {
  const name = (r[header.indexOf('Medicine')] || '').trim().toUpperCase();
  const formRaw = (r[header.indexOf('Formulation')] || '').trim();
  const mrp = num(r[header.indexOf('MRP ()')]);
  const pack = num(r[header.indexOf('Packing')]) ?? 1;
  const qty = num(r[header.indexOf('Quantity')]) ?? 0;
  const expiry = (r[header.indexOf('Expiry')] || '').trim();
  const saleRate = num(r[header.indexOf('Sale Rate ()')]);
  if (!name || mrp == null || mrp <= 0) continue;
  const cat = FORM_MAP[formRaw] || (formRaw ? 'General' : 'Surgical & Consumables');
  const key = name;
  if (!byName.has(key)) {
    byName.set(key, { name, formRaw, category: cat, mrp, pack, qty: 0, expiry: '', saleRate });
  } else {
    const e = byName.get(key);
    // Prefer the entry with larger packing (better partial-quantity training) and valid qty
    if (pack > e.pack) { e.pack = pack; e.mrp = mrp; e.saleRate = saleRate; }
    if (qty > e.qty) e.qty = qty;
    if (expiry && !e.expiry) e.expiry = expiry;
  }
}

const items = [];
let id = 0;
for (const e of byName.values()) {
  const countable = COUNTABLE.has(e.category);
  const pack = Math.max(1, Math.round(e.pack));
  // Whole-rupee MRP used for in-game billing (v1 keeps calculations in whole rupees).
  const mrpExact = round2(e.mrp);
  const mrp = Math.round(mrpExact);
  // Partial quantity only for strips whose whole-rupee MRP divides evenly per unit
  // (clean unit price → clean mental math for v1).
  const partialAllowed = countable && pack > 1 && mrp % pack === 0;
  const unit = partialAllowed ? mrp / pack : null;
  items.push({
    id: ++id,
    name: e.name,
    category: e.category,
    form: e.formRaw,
    mrp,
    mrpExact,
    pack,
    unit,
    partialAllowed,
    stock: e.qty,
    expiry: e.expiry
  });
}

items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

function round2(n) { return Math.round(n * 100) / 100; }

const summary = {};
for (const it of items) summary[it.category] = (summary[it.category] || 0) + 1;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), count: items.length, summary, items }, null, 1), 'utf8');
console.log(`Wrote ${items.length} medicines to ${path.relative(ROOT, OUT)}`);
console.log(summary);
