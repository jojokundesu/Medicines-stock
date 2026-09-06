# Medicines Stock — Ingredient-Based Sub-Categorization Report
**Version 3 — Sub-Categorized Edition**  •  Generated: 06 September 2026  
**Branch:** `arena/01a07545-medicines-stock`  •  **Source:** `Stock_Medicines_Categorized_Sale_Rates (1).docx` (Version 2 enriched, 1,789 medicines)

---

## 1. What was done

The **newly updated (enriched) file** — which already contained Active Ingredients, Formulation, Strength, Dose, and Clinical Notes — has been reorganized into **ingredient-based sub-categories**.

> **Rule:** *All medicines sharing the exact same Active Ingredient(s) (case-insensitive, whitespace-normalized) are placed in the same sub-category; different ingredients are never mixed.*

Implementation was fully programmatic (see `generate_subcategorized.py`):

1. Normalised each `Active Ingredient(s)` value: trimmed, collapsed whitespace, lower-cased. Place-holders `— (non-drug item)` and `— (not verified)` form their own special groups.
2. Within each of the 16 main therapeutic categories, grouped rows by the normalised key.
3. Sorted groups: **multi-medicine groups first** (largest → smallest, then A–Z), followed by **single-medicine groups** (A–Z). Special groups (`Non-Drug`, `Not Verified`) are placed at the end of each category for clarity.
4. Re-built the document: a heading per main category (`1. Surgical & Medical Consumables — 101 medicines → 3 sub-categories`) and a heading per ingredient group (`1.2 Non-Drug / Consumable Items — 84 items`) plus a consistent 8-column table. Every table is internally consistent — verified with an automated check (720/720 ingredient tables contain exactly one distinct ingredient).

---

## 2. Files

| File | Size | Description |
|------|------|-------------|
| `Stock_Medicines_Categorized_Sale_Rates (1).docx` | 234 KB | **Newly updated file — now sub-categorized** (Version 3, overwrites Version 2) — the primary deliverable for the request |
| `Stock_Medicines_Subcategorized_by_Ingredient.docx` | 234 KB | **Identical copy** with an explicit name, for easy discovery |
| `Stock_Medicines_Categorized_Sale_Rates.docx` | 69 KB | Original stock list without ingredient data — left unchanged |
| `generate_subcategorized.py` | 33 KB | Reproducible Python script used for the transformation |
| `SUBCATEGORIZATION_REPORT.md` | — | This report |

---

## 3. Overall statistics

- **Main categories:** 16 (unchanged)
- **Total medicines:** 1,789 line items (1,784 unique names, 3,711 stock rows)
- **Distinct normalized ingredients (global):** 684 (246 non-drug, 194 unverified, ~1,344 true drug entries)
- **Sub-categories (within-category count, ingredient may appear in two categories):** **720**
  - Multi-medicine ingredient groups (≥2 sharing): **~260 true drug groups** (277 if counting the two special placeholders)
  - Single-medicine groups: **~460**
- **Largest ingredient groups (global):**
  - Glimepiride + Metformin — **17** medicines (Other / Unclassified)
  - Betahistine — **13**
  - Thyroxine — **12**
  - Amoxycillin + Clavulanic Acid — **12**
  - Etoricoxib — 11
  - Levetiracetam — 10

---

## 4. Per–main-category breakdown

| # | Main Category | Meds | Sub-Cats | Multi (≥2) | Single | Largest Ingredient Group |
|---|---------------|------|----------|------------|--------|--------------------------|
| 1 | Surgical & Medical Consumables | 101 | 3 | 0 | 1 | Antacid oral suspension (alginate/antacid gel) (1) — specials dominate: Non-Drug 84, Not Verified 16 |
| 2 | Diagnostic Devices & Test Supplies | 6 | 1 | 0 | 0 | — (all Non-Drug 6) |
| 3 | Vaccines, Immunoglobulins & Biologics | 1 | 1 | 0 | 1 | Rabies vaccine … (1) |
| 4 | Antibiotics & Antibacterials | 39 | 22 | 8 | 13 | Amoxycillin + Clavulanic Acid (4), Cefixime (4) |
| 5 | Antifungals & Antiprotozoals | 2 | 1 | 1 | 0 | Terbinafine (2) |
| 6 | Gastrointestinal | 16 | 4 | 0 | 3 | Non-Drug 13 (Torsid family) |
| 7 | Respiratory & Allergy | 18 | 13 | 4 | 9 | Budesonide respules (3) |
| 8 | Cardiovascular & Blood Pressure | 2 | 1 | 1 | 0 | Spironolactone (2) |
| 9 | Neurology & Psychiatry | 1 | 1 | 0 | 1 | Sodium Valproate + Valproic Acid (1) |
|10 | Dermatology | 56 | 43 | 8 | 34 | Acyclovir (3), Mupirocin (3) |
|11 | Eye & Ear Preparations | 6 | 6 | 0 | 6 | — (all distinct, 1 each) |
|12 | Urology & Kidney | 1 | 1 | 0 | 0 | Not Verified (1) |
|13 | Women's Health & Obstetrics | 5 | 4 | 0 | 3 | Not Verified (2) |
|14 | Nutrition, Vitamins & Supplements | 4 | 4 | 0 | 4 | — (all distinct) |
|15 | Antiseptics & Disinfectants | 4 | 2 | 1 | 1 | Ethyl alcohol (isopropyl alcohol base) (3) |
|16 | Other / Unclassified Medicines | 1527 | 613 | 250 | 361 | Glimepiride + Metformin (17), Betahistine (13), Thyroxine (12) |

*Non-Drug and Not-Verified are counted as special sub-categories and appear last in each section; “Multi/Single” columns above count only true drug ingredients.*

---

## 5. Document structure (new)

- **Cover page** — title, sub-title (“Sub-Categorized by Active Ingredient”), version line, “What’s new” box, method bullets, coverage table, reading guide, disclaimer, legend.
- **Summary table** — one row per main category with sub-category counts and largest ingredient.
- **16 main sections** — each starts with a Heading 1 (e.g., `4. Antibiotics & Antibacterials — 39 medicines → 22 ingredient-based sub-categories`) and a summary line (`22 sub-categories: 8 multi …`).
- **~720 sub-sections** — each is a Heading 2 (multi-medicine, bold dark-blue, 9 pt) or Heading 3 (singleton, 8 pt) titled like `4.1 Amoxycillin + Clavulanic Acid — 4 medicines`, followed by a Table Grid (header dark-blue #1F3A5F, white text; zebra-striped rows #EEF3F9/white; Ingredient column never varies within a table).
- **Navigation:** Use Word’s **Navigation Pane → Headings** (Ctrl+Shift+F5 or View → Navigation Pane) to jump instantly between ingredient groups. Headings are outline-leveled for a dynamic Table of Contents.
- **Page layout:** A4 Landscape (11.69″ × 8.27″), narrow margins (0.47″), Table Grid, header repeat, split-allowed — identical to the enriched Version 2 for print continuity.

---

## 6. Quality checks

- Automated ingredient-consistency check: **720 / 720** ingredient tables contain **exactly one distinct normalized ingredient** (summary table excluded).
- Row count preserved: **1,789** medicines across all ingredient tables = original total.
- All 8 data columns preserved per row (Item Name, Active Ingredient, Formulation, Strength, Adult Dose, Clinical Note, Sale Rate, Info Source) with source-colour coding retained.

---

## 7. How to use

1. Open `Stock_Medicines_Subcategorized_by_Ingredient.docx` (or the overwritten `(1).docx`) in Word / LibreOffice.
2. Open **Navigation Pane** (View → Navigation Pane → Headings). Expand a main category (e.g., “Antibiotics”) to see its ingredient sub-categories.
3. To find interchangeable brands, locate the ingredient (e.g., “Glimepiride + Metformin — 17 medicines”) — all 17 rows list the same salts, differing only by brand/strength.
4. For hospital review: scan “Non-Drug / Consumable” and “Not Verified — See Pack Label” sub-categories at the end of each section to isolate items needing label verification.

---

## 8. Reproducibility

Run `python3 generate_subcategorized.py` from the repository root. It reads `Stock_Medicines_Categorized_Sale_Rates (1).docx` (or the original enriched backup) and writes the two Version-3 files. Requires `python-docx` (`pip install python-docx`).

---

*End of report.*
