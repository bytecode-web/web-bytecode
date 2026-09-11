import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const quotesRoutePath = path.resolve(dirname, '../routes/admin/quotes.ts');
const casesRoutePath = path.resolve(dirname, '../routes/admin/cases.ts');

test('admin detail queries do not expose internal attachment paths through SELECT *', async () => {
  const source = await readFile(casesRoutePath, 'utf8');

  assert.doesNotMatch(source, /SELECT\s+\*\s+FROM\s+contact_submissions/i);
  assert.doesNotMatch(source, /SELECT\s+\*\s+FROM\s+complaints/i);
  assert.match(source, /const complaintColumns =/);
  assert.doesNotMatch(source.match(/const complaintColumns = `([\s\S]*?)`;/)?.[1] ?? '', /attachment_path/);
});

test('quote queries use the enterprise schema column names', async () => {
  const source = await readFile(quotesRoutePath, 'utf8');

  assert.match(source, /END AS unit_price/);
  assert.match(source, /pricing_catalog_id/);
  assert.match(source, /JOIN status_catalog sc ON q\.status_id = sc\.id/);
  assert.match(source, /sc\.code AS status/);
  assert.match(source, /sc\.name AS status_name/);
  assert.doesNotMatch(source, /INSERT INTO quote_items \(quote_id, catalog_item_id/);
  assert.doesNotMatch(source, /INSERT INTO quotes \(quote_code, customer_id, total_amount, status_id, notes/);
});


test('contact admin queries return separated company fields', async () => {
  const source = await readFile(casesRoutePath, 'utf8');
  const contactColumns = source.match(/const contactColumns = `([\s\S]*?)`;/)?.[1] ?? '';

  assert.doesNotMatch(contactColumns, /'' as cargo/);
  assert.doesNotMatch(contactColumns, /'' as empresa/);
  assert.doesNotMatch(contactColumns, /'' as ruc/);
  assert.match(contactColumns, /co\.position_title/);
  assert.match(contactColumns, /o\.legal_name/);
  assert.match(contactColumns, /organization_documents/);
  assert.match(source, /LEFT JOIN organizations o ON c\.organization_id = o\.id/);
  assert.match(source, /LEFT JOIN customer_organizations co ON co\.customer_id = c\.customer_id/);
});
