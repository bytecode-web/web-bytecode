-- Población inicial de las plantillas de correo en la base de datos
-- El layout base seguirá siendo inyectado por el backend (emailTemplates.ts)

INSERT INTO public.notification_templates (id, code, channel, subject, body_template, is_active, created_at, updated_at)
VALUES 
(
  gen_random_uuid(), 
  'contact_receipt', 
  'email', 
  'Hemos recibido tu mensaje - Bytecode', 
  '<h2 style="color: #ffffff; margin-top: 0; text-align: center;">¡Hola <span class="highlight">{{name}} {{lastName}}</span>!</h2>
  <p>Hemos recibido tu mensaje correctamente. Nuestro equipo lo está revisando y nos pondremos en contacto contigo a la brevedad.</p>
  <div style="text-align: center; margin: 30px 0;">
    <p style="font-size: 14px; margin: 0; color: #94a3b8;">Tu código de ticket es:</p>
    <div style="display: inline-block; background-color: rgba(6, 207, 214, 0.1); border: 1px solid #06CFD6; padding: 10px 20px; border-radius: 4px; font-size: 20px; font-weight: bold; color: #06CFD6; letter-spacing: 1px; margin-top: 8px;">
      {{caseCode}}
    </div>
  </div>
  <div class="card">
    <h3 style="color: #ffffff; margin-top: 0; font-size: 16px;">Resumen de tu solicitud</h3>
    <p><strong style="color: #06CFD6;">Servicio de interés:</strong> {{service}}</p>
    <blockquote style="margin: 0; padding-left: 15px; border-left: 4px solid #06CFD6; font-style: italic; color: #cbd5e1;">
      "{{message}}"
    </blockquote>
  </div>
  <p>Gracias por confiar en Bytecode como tu socio tecnológico.</p>', 
  true, 
  NOW(), 
  NOW()
),
(
  gen_random_uuid(),
  'complaint_receipt',
  'email',
  'Constancia de Reclamo {{complaintCode}} - Bytecode',
  '<h2 style="color: #ffffff; margin-top: 0; text-align: center;">Constancia de Reclamo</h2>
  <p>Estimado/a <span class="highlight">{{clientName}}</span>,</p>
  <p>Por medio de la presente, confirmamos la recepción formal de su reclamo o queja en nuestro Libro de Reclamaciones Virtual.</p>
  <div style="text-align: center; margin: 30px 0;">
    <p style="font-size: 14px; margin: 0; color: #94a3b8;">Código de Seguimiento:</p>
    <div style="display: inline-block; background-color: rgba(6, 207, 214, 0.1); border: 1px solid #06CFD6; padding: 10px 20px; border-radius: 4px; font-size: 20px; font-weight: bold; color: #06CFD6; letter-spacing: 1px; margin-top: 8px;">
      {{complaintCode}}
    </div>
  </div>
  <div class="card">
    <h3 style="color: #ffffff; margin-top: 0; font-size: 16px;">Detalle de su Hoja de Reclamación</h3>
    <table>
      {{rowsHtml}}
    </table>
  </div>
  <p>Estaremos procesando su caso conforme a los plazos establecidos por ley. Le notificaremos sobre el avance y la resolución final al correo de contacto registrado.</p>',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (code) DO UPDATE 
SET body_template = EXCLUDED.body_template, updated_at = NOW();
