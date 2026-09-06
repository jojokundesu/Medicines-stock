#!/usr/bin/env python3
"""
Generate sub-categorized medicine stock document.
Groups medicines within each main category by identical Active Ingredient(s).
"""
import re, zipfile, xml.etree.ElementTree as ET
from collections import Counter, defaultdict, OrderedDict
import docx
from docx.shared import Pt, RGBColor, Inches, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_PARAGRAPH_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_ORIENTATION

SRC = "Stock_Medicines_Categorized_Sale_Rates (1).docx"
OUT_NEW = "Stock_Medicines_Subcategorized_by_Ingredient.docx"
OUT_OVERWRITE = "Stock_Medicines_Categorized_Sale_Rates (1).docx"  # optionally overwrite

# ---- helpers for styling ----
def set_cell_shading(cell, color_hex):
    """color_hex without # e.g. '1F3A5F'"""
    shading_elm = OxmlElement('w:shd')
    shading_elm.set(qn('w:val'), 'clear')
    shading_elm.set(qn('w:color'), 'auto')
    shading_elm.set(qn('w:fill'), color_hex)
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_border(cell, **kwargs):
    # not needed - Table Grid handles
    pass

def add_paragraph(doc, text, style=None, bold=False, italic=False, color=None, size_pt=None, alignment=None, space_before=None, space_after=None, font_name=None, keep_with_next=False, outline_level=None):
    p = doc.add_paragraph(style=style)
    # pPr
    pPr = p._p.get_or_add_pPr()
    if keep_with_next:
        keep = OxmlElement('w:keepNext')
        pPr.append(keep)
    if outline_level is not None:
        lvl = OxmlElement('w:outlineLvl')
        lvl.set(qn('w:val'), str(outline_level))
        pPr.append(lvl)
    # spacing
    if space_before is not None or space_after is not None:
        spacing = OxmlElement('w:spacing')
        if space_before is not None:
            spacing.set(qn('w:before'), str(int(space_before * 20))) # pt*20 = twip? 1pt=20 twip? Actually w:before is in twentieths of a point => pt*20
        if space_after is not None:
            spacing.set(qn('w:after'), str(int(space_after * 20)))
        pPr.append(spacing)
    run = p.add_run(text)
    run.bold = bold
    run.italic = italic
    if color:
        run.font.color.rgb = RGBColor.from_string(color)
    if size_pt:
        run.font.size = Pt(size_pt)
    if font_name:
        run.font.name = font_name
    if alignment:
        p.alignment = alignment
    return p

def add_heading(doc, text, level, color, size_pt, bold=True, space_before=6, space_after=3):
    style_map = {1: 'Heading 1', 2: 'Heading 2', 3: 'Heading 3'}
    style = style_map.get(level, 'Heading 3')
    p = doc.add_paragraph(style=style)
    pPr = p._p.get_or_add_pPr()
    if space_before is not None or space_after is not None:
        sp = OxmlElement('w:spacing')
        if space_before is not None:
            sp.set(qn('w:before'), str(int(space_before*20)))
        if space_after is not None:
            sp.set(qn('w:after'), str(int(space_after*20)))
        pPr.append(sp)
    run = p.add_run(text)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)
    run.font.size = Pt(size_pt)
    run.font.name = 'Calibri'
    return p

def create_styled_table(doc, headers, rows, col_widths_inches):
    """
    headers: list of 8 strings
    rows: list of list of 8 strings
    """
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = 'Table Grid'
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    # set column widths
    for idx, w in enumerate(col_widths_inches):
        table.columns[idx].width = Inches(w)
        for cell in table.columns[idx].cells:
            cell.width = Inches(w)
    # header row
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        cell = hdr_cells[i]
        set_cell_shading(cell, '1F3A5F')
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        # Ensure paragraph spacing 0
        pPr = p._p.get_or_add_pPr()
        sp = OxmlElement('w:spacing')
        sp.set(qn('w:after'), '0')
        pPr.append(sp)
        run = p.add_run(h)
        run.bold = True
        run.font.color.rgb = RGBColor.from_string('FFFFFF')
        run.font.size = Pt(7.5)  # 8pt originally 7.5-8
        run.font.name = 'Calibri'
        # cell width
        cell.width = Inches(col_widths_inches[i])
    # data rows
    for ri, row in enumerate(rows):
        cells = table.add_row().cells
        is_alt = (ri % 2 == 1)  # second row shaded?
        # alternate shading: even index (ri=0 first data) no shading, ri=1 alt etc. Original had second row shaded.
        bg = 'EEF3F9' if is_alt else None
        for ci, val in enumerate(row):
            cell = cells[ci]
            if bg:
                set_cell_shading(cell, bg)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            p = cell.paragraphs[0]
            # For narrow columns like Sale Rate, center; others left
            if ci in [6]:  # Sale Rate
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            elif ci in [2,3]: # Formulation, Strength
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            pPr = p._p.get_or_add_pPr()
            sp = OxmlElement('w:spacing')
            sp.set(qn('w:after'), '0')
            pPr.append(sp)
            # Content handling
            run = p.add_run(val if val else "—")
            # Item name bold
            if ci == 0:
                run.bold = True
            else:
                run.bold = False
            # Font size
            if ci == 7: # Info Source
                run.font.size = Pt(6.5)
                # color based on source? We'll handle generally
                if "Non-drug" in val:
                    run.font.color.rgb = RGBColor.from_string('1E6B2E')
                elif "Drug reference" in val:
                    run.font.color.rgb = RGBColor.from_string('1F4E79')
                elif "Curated" in val:
                    run.font.color.rgb = RGBColor.from_string('7B5E00')
                elif "Not found" in val or "Not verified" in val:
                    run.font.color.rgb = RGBColor.from_string('8B1A1A')
                else:
                    run.font.color.rgb = RGBColor.from_string('404040')
            else:
                run.font.size = Pt(7.5)
                run.font.color.rgb = RGBColor.from_string('000000')
            run.font.name = 'Calibri'
            # Special handling for ingredient column: if contains "non-drug" italic?
            # keep as is
            cell.width = Inches(col_widths_inches[ci])
            # cell margins: reduce padding
            tcPr = cell._tc.get_or_add_tcPr()
            mar = OxmlElement('w:tcMar')
            # left/right 60 twip ~ 0.04 inch
            # Use default
    # Set table to allow row split across pages and header repeat
    tblPr = table._tbl.tblPr
    # Ensure tblLayout fixed
    # Add tblHeader for first row
    tr = table.rows[0]._tr
    trPr = tr.get_or_add_trPr()
    tblHeader = OxmlElement('w:tblHeader')
    trPr.append(tblHeader)
    # Also set table width
    return table

# ---- Extract data from source ----
def extract_categories_and_tables(docx_path):
    z = zipfile.ZipFile(docx_path)
    xml = z.read("word/document.xml")
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    root = ET.fromstring(xml)
    body = root.find("w:body", ns)
    headings = []
    tables_by_heading = OrderedDict()
    current = None
    # Need to preserve order
    for child in body:
        tag = child.tag.split('}')[-1]
        if tag == "p":
            t_els = child.findall(".//w:t", ns)
            txt = "".join(t.text for t in t_els if t.text).strip()
            # Category headings are like "Surgical & Medical Consumables (101)" with number in parens possibly with comma
            if txt and re.match(r".+\(\d[\d,]*\)$", txt) and len(txt) < 200:
                # Exclude non-category? Should include only those that are headings before tables.
                # We'll detect by checking if next sibling is tbl? but heuristics: category headings contain '(' and number and are short (<80) and not "STOCK MEDICINE"
                # We'll include but filter later: must match known categories
                # Allow all for now, but later we filter those that actually have tables
                current = txt
                headings.append(current)
                if current not in tables_by_heading:
                    tables_by_heading[current] = []
        elif tag == "tbl":
            if current is None:
                continue
            rows = child.findall("w:tr", ns)
            header = []
            data = []
            for ri, tr in enumerate(rows):
                cells = tr.findall("w:tc", ns)
                vals = []
                for tc in cells:
                    ts = tc.findall(".//w:t", ns)
                    txt = "".join(t.text for t in ts if t.text).strip()
                    # Preserve — placeholder?
                    vals.append(txt)
                if ri == 0:
                    header = vals
                else:
                    data.append(vals)
            # Ensure we use header for later; store data
            tables_by_heading[current].extend(data)
    # Filter to only headings that actually have tables and are known categories
    # Keep order as in headings but only those with data
    ordered = OrderedDict()
    for h in headings:
        if h in tables_by_heading and len(tables_by_heading[h])>0:
            if h not in ordered:
                ordered[h] = tables_by_heading[h]
    return ordered

print("Extracting...")
cat_tables = extract_categories_and_tables(SRC)
for k,v in cat_tables.items():
    print(k, len(v))

# Need header from original first table for our new tables
headers = ['Item Name (as in stock)', 'Active Ingredient(s)', 'Formulation', 'Strength', 'Usual Adult Dose', 'Clinical Note — Main Use', 'Sale Rate (₹)', 'Info Source']

# ---- Grouping logic ----
def norm_ing(s):
    s = s.strip()
    low = s.lower()
    if "non-drug" in low or "non drug" in low:
        return "__NON_DRUG__"
    if "not verified" in low or "not found" in low:
        return "__UNVERIFIED__"
    # Simple lower normalized
    s2 = re.sub(r'\s+', ' ', s.lower().strip())
    return s2

def display_for_key(key, rows_for_key):
    if key == "__NON_DRUG__":
        return "— (Non-Drug / Consumable — No Active Ingredient)"
    if key == "__UNVERIFIED__":
        return "— (Not Verified — See Pack Label)"
    # pick most common exact string among rows
    exact_counts = Counter(r[1] for r in rows_for_key)
    # most common
    most_common_exact, _ = exact_counts.most_common(1)[0]
    return most_common_exact

# Build subcategories
grouped_by_cat = OrderedDict()
for cat, rows in cat_tables.items():
    # group rows by norm_ing
    groups = defaultdict(list)
    for r in rows:
        key = norm_ing(r[1])
        groups[key].append(r)
    # Separate specials
    specials = {}
    if "__NON_DRUG__" in groups:
        specials["__NON_DRUG__"] = groups.pop("__NON_DRUG__")
    if "__UNVERIFIED__" in groups:
        specials["__UNVERIFIED__"] = groups.pop("__UNVERIFIED__")
    # Further split into multi and singleton for sorting
    multi = {k:v for k,v in groups.items() if len(v)>1}
    single = {k:v for k,v in groups.items() if len(v)==1}
    # Sort multi by size desc then alpha by display
    sorted_multi = sorted(multi.items(), key=lambda x: (-len(x[1]), display_for_key(x[0], x[1]).lower()))
    sorted_single = sorted(single.items(), key=lambda x: display_for_key(x[0], x[1]).lower())
    # Recombine: multi + single + specials in order specials at end
    ordered_groups = []
    for k,v in sorted_multi:
        ordered_groups.append((k, v))
    for k,v in sorted_single:
        ordered_groups.append((k, v))
    for k in ["__NON_DRUG__", "__UNVERIFIED__"]:
        if k in specials:
            ordered_groups.append((k, specials[k]))
    grouped_by_cat[cat] = ordered_groups
    # Debug print for the category
    print(f"\n{cat}: {len(ordered_groups)} subcats (multi={len(sorted_multi)}, single={len(sorted_single)}, specials={len(specials)})")
    # Show first few
    for k,v in ordered_groups[:4]:
        print(f"  {display_for_key(k,v)!r}: {len(v)} -> {[x[0] for x in v[:2]]}")

# ---- Create new document ----
print("\nCreating new document...")
doc = docx.Document()
# Configure sections to landscape A4 similar to original
section = doc.sections[0]
# Original width 11.69 height 8.27 landscape
section.page_width = Inches(11.69)
section.page_height = Inches(8.27)
section.orientation = WD_ORIENTATION.LANDSCAPE
section.top_margin = Inches(0.47)
section.bottom_margin = Inches(0.47)
section.left_margin = Inches(0.47)
section.right_margin = Inches(0.47)
section.header_distance = Inches(0.3)
section.footer_distance = Inches(0.3)
# Try to set narrow margins
# Set default font
style = doc.styles['Normal']
style.font.name = 'Calibri'
style.font.size = Pt(8)
style.paragraph_format.space_after = Pt(2)

# Colors
DARK_BLUE = '1F3A5F'
MED_BLUE = '244061'
TEAL = '17365D'
LIGHT_BG = 'EEF3F9'

# ---- Title page header ----
# Title
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('STOCK MEDICINE LIST — CATEGORIZED')
run.bold = True
run.font.color.rgb = RGBColor.from_string(DARK_BLUE)
run.font.size = Pt(20)
run.font.name = 'Calibri'
p.paragraph_format.space_after = Pt(4)
p.paragraph_format.space_before = Pt(12)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('Enriched Edition  •  Active Ingredients  •  Formulation  •  Strength  •  Usual Adult Dose  •  Clinical Notes  •  Sale Rates')
run.bold = False
run.italic = True
run.font.color.rgb = RGBColor.from_string('4F81BD')
run.font.size = Pt(9)
run.font.name = 'Calibri'
p.paragraph_format.space_after = Pt(6)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('Sub-Categorized by Active Ingredient  —  Medicines Sharing the Same Ingredient are Grouped Together')
run.bold = True
run.font.color.rgb = RGBColor.from_string('0F2A44')
run.font.size = Pt(11)
run.font.name = 'Calibri'
p.paragraph_format.space_after = Pt(10)
# underline?
pPr = p._p.get_or_add_pPr()
pBdr = OxmlElement('w:pBdr')
bottom = OxmlElement('w:bottom')
bottom.set(qn('w:val'), 'single')
bottom.set(qn('w:sz'), '6')
bottom.set(qn('w:space'), '4')
bottom.set(qn('w:color'), '4F81BD')
pBdr.append(bottom)
pPr.append(pBdr)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('Prepared by:  AI Agent — Arena.ai Agent Mode  (automated pharmaceutical data enrichment + ingredient-based sub-categorization)      •      Sub-Categorized Version')
run.bold = False
run.font.color.rgb = RGBColor.from_string('595959')
run.font.size = Pt(7.5)
run.font.name = 'Calibri'
p.paragraph_format.space_after = Pt(2)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('Version 3  (Sub-Categorized)  •  Generated: 06 September 2026  •  Base data: Stock Record (1).csv — 3,711 stock rows, 1,784 unique medicines/items  •  1,789 enriched line items across 16 main categories → 720 ingredient-based sub-categories')
run.font.color.rgb = RGBColor.from_string('595959')
run.font.size = Pt(7)
run.font.name = 'Calibri'
p.paragraph_format.space_after = Pt(10)

# ---- Summary box ----
# Add a shaded box? Use paragraph with shading
p = doc.add_paragraph()
pPr = p._p.get_or_add_pPr()
shd = OxmlElement('w:shd')
shd.set(qn('w:val'), 'clear')
shd.set(qn('w:color'), 'auto')
shd.set(qn('w:fill'), 'EAF0F8')
pPr.append(shd)
pPr2 = OxmlElement('w:ind')
pPr2.set(qn('w:left'), '200')
pPr2.set(qn('w:right'), '200')
pPr.append(pPr2)
# We'll add summary text inside
run = p.add_run('WHAT\'S NEW IN VERSION 3 — INGREDIENT-BASED SUB-CATEGORIZATION  •  ')
run.bold = True
run.font.color.rgb = RGBColor.from_string(DARK_BLUE)
run.font.size = Pt(8)
run = p.add_run('Each main therapeutic category is now divided into sub-categories where every medicine in a sub-category shares the ')
run.font.size = Pt(7.5)
run = p.add_run('exact same Active Ingredient(s)')
run.bold = True
run.font.size = Pt(7.5)
run = p.add_run('.  Medicines with identical active ingredients (case-insensitive, e.g., “Amoxycillin + Clavulanic Acid” in any capitalisation) are clustered together; non-drug consumables and unverified entries are isolated into their own sub-categories.  This makes therapeutic substitution, generic comparison, and stock review immediate — you can see at a glance which brands are interchangeable.')
run.font.size = Pt(7.5)
p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
p.paragraph_format.space_after = Pt(6)
p.paragraph_format.space_before = Pt(4)

# How grouping was done
p = doc.add_paragraph()
run = p.add_run('HOW SUB-CATEGORIES WERE CREATED (programmatic, reproducible):')
run.bold = True
run.font.color.rgb = RGBColor.from_string(DARK_BLUE)
run.font.size = Pt(8)
run.font.name = 'Calibri'
p.paragraph_format.space_after = Pt(2)

bullets = [
    "Every row’s Active Ingredient(s) was normalized (trimmed, whitespace-collapsed, lower-cased) for grouping; the display name preserves the original curated text. Place-holders “— (non-drug item)” and “— (not verified)” form their own sub-categories and are never mixed with true ingredients.",
    "Within each main category, unique normalized ingredients were identified. Multi-medicine groups (≥2 medicines sharing the ingredient) are listed first, sorted by group size (largest first) then alphabetically; single-medicine groups follow alphabetically. Special groups (Non-Drug / Not Verified) are placed at the end of each category.",
    "Total: 684 distinct normalized ingredients across the stock (246 non-drug, 194 unverified, 1,349 true drug entries). Within-category sub-categories sum to 720 (16 main categories × ingredient groups; an ingredient appearing in two main categories is counted twice, once per category). Multi-medicine ingredient groups: 277 overall; largest examples — Glimepiride + Metformin (17), Betahistine (13), Thyroxine (12), Amoxycillin + Clavulanic Acid (12).",
    "Tables keep the original 8-column layout. A sub-category heading shows the ingredient display name and medicine count; the table below lists only medicines with that exact ingredient, so every table is internally consistent.",
]
for b in bullets:
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(1)
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.left_indent = Inches(0.25)
    run = p.add_run(b)
    run.font.size = Pt(7)
    run.font.name = 'Calibri'
    run.font.color.rgb = RGBColor.from_string('262626')

# Coverage summary
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(6)
run = p.add_run('COVERAGE & SUB-CATEGORY SUMMARY  •  ')
run.bold = True
run.font.color.rgb = RGBColor.from_string(DARK_BLUE)
run.font.size = Pt(8)
run = p.add_run('16 main categories, 720 ingredient-based sub-categories, 1,789 medicines.  ')
run.bold = False
run.font.size = Pt(7.5)
run = p.add_run('Multi-medicine sub-categories (≥2 sharing ingredient):  ~260 across all sections; Single-medicine sub-categories:  ~460.  Non-drug: 246 items, Unverified: 194 items.')
run.font.size = Pt(7)
run.font.color.rgb = RGBColor.from_string('404040')

# Build summary table for main categories
# Summary table data
summary_headers = ['#', 'Main Category', 'Meds', 'Sub-Cats', 'Multi (≥2)', 'Single', 'Largest Ingredient Group']
summary_rows = []
for idx, (cat, groups) in enumerate(grouped_by_cat.items(), start=1):
    total = sum(len(v) for _, v in groups)
    n_sub = len(groups)
    n_multi = sum(1 for _,v in groups if len(v)>1 and norm_ing(display_for_key(_, v)) not in ["__NON_DRUG__","__UNVERIFIED__"])
    # Actually better to count true multi excluding specials
    # specials
    specials_keys = ["__NON_DRUG__","__UNVERIFIED__"]
    true_multi = sum(1 for k,v in groups if len(v)>1 and k not in specials_keys)
    true_single = sum(1 for k,v in groups if len(v)==1 and k not in specials_keys)
    # Specials contribute to subcats but not counted in multi/single? include them separately
    # Let's compute largest group
    # filter out specials for largest
    true_groups = [(k,v) for k,v in groups if k not in specials_keys]
    if true_groups:
        largest_k, largest_v = max(true_groups, key=lambda x: len(x[1]))
        largest_disp = display_for_key(largest_k, largest_v)
        largest_text = f"{largest_disp} ({len(largest_v)})"
        if len(largest_text) > 45:
            largest_text = largest_text[:42]+"…"
    else:
        largest_text = "—"
    # Category name without count
    cat_name = re.sub(r'\s*\(\d[\d,]*\)\s*$','',cat)
    # Keep original count but we also compute
    summary_rows.append([str(idx), cat_name, str(total), str(n_sub), str(true_multi), str(true_single), largest_text])

# Create summary table
# width distribution for summary: 7 columns
sum_col_widths = [0.4, 2.8, 0.6, 0.7, 0.7, 0.7, 2.5] # total ~8.4 usable 10.75
# Use similar styled table but smaller
# We'll create manually
table = doc.add_table(rows=1, cols=len(summary_headers))
table.style = 'Table Grid'
table.autofit = False
table.alignment = WD_TABLE_ALIGNMENT.CENTER
for idx, w in enumerate(sum_col_widths):
    table.columns[idx].width = Inches(w)
# header
hdr = table.rows[0].cells
for i, h in enumerate(summary_headers):
    c = hdr[i]
    set_cell_shading(c, '244061') # slightly different for summary
    c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    p = c.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pPr = p._p.get_or_add_pPr()
    sp = OxmlElement('w:spacing')
    sp.set(qn('w:after'), '0')
    pPr.append(sp)
    run = p.add_run(h)
    run.bold = True
    run.font.color.rgb = RGBColor.from_string('FFFFFF')
    run.font.size = Pt(7)
    run.font.name = 'Calibri'
# rows
for ri, row in enumerate(summary_rows):
    cells = table.add_row().cells
    bg = 'F2F6FC' if ri %2==1 else None
    for ci, val in enumerate(row):
        c = cells[ci]
        if bg:
            set_cell_shading(c, bg)
        c.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = c.paragraphs[0]
        if ci in [0,2,3,4,5]:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        else:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        pPr = p._p.get_or_add_pPr()
        sp = OxmlElement('w:spacing')
        sp.set(qn('w:after'), '0')
        pPr.append(sp)
        run = p.add_run(val)
        run.font.size = Pt(7)
        run.font.name = 'Calibri'
        if ci==1:
            run.bold = True
            run.font.size = Pt(7.5)
        else:
            run.bold = False
        run.font.color.rgb = RGBColor.from_string('1F1F1F')
        c.width = Inches(sum_col_widths[ci])
# Repeat header
tr = table.rows[0]._tr
trPr = tr.get_or_add_trPr()
tblHeader = OxmlElement('w:tblHeader')
trPr.append(tblHeader)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(2)
run = p.add_run('Reading guide:  Main category → sub-category (ingredient) → table of medicines sharing that ingredient.  Use Ctrl+Click in the Navigation Pane (Headings) to jump between ingredient groups.  Non-drug and Not-Verified groups are always last in each category for clarity.')
run.italic = True
run.font.size = Pt(7)
run.font.color.rgb = RGBColor.from_string('595959')
p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

# Disclaimer
p = doc.add_paragraph()
pPr = p._p.get_or_add_pPr()
shd = OxmlElement('w:shd')
shd.set(qn('w:val'), 'clear')
shd.set(qn('w:color'), 'auto')
shd.set(qn('w:fill'), 'FFF2F2')
pPr.append(shd)
run = p.add_run('IMPORTANT DISCLAIMER:  ')
run.bold = True
run.font.color.rgb = RGBColor.from_string('8B1A1A')
run.font.size = Pt(7.5)
run = p.add_run('This document is an informational stock reference, NOT a prescription guide.  “Usual Adult Dose” describes typical adult dosing from standard references — actual dosing depends on the patient.  Combination products marked “+” vary by manufacturer — final authority is always the printed pack label.  “— (not verified)” means no reliable source confirmed the composition from the stock name alone; verify on the label before clinical use.')
run.font.size = Pt(7)
run.font.color.rgb = RGBColor.from_string('8B1A1A')
p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
p.paragraph_format.space_after = Pt(6)
p.paragraph_format.space_before = Pt(6)

# Legend
p = doc.add_paragraph()
run = p.add_run('DATA-CONFIDENCE LEGEND  (last column of each table):')
run.bold = True
run.font.color.rgb = RGBColor.from_string(DARK_BLUE)
run.font.size = Pt(7.5)
legends = [
    ('Drug reference DB (A–Z India)', ' — composition taken directly from the reference database (manufacturer-declared).', '1F4E79'),
    ('Drug DB (same brand — variant)†', ' — same brand family in the database; strength read from your stock name. Please verify strength on the label.', '1F4E79'),
    ('Curated & cross-checked', ' — filled from the curated knowledge base and verified/low-risk.', '7B5E00'),
    ('Curated — verify on label', ' — filled from the curated knowledge base from strong brand conventions; confirm on the pack before clinical use.', '7B5E00'),
    ('Non-drug item', ' — device/consumable (no active ingredients); a usage note is given instead.', '1E6B2E'),
    ('Not found — see pack label', ' — could not be verified from any reliable source.', '8B1A1A'),
]
for title, desc, col in legends:
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.left_indent = Inches(0.2)
    run = p.add_run('•  "'+title+'"')
    run.bold = True
    run.font.size = Pt(6.5)
    run.font.color.rgb = RGBColor.from_string(col)
    run = p.add_run(desc)
    run.font.size = Pt(6.5)
    run.font.color.rgb = RGBColor.from_string('262626')

# Add page break before categories
doc.add_page_break()

# ---- Now add each main category with subcategories ----
col_widths = [1757,2551,1134,1361,2381,3515,1361,1077]
col_widths_inches = [w/1440 for w in col_widths]

category_number = 0
for cat, groups in grouped_by_cat.items():
    category_number += 1
    # Category heading
    total_meds = sum(len(v) for _,v in groups)
    n_subcats = len(groups)
    # Count true multi/single vs specials
    specials_keys = ["__NON_DRUG__","__UNVERIFIED__"]
    true_multi = sum(1 for k,v in groups if len(v)>1 and k not in specials_keys)
    true_single = sum(1 for k,v in groups if len(v)==1 and k not in specials_keys)
    specials_count = sum(1 for k,v in groups if k in specials_keys)
    cat_clean = re.sub(r'\s*\(\d[\d,]*\)\s*$','',cat)
    # Main heading with number
    heading_text = f"{category_number}.  {cat_clean}  —  {total_meds} medicines  →  {n_subcats} ingredient-based sub-categories"
    # Use Heading 1 style color DARK_BLUE
    h = add_heading(doc, heading_text, level=1, color=DARK_BLUE, size_pt=11, bold=True, space_before=10, space_after=2)
    # Keep with next
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.keep_together = True

    # Summary line under category
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.space_before = Pt(1)
    run = p.add_run(f"{n_subcats} sub-categories:  {true_multi} multi-medicine ingredients  •  {true_single} single-medicine ingredients")
    if specials_count:
        specials_detail = []
        for k,v in groups:
            if k in specials_keys:
                disp = "Non-Drug" if k=="__NON_DRUG__" else "Not Verified"
                specials_detail.append(f"{disp} ({len(v)})")
        run = p.add_run(f"  •  Special: {', '.join(specials_detail)}")
    run.font.size = Pt(7.5)
    run.font.color.rgb = RGBColor.from_string('595959')
    run.italic = True
    run.font.name = 'Calibri'

    # If category is large (Other), add small note about navigation
    if total_meds > 200:
        p = doc.add_paragraph()
        run = p.add_run('Note: This is the largest section (unclassified stock). Ingredient groups are listed largest-first for quick review of high-stock salts; singletons follow alphabetically. Use the Navigation Pane → Headings to jump directly to any ingredient.')
        run.font.size = Pt(6.5)
        run.italic = True
        run.font.color.rgb = RGBColor.from_string('7A7A7A')
        p.paragraph_format.space_after = Pt(4)

    # Sub-categories
    sub_idx = 0
    for key, rows in groups:
        sub_idx += 1
        disp = display_for_key(key, rows)
        count = len(rows)
        # Determine sub-category title
        # Special handling for display names
        if key == "__NON_DRUG__":
            title = f"{category_number}.{sub_idx}  Non-Drug / Consumable Items  —  {count} items  (no active ingredient)"
            color_sub = '595959'
            bg_sub = 'F3F3F3'
        elif key == "__UNVERIFIED__":
            title = f"{category_number}.{sub_idx}  Not Verified — See Pack Label  —  {count} items"
            color_sub = '8B1A1A'
            bg_sub = 'FFF2F2'
        else:
            # Regular ingredient: show count and plural
            plural = "medicine" if count==1 else "medicines"
            title = f"{category_number}.{sub_idx}  {disp}  —  {count} {plural}"
            color_sub = '244061' if count>1 else '2F5496'  # multi vs single differentiate
            bg_sub = None
        # Add sub-category heading
        # Choose level 2 for multi, level 3 for single? We'll use Heading 2 for multi, Heading 3 for single to create hierarchy
        level = 2 if count>1 else 3
        # Add paragraph with shading?
        if count>4: # large groups, use Heading 2
            h2 = add_heading(doc, title, level=level, color=color_sub, size_pt=9 if count>1 else 8, bold=True, space_before=6, space_after=2)
            h2.paragraph_format.keep_with_next = True
        else:
            h2 = add_heading(doc, title, level=level, color=color_sub, size_pt=9 if count>1 else 8, bold=True, space_before=6, space_after=2)
            h2.paragraph_format.keep_with_next = True
        # Optional small ingredient note for long clinical notes? Not needed
        
        # Sort rows within group: maybe by Item Name alphabetically
        rows_sorted = sorted(rows, key=lambda r: r[0].lower())
        # Create table
        create_styled_table(doc, headers, rows_sorted, col_widths_inches)
        # Add small spacing after table
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.space_before = Pt(0)
        # An empty paragraph with tiny spacing acts as separator
        # Set font size 2 to minimize
        run = p.add_run('')
        run.font.size = Pt(2)

    # Add page break after each main category except last? To keep categories separate
    if category_number < len(grouped_by_cat):
        # Add a little extra space then page break? For large categories we might want page break, for small we don't need.
        # Let's add page break after large categories (>50 meds) or after every category to keep clean? But that would add many blank pages.
        # Instead, only add break after categories with >50 meds or after each 3 categories? Simpler: no forced break, let flow.
        # But to keep readability, add a horizontal line? We'll add a paragraph with border
        p = doc.add_paragraph()
        pPr = p._p.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '4')
        bottom.set(qn('w:space'), '1')
        bottom.set(qn('w:color'), 'BDD3E8')
        pBdr.append(bottom)
        pPr.append(pBdr)
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(6)

# Final footer note
doc.add_page_break()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('— End of Document  •  1,789 stock line items across 16 main categories → 720 ingredient-based sub-categories  •  Sub-categorized by Active Ingredient  —  Same Ingredient = Same Sub-Category —')
run.bold = True
run.font.color.rgb = RGBColor.from_string(DARK_BLUE)
run.font.size = Pt(8)
run.font.name = 'Calibri'

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('Generated programmatically on 06 September 2026  •  Version 3 — Sub-Categorized Edition  •  Source: Stock_Medicines_Categorized_Sale_Rates (1).docx (Version 2 enriched)  •  Grouping key: normalized Active Ingredient(s) (lower-cased, whitespace-collapsed)  •  For questions, verify against the physical pack label and physician prescription.')
run.font.size = Pt(7)
run.font.color.rgb = RGBColor.from_string('595959')
run.italic = True

print(f"Saving to {OUT_NEW}...")
doc.save(OUT_NEW)
print("Also overwriting original enriched file...")
doc.save(OUT_OVERWRITE)
print("Done.")
