const https = require('https');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  VerticalAlign
} = require('docx');

// ZEFIX API: fetch 100 newest companies in Vaud (canton VD)
function fetchZefix() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      canton: ['VD'],
      maxEntries: 100,
      offset: 0,
      // Sort by registration date descending (newest first)
      searchType: 'ACTIVE'
    });

    const options = {
      hostname: 'www.zefix.ch',
      path: '/ZefixREST/api/v1/firm/search.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse ZEFIX response: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function cell(text, opts = {}) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };

  return new TableCell({
    borders,
    width: { size: opts.width || 2000, type: WidthType.DXA },
    shading: opts.header
      ? { fill: '1F3864', type: ShadingType.CLEAR }
      : { fill: opts.alt ? 'F5F7FA' : 'FFFFFF', type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            font: 'Arial',
            size: opts.header ? 20 : 18,
            bold: !!opts.header,
            color: opts.header ? 'FFFFFF' : '2C2C2C'
          })
        ]
      })
    ]
  });
}

async function buildDoc(companies) {
  const now = new Date().toLocaleDateString('fr-CH');

  // Header row
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('#', { width: 480, header: true }),
      cell('Raison sociale', { width: 2800, header: true }),
      cell('Type', { width: 1600, header: true }),
      cell('Localité', { width: 1600, header: true }),
      cell('UID', { width: 1800, header: true }),
      cell('Téléphone', { width: 1440, header: true }),
      cell('Email', { width: 1440, header: true }),
      cell('Notes', { width: 1800, header: true }),
    ]
  });

  const dataRows = companies.map((c, i) => {
    const alt = i % 2 === 1;
    const name = c.name || '';
    const type = c.legalForm?.nameFr || c.legalForm?.nameDe || '';
    const locality = c.address?.city || '';
    const uid = c.uid || '';

    return new TableRow({
      children: [
        cell(String(i + 1), { width: 480, alt }),
        cell(name, { width: 2800, alt }),
        cell(type, { width: 1600, alt }),
        cell(locality, { width: 1600, alt }),
        cell(uid, { width: 1800, alt }),
        cell('', { width: 1440, alt }),   // Phone — fill manually
        cell('', { width: 1440, alt }),   // Email — fill manually
        cell('', { width: 1800, alt }),   // Notes — fill manually
      ]
    });
  });

  const totalWidth = 480 + 2800 + 1600 + 1600 + 1800 + 1440 + 1440 + 1800; // = 12960

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, font: 'Arial', color: '1F3864' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
        }
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 20160, height: 15840 }, // Landscape A3-ish for wide table
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: `Nouvelles entreprises — Canton de Vaud`, font: 'Arial', size: 36, bold: true, color: '1F3864' })]
        }),
        new Paragraph({
          children: [new TextRun({ text: `Généré le ${now} · ${companies.length} entreprises · Source: ZEFIX`, font: 'Arial', size: 18, color: '888888' })]
        }),
        new Paragraph({ children: [new TextRun('')] }),
        new Table({
          width: { size: totalWidth, type: WidthType.DXA },
          columnWidths: [480, 2800, 1600, 1600, 1800, 1440, 1440, 1800],
          rows: [headerRow, ...dataRows]
        }),
        new Paragraph({ children: [new TextRun('')] }),
        new Paragraph({
          children: [new TextRun({ text: 'Téléphone et Email à compléter manuellement via local.ch ou les registres cantonaux.', font: 'Arial', size: 16, color: '999999', italics: true })]
        })
      ]
    }]
  });

  return doc;
}

async function main() {
  console.log('Fetching companies from ZEFIX...');
  let result;
  try {
    result = await fetchZefix();
  } catch (e) {
    console.error('ZEFIX fetch failed:', e.message);
    process.exit(1);
  }

  const companies = result.list || result.firms || result || [];
  console.log(`Got ${companies.length} companies`);

  if (companies.length === 0) {
    console.error('No companies returned. Raw response keys:', Object.keys(result));
    process.exit(1);
  }

  const doc = await buildDoc(companies);
  const buffer = await Packer.toBuffer(doc);
  const outPath = '/mnt/user-data/outputs/vaud_nouvelles_entreprises.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('Saved to', outPath);
}

main();
