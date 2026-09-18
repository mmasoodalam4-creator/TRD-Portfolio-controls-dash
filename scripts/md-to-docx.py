#!/usr/bin/env python3
"""
Markdown -> .docx, with nothing but the standard library.

    python3 scripts/md-to-docx.py docs/USER_MANUAL.md dist/USER_MANUAL.docx "Title"

Handles what the manual and the readiness report use: headings, paragraphs,
bullet and numbered lists, tables, fenced code, block quotes, horizontal
rules, and inline bold / italic / code / links. A .docx is a zip of XML
parts; this writes the five parts Word needs and no more. Kept in the repo
so the documents can be regenerated from their Markdown source, which is
the copy that is reviewed and versioned.
"""
import re
import sys
import zipfile
from xml.sax.saxutils import escape

src, out, title = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else '')
lines = open(src, encoding='utf-8').read().split('\n')

NAVY, GOLD, GREY = '0B2545', 'C9A227', 'F2F4F8'


def run(text, bold=False, italic=False, code=False, color=None, size=None):
    props = ''
    if bold:
        props += '<w:b/>'
    if italic:
        props += '<w:i/>'
    if code:
        props += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % GREY
    if color:
        props += '<w:color w:val="%s"/>' % color
    if size:
        props += '<w:sz w:val="%d"/>' % size
    return '<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve">%s</w:t></w:r>' % (props, escape(text))


TOKEN = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))')


def inline(text, base_size=None):
    """Bold, italic, code and links inside one paragraph."""
    parts = []
    for piece in TOKEN.split(text):
        if not piece:
            continue
        if piece.startswith('**'):
            parts.append(run(piece[2:-2], bold=True, size=base_size))
        elif piece.startswith('`'):
            parts.append(run(piece[1:-1], code=True, size=base_size))
        elif piece.startswith('*'):
            parts.append(run(piece[1:-1], italic=True, size=base_size))
        elif piece.startswith('['):
            m = re.match(r'\[([^\]]+)\]\(([^)]+)\)', piece)
            parts.append(run(m.group(1), color='2F6DD0', size=base_size) + run(' (' + m.group(2) + ')', size=16))
        else:
            parts.append(run(piece.replace('\\|', '|'), size=base_size))
    return ''.join(parts)


def para(content, style=None, extra=''):
    ppr = ''
    if style:
        ppr += '<w:pStyle w:val="%s"/>' % style
    ppr += extra
    return '<w:p><w:pPr>%s</w:pPr>%s</w:p>' % (ppr, content)


body = []
i = 0
para_buf = []


def flush():
    global para_buf
    if para_buf:
        body.append(para(inline(' '.join(para_buf))))
        para_buf = []


def cells_of(row):
    return [c.strip() for c in re.split(r'(?<!\\)\|', row.strip().strip('|'))]


while i < len(lines):
    line = lines[i]
    if line.startswith('```'):
        flush()
        code = []
        i += 1
        while i < len(lines) and not lines[i].startswith('```'):
            code.append(lines[i])
            i += 1
        i += 1
        for c in code or ['']:
            body.append(para(run(c, code=True, size=18), extra='<w:shd w:val="clear" w:color="auto" w:fill="%s"/><w:spacing w:after="0"/>' % GREY))
        body.append(para(''))
        continue
    h = re.match(r'^(#{1,6})\s+(.*)$', line)
    if h:
        flush()
        level = len(h.group(1))
        body.append(para(inline(h.group(2)), style='Heading%d' % level))
        i += 1
        continue
    if re.match(r'^---+\s*$', line):
        flush()
        body.append(para('', extra='<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="%s"/></w:pBdr>' % GOLD))
        i += 1
        continue
    if line.startswith('|'):
        flush()
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            if not re.match(r'^\|(\s*:?-+:?\s*\|)+\s*$', lines[i]):
                rows.append(cells_of(lines[i]))
            i += 1
        width = max(len(r) for r in rows)
        tbl = ['<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>'
               '<w:tblBorders>' + ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>' % b for b in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')) + '</w:tblBorders>'
               '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>']
        for r_i, r in enumerate(rows):
            tbl.append('<w:tr>')
            for c in r + [''] * (width - len(r)):
                shade = '<w:shd w:val="clear" w:color="auto" w:fill="E8EDF5"/>' if r_i == 0 else ''
                content = inline(c, base_size=19)
                if r_i == 0:
                    content = run(re.sub(r'[*`]', '', c), bold=True, size=19)
                tbl.append('<w:tc><w:tcPr>%s</w:tcPr>%s</w:tc>' % (shade, para(content, extra='<w:spacing w:before="40" w:after="40"/>')))
            tbl.append('</w:tr>')
        tbl.append('</w:tbl>')
        body.append(''.join(tbl))
        body.append(para(''))
        continue
    if re.match(r'^\s*([-*]|\d+\.)\s+', line):
        flush()
        ordered = bool(re.match(r'^\s*\d+\.', line))
        items = []
        while i < len(lines) and (re.match(r'^\s*([-*]|\d+\.)\s+', lines[i]) or re.match(r'^\s{2,}\S', lines[i])):
            if re.match(r'^\s*([-*]|\d+\.)\s+', lines[i]):
                items.append(re.sub(r'^\s*([-*]|\d+\.)\s+', '', lines[i]))
            else:
                items[-1] += ' ' + lines[i].strip()
            i += 1
        for n, it in enumerate(items, 1):
            marker = ('%d.  ' % n) if ordered else '•  '
            body.append(para(run(marker) + inline(it), extra='<w:ind w:left="480" w:hanging="300"/><w:spacing w:after="60"/>'))
        body.append(para(''))
        continue
    if re.match(r'^>\s?', line):
        flush()
        q = []
        while i < len(lines) and re.match(r'^>\s?', lines[i]):
            q.append(re.sub(r'^>\s?', '', lines[i]))
            i += 1
        body.append(para(inline(' '.join(q)), extra='<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="%s"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="FBF7EA"/><w:ind w:left="240"/>' % GOLD))
        continue
    if not line.strip():
        flush()
        i += 1
        continue
    para_buf.append(line.strip())
    i += 1
flush()

document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body>%s<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1100" w:bottom="1200" w:left="1100" w:header="600" w:footer="600"/></w:sectPr></w:body></w:document>'
            % ''.join(body))


def heading_style(name, size, color, before):
    return ('<w:style w:type="paragraph" w:styleId="%s"><w:name w:val="%s"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'
            '<w:pPr><w:keepNext/><w:spacing w:before="%d" w:after="120"/></w:pPr>'
            '<w:rPr><w:b/><w:color w:val="%s"/><w:sz w:val="%d"/></w:rPr></w:style>' % (name, name.replace('Heading', 'heading '), before, color, size))


styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
          '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>'
          '<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
          + heading_style('Heading1', 40, NAVY, 240) + heading_style('Heading2', 30, NAVY, 360) + heading_style('Heading3', 25, '13315C', 240)
          + heading_style('Heading4', 22, '13315C', 200)
          + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>'
          '</w:styles>')

content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="xml" ContentType="application/xml"/>'
                 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                 '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                 '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
                 '</Types>')
rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '</Relationships>')
doc_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '</Relationships>')
core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
        '<dc:title>%s</dc:title><dc:creator>Tazayud Owner PMO</dc:creator></cp:coreProperties>' % escape(title))

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', content_types)
    z.writestr('_rels/.rels', rels)
    z.writestr('word/document.xml', document)
    z.writestr('word/styles.xml', styles)
    z.writestr('word/_rels/document.xml.rels', doc_rels)
    z.writestr('docProps/core.xml', core)
print('wrote', out)
