import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './lib.mjs';

const require = createRequire(join(root, 'packages/tools/package.json'));
const { ZipFile } = require('yazl');
const { fromBuffer } = require('yauzl');
const ExcelJS = createRequire(join(root, 'packages/workflows/package.json'))('exceljs');
const xml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
export const securityMarkers = Object.freeze({
  macroBlocked: 'TK_MACRO_BLOCKED',
  macroExecuted: 'TK_MACRO_EXECUTED',
  linkCached: 'TK_LINK_CACHED',
  linkUpdated: 'TK_LINK_UPDATED',
});

async function zip(entries) {
  const archive = new ZipFile();
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    archive.outputStream.on('data', (chunk) => chunks.push(chunk));
    archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.outputStream.on('error', reject);
  });
  for (const [name, content] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    archive.addBuffer(Buffer.from(content), name, { compress: name !== 'mimetype' });
  }
  archive.end();
  return result;
}

async function unzip(bytes) {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      const entries = {};
      archive.on('error', reject);
      archive.on('end', () => resolve(entries));
      archive.on('entry', (entry) => {
        archive.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on('error', reject);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries[entry.fileName] = Buffer.concat(chunks);
            archive.readEntry();
          });
        });
      });
      archive.readEntry();
    });
  });
}

/** Entirely synthetic. The macro only changes A1 and writes a marker inside its Job workspace. */
export async function officeSecurityFixtures(directory) {
  const macroCode = `Sub OnLoad
ThisComponent.Sheets.getByIndex(0).getCellRangeByName("A1").String = "${securityMarkers.macroExecuted}"
Dim handle As Integer
handle = FreeFile
Open Environ("USERPROFILE") & "\\macro-ran.txt" For Output As #handle
Print #handle, "${securityMarkers.macroExecuted}"
Close #handle
End Sub`;
  const basicNamespace = 'http://openoffice.org/2000/library';
  const entries = {
    mimetype: 'application/vnd.oasis.opendocument.spreadsheet',
    'content.xml':
      declaration +
      `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:script="urn:oasis:names:tc:opendocument:xmlns:script:1.0" xmlns:ooo="http://openoffice.org/2004/office" xmlns:dom="http://www.w3.org/2001/xml-events" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3"><office:scripts><office:event-listeners><script:event-listener script:language="ooo:script" script:event-name="dom:load" xlink:href="vnd.sun.star.script:Standard.Module1.OnLoad?language=Basic&amp;location=document" xlink:type="simple"/></office:event-listeners></office:scripts><office:body><office:spreadsheet><table:table table:name="Sheet1"><table:table-row><table:table-cell office:value-type="string"><text:p>${securityMarkers.macroBlocked}</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`,
    'Basic/script-lc.xml':
      declaration +
      `<library:libraries xmlns:library="${basicNamespace}" xmlns:xlink="http://www.w3.org/1999/xlink"><library:library library:name="Standard" xlink:href="Standard/script-lb.xml" xlink:type="simple" library:link="false"/></library:libraries>`,
    'Basic/Standard/script-lb.xml':
      declaration +
      `<library:library xmlns:library="${basicNamespace}" library:name="Standard" library:readonly="false" library:passwordprotected="false"><library:element library:name="Module1"/></library:library>`,
    'Basic/Standard/Module1.xml':
      declaration +
      `<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">${xml(macroCode)}</script:module>`,
  };
  entries['META-INF/manifest.xml'] =
    declaration +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>${Object.keys(
      entries,
    )
      .filter((name) => name !== 'mimetype')
      .map(
        (name) =>
          `<manifest:file-entry manifest:full-path="${name}" manifest:media-type="text/xml"/>`,
      )
      .join('')}</manifest:manifest>`;
  // Exercise content detection with a permitted extension, rather than relying on .xlsm rejection.
  await writeFile(join(directory, 'macro-content.xlsx'), await zip(entries));

  const target = new ExcelJS.Workbook();
  const targetSheet = target.addWorksheet('Sheet1');
  targetSheet.getCell('A1').value = securityMarkers.linkUpdated;
  await target.xlsx.writeFile(join(directory, 'external-source.xlsx'));

  const linked = new ExcelJS.Workbook();
  const linkedSheet = linked.addWorksheet('Linked');
  linkedSheet.getColumn(1).width = 40;
  linkedSheet.getCell('A1').value = { formula: '[1]Sheet1!A1', result: securityMarkers.linkCached };
  const linkedEntries = await unzip(Buffer.from(await linked.xlsx.writeBuffer()));
  linkedEntries['xl/workbook.xml'] = linkedEntries['xl/workbook.xml']
    .toString()
    .replace(
      '</workbook>',
      '<externalReferences><externalReference r:id="tkExternal"/></externalReferences></workbook>',
    );
  linkedEntries['xl/_rels/workbook.xml.rels'] = linkedEntries['xl/_rels/workbook.xml.rels']
    .toString()
    .replace(
      '</Relationships>',
      '<Relationship Id="tkExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="externalLinks/externalLink1.xml"/></Relationships>',
    );
  linkedEntries['[Content_Types].xml'] = linkedEntries['[Content_Types].xml']
    .toString()
    .replace(
      '</Types>',
      '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/></Types>',
    );
  linkedEntries['xl/externalLinks/externalLink1.xml'] =
    declaration +
    `<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><externalBook r:id="rId1"><sheetNames><sheetName val="Sheet1"/></sheetNames><sheetDataSet><sheetData sheetId="0"><row r="1"><cell r="A1" t="str"><v>${securityMarkers.linkCached}</v></cell></row></sheetData></sheetDataSet></externalBook></externalLink>`;
  linkedEntries['xl/externalLinks/_rels/externalLink1.xml.rels'] =
    declaration +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath" Target="${xml(pathToFileURL(join(directory, 'external-source.xlsx')).href)}" TargetMode="External"/></Relationships>`;
  await writeFile(join(directory, 'external-link.xlsx'), await zip(linkedEntries));
}
