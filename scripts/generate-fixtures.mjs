import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import ExcelJS from 'exceljs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'fixtures');
await mkdir(fixtures, { recursive: true });

const headers = ['Account ID', 'Customer', 'Amount', 'Invoice Date', 'Active', 'Notes'];
const rowsA = [
  [1001, 'Northwind Labs', 120, '2026-08-01', true, 'Paid'],
  [1002, 'Blue Harbor', { formula: '100+25.5', result: 125.5 }, '2026-08-02', true, 'Cached formula'],
  [1003, 'Atlas Retail', 89, '2026-08-03', false, 'Only in A'],
  [1004, 'Orchid Foods', 42, '2026-08-04', true, 'Duplicate first'],
  [1004, 'Orchid Foods', 43, '2026-08-04', true, 'Duplicate second'],
  [null, 'Missing Key Ltd', 11, '2026-08-05', true, 'Missing account'],
  [1005, 'Case Study', 77, '2026-08-06', true, 'Trailing spaces'],
  [1006, 'Formula Safety', 9, '2026-08-07', true, '=2+2'],
];
const rowsB = [
  [1001, 'Northwind Labs', 120, '2026-08-01', true, 'Paid'],
  [1002, 'Blue Harbor', { formula: '100+26', result: 126 }, '2026-08-02', true, 'Cached formula'],
  [1004, 'Orchid Foods', 42, '2026-08-04', true, 'Duplicate first'],
  [1004, 'Orchid Foods', 44, '2026-08-04', true, 'Duplicate second'],
  [null, 'Missing Key GmbH', 12, '2026-08-05', true, 'Missing account'],
  [1005, 'case study', 77, '2026-08-06', true, 'Trailing spaces'],
  [1007, 'New Market', 55, '2026-08-08', true, 'Only in B'],
  [1006, 'Formula Safety', { formula: '3*3' }, '2026-08-07', true, '=2+2'],
];

const csvRowsA = [
  [1001, 'Northwind Labs', '120.00', '2026-08-01', true, 'Paid'],
  [1002, 'Blue Harbor', '125.50', '2026-08-02', true, 'Pending review'],
  [1003, 'Atlas Retail', '89.00', '2026-08-03', false, 'Only in A'],
  [1004, 'Orchid Foods', '42.00', '2026-08-04', true, 'Duplicate first'],
  [1004, 'Orchid Foods', '43.00', '2026-08-04', true, 'Duplicate second'],
  [null, 'Missing Key Ltd', '11.00', '2026-08-05', true, 'Missing account'],
  [1005, 'Case Study', '77.00', '2026-08-06', true, 'Trailing spaces'],
  [1006, 'Formula Safety', '9.00', '2026-08-07', true, '=2+2'],
];
const csvRowsB = [
  [1001, 'Northwind Labs', '120.00', '2026-08-01', true, 'Paid'],
  [1002, 'Blue Harbor', '126.00', '2026-08-02', true, 'Pending review'],
  [1004, 'Orchid Foods', '42.00', '2026-08-04', true, 'Duplicate first'],
  [1004, 'Orchid Foods', '44.00', '2026-08-04', true, 'Duplicate second'],
  [null, 'Missing Key GmbH', '12.00', '2026-08-05', true, 'Missing account'],
  [1005, 'case study', '77.00', '2026-08-06', true, 'Trailing spaces'],
  [1007, 'New Market', '55.00', '2026-08-08', true, 'Only in B'],
  [1006, 'Formula Safety', '9.00', '2026-08-07', true, '=2+2'],
];

function csvText(columns, rows, delimiter = ',') {
  const encode = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return text.includes(delimiter) || /["\r\n]/u.test(text) || /^[=+\-@]/u.test(text)
      ? `"${text.replace(/"/gu, '""')}"`
      : text;
  };
  return `${[columns, ...rows].map((row) => row.map(encode).join(delimiter)).join('\r\n')}\r\n`;
}

async function writeWorkbook(name, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  const archive = workbook.addWorksheet('Archive');
  archive.addRow(['Info']);
  archive.addRow(['This sheet demonstrates worksheet selection.']);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  await workbook.xlsx.writeFile(path.join(fixtures, name));
}

function encodeWindows1251(text) {
  const ukrainian = new Map([
    [0x404, 0xaa],
    [0x454, 0xba],
    [0x406, 0xb2],
    [0x456, 0xb3],
    [0x407, 0xaf],
    [0x457, 0xbf],
    [0x490, 0xa5],
    [0x491, 0xb4],
  ]);
  const bytes = [];
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code <= 0x7f) bytes.push(code);
    else if (code === 0x401) bytes.push(0xa8);
    else if (code === 0x451) bytes.push(0xb8);
    else if (ukrainian.has(code)) bytes.push(ukrainian.get(code));
    else if (code >= 0x410 && code <= 0x44f) bytes.push(code - 0x350);
    else throw new Error(`Fixture encoder cannot encode ${character}`);
  }
  return Uint8Array.from(bytes);
}

await Promise.all([
  writeWorkbook('reconciliation-a.xlsx', rowsA),
  writeWorkbook('reconciliation-b.xlsx', rowsB),
  writeFile(path.join(fixtures, 'reconciliation-a.csv'), csvText(headers, csvRowsA)),
  writeFile(path.join(fixtures, 'reconciliation-b.csv'), csvText(headers, csvRowsB)),
  writeFile(
    path.join(fixtures, 'edge-cases-a.csv'),
    csvText(
      ['Record ID', 'Localized amount', 'Service date', 'Comment', 'A only'],
      [
        [3001, '1.234,56', '03/04/2026', 'Ambiguous date and number', 'Left schema'],
        [3002, '800,00', '04/05/2026', 'Manual mapping example', 'Left schema'],
      ],
      ';',
    ),
  ),
  writeFile(
    path.join(fixtures, 'edge-cases-b.csv'),
    csvText(
      ['Record ID', 'Amount', 'Service date', 'Comment', 'B only'],
      [
        [3001, '1.234,56', '03/04/2026', 'Ambiguous date and number', 'Right schema'],
        [3002, '801,00', '04/05/2026', 'Manual mapping example', 'Right schema'],
      ],
      ';',
    ),
  ),
  writeFile(
    path.join(fixtures, 'windows-1251.csv'),
    encodeWindows1251('Account ID;Customer;Amount\r\n2001;Київ Сервіс;100,50\r\n2002;Одеса Маркет;88,00\r\n'),
  ),
]);

process.stdout.write('Synthetic fixtures generated in fixtures/.\n');
