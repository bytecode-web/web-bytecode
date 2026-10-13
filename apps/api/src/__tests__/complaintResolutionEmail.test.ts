import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComplaintResolution,
  buildComplaintResolutionStaffNotification,
} from '../services/emailTemplates.js';

test('buildComplaintResolution formats correctly for Natural Person (B2C)', () => {
  const html = buildComplaintResolution({
    isCompany: false,
    clientName: 'Juan Pérez',
    complaintCode: 'REC-2026-BC-00001',
    resolutionType: 'Fundado (Procede)',
    resolutionBody: 'Se ha verificado el caso y se procede con el reembolso.',
    adminName: 'Soporte Bytecode',
    adminRole: 'Representante Legal',
  });

  assert.ok(html.includes('Estimado/a <span class="highlight">Juan Pérez</span>,'));
  assert.ok(html.includes('REC-2026-BC-00001'));
  assert.ok(html.includes('Fundado (Procede)'));
  assert.ok(html.includes('Se ha verificado el caso y se procede con el reembolso.'));
  assert.ok(html.includes('Agradecemos su retroalimentación'));
  // Should NOT contain company phrasing
  assert.ok(!html.includes('Estimados señores de'));
});

test('buildComplaintResolution formats correctly for Company (B2B) with Representative', () => {
  const html = buildComplaintResolution({
    isCompany: true,
    companyName: 'Acme Corp S.A.C.',
    representativeName: 'Carlos López',
    complaintCode: 'REC-2026-BC-00002',
    resolutionType: 'Infundado (No Procede)',
    resolutionBody: 'El servicio fue prestado conforme a los términos y condiciones acordados.',
    adminName: 'Admin Principal',
    attachedFileNames: ['informe_tecnico.pdf', 'comprobante.png'],
  });

  assert.ok(html.includes('Estimados señores de <span class="highlight">Acme Corp S.A.C.</span>,'));
  assert.ok(html.includes('Atención: <strong>Carlos López</strong>'));
  assert.ok(html.includes('Infundado (No Procede)'));
  assert.ok(html.includes('informe_tecnico.pdf'));
  assert.ok(html.includes('comprobante.png'));
  // Should NOT contain natural person greeting
  assert.ok(!html.includes('Estimado/a <span class="highlight">Acme Corp'));
});

test('buildComplaintResolution supports backwards-compatible positional parameters', () => {
  const html = buildComplaintResolution(
    'María García',
    'REC-2026-BC-00003',
    'Fundado (Procede)',
    'Resolución retrocompatible aprobada.',
    'Soporte Técnico'
  );

  assert.ok(html.includes('Estimado/a <span class="highlight">María García</span>,'));
  assert.ok(html.includes('REC-2026-BC-00003'));
  assert.ok(html.includes('Resolución retrocompatible aprobada.'));
});

test('buildComplaintResolutionStaffNotification generates detailed internal alert for staff', () => {
  const html = buildComplaintResolutionStaffNotification({
    complaintCode: 'REC-2026-BC-00004',
    claimType: 'Reclamo',
    isCompany: true,
    clientOrCompanyName: 'TechSolutions EIRL',
    representativeName: 'Ana Morales',
    docType: 'RUC',
    docNumber: '20601234567',
    resolutionType: 'Fundado (Procede)',
    resolutionBody: 'Se otorgó crédito a favor del cliente.',
    adminName: 'Legal Officer',
    adminEmail: 'legal@bytecode.com.pe',
    adminRole: 'Asesor Legal',
    attachedFileNames: ['resolucion_firmada.pdf'],
  });

  assert.ok(html.includes('Aviso Interno') && html.includes('Asesoría Legal'));
  assert.ok(html.includes('REC-2026-BC-00004'));
  assert.ok(html.includes('TechSolutions EIRL'));
  assert.ok(html.includes('Ana Morales'));
  assert.ok(html.includes('RUC: 20601234567'));
  assert.ok(html.includes('resolucion_firmada.pdf'));
  assert.ok(html.includes('legal@bytecode.com.pe'));
});

test('buildComplaintResolution with deduplicated attached files displays unique list', () => {
  const attachedFileNames = ['evidencia1.png', 'evidencia2.png'];
  const html = buildComplaintResolution({
    isCompany: false,
    clientName: 'Pedro Gómez',
    complaintCode: 'REC-2026-BC-00005',
    resolutionType: 'Fundado (Procede)',
    resolutionBody: 'Resolución con archivos únicos.',
    adminName: 'Soporte',
    attachedFileNames,
  });

  assert.ok(html.includes('evidencia1.png'));
  assert.ok(html.includes('evidencia2.png'));
});
