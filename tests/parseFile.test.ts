import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseFile } from '../src/adapters/parseFile';

function fileFromBytes(name: string, bytes: Uint8Array): File {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return {
    arrayBuffer: async () => arrayBuffer,
    name,
    size: bytes.byteLength,
  } as File;
}

describe('source parsing', () => {
  it('detects Windows-1251 and a semicolon delimiter', async () => {
    const bytes = await readFile(path.resolve('fixtures/windows-1251.csv'));
    const source = await parseFile(fileFromBytes('windows-1251.csv', bytes));

    expect(source.meta.detectedEncoding).toBe('windows-1251');
    expect(source.meta.detectedDelimiter).toBe(';');
    expect(source.rows[0]?.values['1:Customer']).toBe('Київ Сервіс');
    expect(source.rows[0]?.rowNumber).toBe(2);
  });

  it('preserves original CSV row numbers across blank lines', async () => {
    const bytes = new TextEncoder().encode('ID,Value\n1,First\n\n3,Third\n');
    const source = await parseFile(fileFromBytes('blank-lines.csv', bytes));

    expect(source.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
  });

  it('reads one XLSX worksheet and warns when a formula has no cached value', async () => {
    const bytes = await readFile(path.resolve('fixtures/reconciliation-b.xlsx'));
    const source = await parseFile(fileFromBytes('reconciliation-b.xlsx', bytes));

    expect(source.meta.sheetNames).toEqual(['Data', 'Archive']);
    expect(source.meta.selectedSheet).toBe('Data');
    expect(source.meta.formulaWarningCount).toBe(1);
    expect(source.warnings[0]).toContain('had no cached result');
  });

  it('rejects an oversized file before reading its contents', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const file = {
      arrayBuffer,
      name: 'too-large.csv',
      size: 50 * 1024 * 1024 + 1,
    } as unknown as File;

    await expect(parseFile(file)).rejects.toThrow('exceeds the 50 MB file limit');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
