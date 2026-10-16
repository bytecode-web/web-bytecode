import http from 'node:http';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';

const { app } = await import('../app.js');

const server = http.createServer(app);
let baseUrl = '';

before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

const validComplaintForm = () => {
  const form = new FormData();
  form.set('nombres', 'Ada');
  form.set('apellidos', 'Lovelace');
  form.set('domicilio', 'Av. Seguridad 123');
  form.set('tipoDoc', 'DNI');
  form.set('numeroDoc', '12345678');
  form.set('prefijoTelefono', '+51');
  form.set('telefono', '999999999');
  form.set('email', 'ada@example.com');
  form.set('personType', 'natural');
  form.set('goodType', 'servicio');
  form.set('montoCuantificable', '');
  form.set('descripcion', 'Servicio web');
  form.set('nombreUnidad', '');
  form.set('opcionBien', '');
  form.set('claimType', 'queja');
  form.set('tipoReclamo', 'Prueba de seguridad');
  form.set('detalle', 'Detalle suficientemente largo para pasar la validación.');
  form.set('pedido', 'Solicito revisión del caso.');
  form.set('aceptaTerminos', 'true');
  form.set('aceptaPoliticaDatos', 'true');
  return form;
};

test('rejects uploads whose magic bytes do not match an allowed file type', async () => {
  const form = validComplaintForm();
  const htmlPayload = new Blob(['<html><script>alert(1)</script></html>'], { type: 'application/pdf' });
  form.set('archivoAdjunto', htmlPayload, 'evidence.pdf');

  const response = await fetch(`${baseUrl}/api/complaints`, {
    method: 'POST',
    body: form,
  });

  const body = await response.json() as { message: string };
  assert.equal(response.status, 400);
  assert.equal(body.message, 'Archivo no permitido.');
});
