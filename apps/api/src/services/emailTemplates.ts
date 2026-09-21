export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// Función auxiliar para capitalizar la primera letra para el renderizado visual
export const capitalize = (str: string) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export function masterLayout(contentHTML: string): string {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <style>
      @font-face { font-family: 'Sansation'; src: url('https://www.bytecode.com.pe/fonts/Sansation-Regular.woff2') format('woff2'); font-weight: normal; font-style: normal; }
      body { margin: 0; padding: 0; background-color: #040e1f; color: #ffffff; font-family: 'Sansation', Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased; box-sizing: border-box; }
      *, *:before, *:after { box-sizing: inherit; }
      .container { max-width: 600px; margin: 0 auto; background-color: #040e1f; box-sizing: border-box; }
      .header { text-align: center; padding: 30px 20px; background-color: #010b10; border-bottom: 2px solid #06CFD6; }
      .content { padding: 40px 20px; color: #e2e8f0; line-height: 1.6; }
      .footer { text-align: center; padding: 30px 20px; background-color: #010b10; font-size: 12px; color: #94a3b8; }
      .footer a { color: #06CFD6; text-decoration: none; margin: 0 10px; }
      .button { display: inline-block; padding: 14px 28px; background-color: #06CFD6; color: #010b10; text-decoration: none; font-weight: bold; border-radius: 4px; margin-top: 20px; }
      .card { background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin: 20px 0; box-sizing: border-box; }
      .card table { font-family: 'Sansation', Arial, Helvetica, sans-serif; width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; table-layout: fixed; word-wrap: break-word; }
      .highlight { color: #06CFD6; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://www.bytecode.com.pe/vectors/designs/logo_en_blanco.svg" alt="Bytecode Logo" width="130" style="display: block; margin: 0 auto; max-width: 100%;">
      </div>
      <div class="content">
        ${contentHTML}
      </div>
      <div class="footer">
        <p>
          <a href="https://www.bytecode.com.pe/condiciones">Términos y Condiciones</a> | 
          <a href="https://www.bytecode.com.pe/privacidad">Política de Privacidad</a>
        </p>
        <p>&copy; ${new Date().getFullYear()} Bytecode. Todos los derechos reservados.</p>
      </div>
    </div>
  </body>
  </html>
  `;
}

export function buildAdminNotification(subject: string, payload: Record<string, unknown>): string {
  const longFields = ['Mensaje', 'Detalle del Incidente', 'Pedido del Cliente'];
  const extractedLongFields: { title: string; content: string }[] = [];
  const tableRows: string[] = [];

  Object.entries(payload).forEach(([key, value]) => {
    if (longFields.includes(key) && value) {
      extractedLongFields.push({ title: key, content: String(value) });
    } else {
      tableRows.push(`<tr><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);"><strong style="color: #06CFD6;">${escapeHtml(capitalize(key))}</strong></td><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">${escapeHtml(value)}</td></tr>`);
    }
  });

  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">${escapeHtml(subject)}</h2>
    <div class="card">
      <table>
        ${tableRows.join('')}
      </table>
      
      ${extractedLongFields.map(field => `
      <div style="margin-top: 20px;">
        <p style="font-size: 14px; margin-bottom: 16px;"><strong style="color: #06CFD6;">${escapeHtml(field.title)}:</strong></p>
        <blockquote style="margin: 0; padding-left: 15px; border-left: 4px solid #06CFD6; font-style: italic; color: #cbd5e1; font-size: 14px;">
          "${escapeHtml(field.content)}"
        </blockquote>
      </div>
      `).join('')}
    </div>
    <div style="text-align: center;">
      <a href="https://www.bytecode.com.pe/admin" class="button">Ir al Panel Admin</a>
    </div>
  `;
  return masterLayout(content);
}

export function buildContactReceipt(name: string, lastName: string, caseCode: string, service: string, message: string): string {
  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">¡Hola <span class="highlight">${escapeHtml(name)} ${escapeHtml(lastName)}</span>!</h2>
    <p>Hemos recibido tu mensaje correctamente. Nuestro equipo lo está revisando y nos pondremos en contacto contigo a la brevedad.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <p style="font-size: 14px; margin: 0; color: #94a3b8;">Tu código de ticket es:</p>
      <div style="display: inline-block; background-color: rgba(6, 207, 214, 0.1); border: 1px solid #06CFD6; padding: 10px 20px; border-radius: 4px; font-size: 20px; font-weight: bold; color: #06CFD6; letter-spacing: 1px; margin-top: 8px;">
        ${escapeHtml(caseCode)}
      </div>
    </div>

    <div class="card">
      <h3 style="color: #ffffff; margin-top: 0; font-size: 16px;">Resumen de tu solicitud</h3>
      <p><strong style="color: #06CFD6;">Servicio de interés:</strong> ${escapeHtml(capitalize(service))}</p>
      <blockquote style="margin: 0; padding-left: 15px; border-left: 4px solid #06CFD6; font-style: italic; color: #cbd5e1;">
        "${escapeHtml(message)}"
      </blockquote>
    </div>
    <p>Gracias por confiar en Bytecode como tu socio tecnológico.</p>
  `;
  return masterLayout(content);
}

export function buildComplaintReceipt(complaintCode: string, payload: Record<string, string>): string {
  const clientName = payload['Cliente'] || payload['cliente'] || 'Cliente';
  
  const rows = Object.entries(payload)
    .filter(([key]) => key.toLowerCase() !== 'cliente' && key.toLowerCase() !== 'detalle del incidente' && key.toLowerCase() !== 'pedido del cliente')
    .map(([key, value]) => `<tr><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);"><strong style="color: #06CFD6;">${escapeHtml(capitalize(key))}</strong></td><td style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">${escapeHtml(value)}</td></tr>`)
    .join('');

  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">Constancia de Reclamo</h2>
    <p>Estimado/a <span class="highlight">${escapeHtml(clientName)}</span>,</p>
    <p>Por medio de la presente, confirmamos la recepción formal de su reclamo o queja en nuestro Libro de Reclamaciones Virtual.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <p style="font-size: 14px; margin: 0; color: #94a3b8;">Código de Seguimiento:</p>
      <div style="display: inline-block; background-color: rgba(6, 207, 214, 0.1); border: 1px solid #06CFD6; padding: 10px 20px; border-radius: 4px; font-size: 20px; font-weight: bold; color: #06CFD6; letter-spacing: 1px; margin-top: 8px;">
        ${escapeHtml(complaintCode)}
      </div>
    </div>

    <div class="card">
      <h3 style="color: #ffffff; margin-top: 0; font-size: 16px;">Detalle de su Hoja de Reclamación</h3>
      <table>
        ${rows}
      </table>
      
      ${payload['Detalle del Incidente'] ? `
      <div style="margin-top: 20px;">
        <p style="font-size: 14px; margin-bottom: 16px;"><strong style="color: #06CFD6;">Detalle del Incidente:</strong></p>
        <blockquote style="margin: 0 0 20px 0; padding-left: 15px; border-left: 4px solid #06CFD6; font-style: italic; color: #cbd5e1; font-size: 14px;">
          "${escapeHtml(payload['Detalle del Incidente'])}"
        </blockquote>
      </div>` : ''}

      ${payload['Pedido del Cliente'] ? `
      <div style="margin-top: 20px;">
        <p style="font-size: 14px; margin-bottom: 16px;"><strong style="color: #06CFD6;">Pedido del Cliente:</strong></p>
        <blockquote style="margin: 0; padding-left: 15px; border-left: 4px solid #06CFD6; font-style: italic; color: #cbd5e1; font-size: 14px;">
          "${escapeHtml(payload['Pedido del Cliente'])}"
        </blockquote>
      </div>` : ''}
    </div>

    <div class="card">
      <p style="margin: 0; font-size: 14px; color: #cbd5e1;">Según lo establecido por la normativa vigente, estaremos brindándole una respuesta en el plazo de ley estipulado. Adjuntamos a este correo los detalles remitidos para su control y seguimiento.</p>
    </div>
    <p>Atentamente,<br><strong>El Equipo de Atención al Cliente - Bytecode</strong></p>
  `;
  return masterLayout(content);
}

export function buildAdminVerification(name: string, verifyUrl: string): string {
  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">Verificación de Cuenta Administrativa</h2>
    <p>¡Hola <span class="highlight">${escapeHtml(name)}</span>!</p>
    <p>Se ha creado una cuenta administrativa para ti en el panel de Bytecode. Para activar tu cuenta de forma segura y establecer tu contraseña, por favor haz clic en el siguiente botón:</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(verifyUrl)}" class="button">Verificar mi cuenta</a>
    </div>

    <div class="card">
      <h3 style="color: #ffffff; margin-top: 0; font-size: 14px;">¿Problemas con el botón?</h3>
      <p style="font-size: 13px; color: #94a3b8; word-break: break-all;">Copia y pega este enlace en tu navegador:<br><br>
        <span style="color: #06CFD6;">${escapeHtml(verifyUrl)}</span>
      </p>
    </div>

    <p style="font-size: 12px; color: #64748b; text-align: center;">Si no has solicitado esta cuenta o crees que es un error, puedes ignorar este mensaje.</p>
  `;
  return masterLayout(content);
}

export function buildNewDeviceAlert(name: string, os: string, browser: string, ip: string, time: string, profileUrl: string): string {
  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">Alerta de Seguridad</h2>
    <p>¡Hola <span class="highlight">${escapeHtml(name)}</span>!</p>
    <p>Hemos detectado un nuevo inicio de sesión en tu cuenta de Bytecode desde un dispositivo o ubicación no reconocida recientemente.</p>

    <div class="card">
      <table width="100%">
        <tr><td style="color: #94a3b8; padding: 4px 0; width: 100px;">Sistema:</td><td style="color: #ffffff;">${escapeHtml(os)}</td></tr>
        <tr><td style="color: #94a3b8; padding: 4px 0;">Navegador:</td><td style="color: #ffffff;">${escapeHtml(browser)}</td></tr>
        <tr><td style="color: #94a3b8; padding: 4px 0;">Dirección IP:</td><td style="color: #ffffff;">${escapeHtml(ip)}</td></tr>
        <tr><td style="color: #94a3b8; padding: 4px 0;">Hora (UTC):</td><td style="color: #ffffff;">${escapeHtml(time)}</td></tr>
      </table>
    </div>

    <p>Si fuiste tú, puedes ignorar este correo de manera segura. El dispositivo quedará registrado como confiable para futuras sesiones.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(profileUrl)}" class="button" style="background-color: #ef4444; color: #ffffff;">Revisar mis dispositivos</a>
    </div>

    <p style="font-size: 12px; color: #64748b; text-align: center;">Si no fuiste tú, por favor revoca el acceso del dispositivo y cambia tu contraseña inmediatamente.</p>
  `;
  return masterLayout(content);
}

export function buildOtpEmail(name: string, otpCode: string): string {
  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">Código de Verificación</h2>
    <p>¡Hola <span class="highlight">${escapeHtml(name)}</span>!</p>
    <p>Para completar tu inicio de sesión en Bytecode, por favor ingresa el siguiente código de 6 dígitos. Este código expirará en 10 minutos.</p>

    <div style="text-align: center; margin: 40px 0;">
      <div style="display: inline-block; background-color: rgba(6, 207, 214, 0.1); border: 2px dashed #06CFD6; padding: 15px 30px; border-radius: 8px; font-size: 32px; font-weight: bold; color: #06CFD6; letter-spacing: 8px;">
        ${escapeHtml(otpCode)}
      </div>
    </div>

    <p style="font-size: 12px; color: #64748b; text-align: center;">Si no intentaste iniciar sesión, cambia tu contraseña de inmediato, ya que alguien conoce tus credenciales.</p>
  `;
  return masterLayout(content);
}