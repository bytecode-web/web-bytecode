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

export const getInitials = (name: string): string => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'BC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function masterLayout(contentHTML: string): string {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <style>
      @font-face { font-family: 'Sansation'; src: url('https://www.bytecode.com.pe/fonts/Sansation-Regular.woff2') format('woff2'); font-weight: normal; font-style: normal; }
      body { margin: 0; padding: 0; background-color: #040e1f; color: #ffffff; font-family: 'Sansation', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; box-sizing: border-box; }
      *, *:before, *:after { box-sizing: inherit; }
      .container { max-width: 600px; margin: 0 auto; background-color: #040e1f; box-sizing: border-box; }
      .header { text-align: center; padding: 30px 20px; background-color: #010b10; border-bottom: 2px solid #06CFD6; }
      .content { padding: 40px 20px; color: #e2e8f0; line-height: 1.6; }
      .footer { text-align: center; padding: 30px 20px; background-color: #010b10; font-size: 12px; color: #94a3b8; }
      .footer a { color: #06CFD6; text-decoration: none; margin: 0 10px; }
      .button { display: inline-block; padding: 14px 28px; background-color: #06CFD6; color: #010b10; text-decoration: none; font-weight: bold; border-radius: 4px; margin-top: 20px; }
      .card { background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin: 20px 0; box-sizing: border-box; }
      .card table { font-family: 'Sansation', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; table-layout: fixed; word-wrap: break-word; }
      .highlight { color: #06CFD6; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://www.bytecode.com.pe/vectors/designs/logo_en_blanco.png" alt="Bytecode Logo" width="130" style="display: block; margin: 0 auto; max-width: 100%; height: auto;">
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
      <p><strong style="color: #06CFD6;">Servicio de interés:</strong> ${escapeHtml(service)}</p>
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
      <p style="margin: 0; font-size: 14px; color: #cbd5e1;">Según lo establecido por la normativa vigente (Ley N° 29571 / D.S. N° 011-2011-PCM), estaremos brindándole una respuesta formal en un plazo no mayor a quince (15) días hábiles, contabilizados conforme al calendario oficial y hora legal de la República del Perú (UTC-5). Adjuntamos a este correo los detalles remitidos para su control y seguimiento.</p>
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
        <tr><td style="color: #94a3b8; padding: 4px 0;">Hora Local:</td><td style="color: #ffffff;">${escapeHtml(time)}</td></tr>
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

export function buildSimpleEmail(name: string, title: string, message: string): string {
  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">${escapeHtml(title)}</h2>
    <p>¡Hola <span class="highlight">${escapeHtml(name)}</span>!</p>
    <p>${escapeHtml(message)}</p>
  `;
  return masterLayout(content);
}

export interface ComplaintResolutionOptions {
  clientName?: string;
  isCompany?: boolean;
  companyName?: string;
  representativeName?: string;
  complaintCode: string;
  resolutionType: string;
  resolutionBody: string;
  adminName: string;
  adminRole?: string;
  attachedFileNames?: string[];
}

export function buildComplaintResolution(
  clientOrOptions: string | ComplaintResolutionOptions, 
  complaintCodeParam?: string, 
  resolutionTypeParam?: string, 
  resolutionBodyParam?: string,
  adminNameParam?: string,
  adminRoleParam: string = "Equipo de Soporte - Bytecode",
  attachedFileNamesParam: string[] = []
): string {
  const opts: ComplaintResolutionOptions = typeof clientOrOptions === 'object'
    ? clientOrOptions
    : {
        clientName: clientOrOptions,
        complaintCode: complaintCodeParam ?? '',
        resolutionType: resolutionTypeParam ?? '',
        resolutionBody: resolutionBodyParam ?? '',
        adminName: adminNameParam ?? '',
        adminRole: adminRoleParam,
        attachedFileNames: attachedFileNamesParam,
      };

  const isCompany = Boolean(opts.isCompany);
  const companyName = opts.companyName || opts.clientName || 'Empresa';
  const representativeName = opts.representativeName || '';
  const clientName = opts.clientName || 'Cliente';
  const complaintCode = opts.complaintCode;
  const resolutionType = opts.resolutionType;
  const resolutionBody = opts.resolutionBody;
  const adminName = opts.adminName;
  const adminRole = opts.adminRole || 'Equipo de Soporte - Bytecode';
  const attachedFileNames = opts.attachedFileNames || [];

  const greetingHtml = isCompany
    ? `
      <p style="font-size: 15px; margin-bottom: 4px;">Estimados señores de <span class="highlight">${escapeHtml(companyName)}</span>,</p>
      ${representativeName ? `<p style="font-size: 13px; color: #94a3b8; margin-top: 0; margin-bottom: 14px;">Atención: <strong>${escapeHtml(representativeName)}</strong></p>` : '<div style="margin-bottom: 12px;"></div>'}
      <p style="margin-top: 0;">Nos comunicamos con ustedes respecto a la hoja de reclamación registrada por su representada en nuestro Libro de Reclamaciones Virtual.</p>
    `
    : `
      <p style="font-size: 15px; margin-bottom: 14px;">Estimado/a <span class="highlight">${escapeHtml(clientName)}</span>,</p>
      <p style="margin-top: 0;">Nos comunicamos con usted respecto a su hoja de reclamación registrada en nuestro Libro de Reclamaciones Virtual.</p>
    `;

  const attachmentsHtml = attachedFileNames.length > 0 ? `
    <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
      <p style="font-size: 12px; font-weight: bold; color: #06CFD6; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Documentos o pruebas adjuntas (${attachedFileNames.length}):</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #cbd5e1;">
        ${attachedFileNames.map(f => `<li style="margin-bottom: 4px;">${escapeHtml(f)}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">Respuesta a Reclamación</h2>
    ${greetingHtml}
    
    <div style="text-align: center; margin: 24px 0;">
      <p style="font-size: 13px; margin: 0; color: #94a3b8;">Código de Seguimiento:</p>
      <div style="display: inline-block; background-color: rgba(6, 207, 214, 0.1); border: 1px solid #06CFD6; padding: 10px 20px; border-radius: 4px; font-size: 18px; font-weight: bold; color: #06CFD6; letter-spacing: 1px; margin-top: 6px;">
        ${escapeHtml(complaintCode)}
      </div>
    </div>

    <div class="card" style="margin: 18px 0; padding: 20px;">
      <div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 14px;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 2px;">Sentido de la Resolución:</span>
        <h3 style="color: #ffffff; margin: 0; font-size: 16px; font-weight: bold;">${escapeHtml(resolutionType)}</h3>
      </div>
      
      <div>
        <p style="font-size: 13px; font-weight: bold; color: #06CFD6; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Detalle de la Respuesta Oficial:</p>
        <div style="background-color: rgba(6, 207, 214, 0.04); border-left: 4px solid #06CFD6; border-radius: 0 4px 4px 0; padding: 12px 14px; color: #e2e8f0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(resolutionBody)}</div>
      </div>

      ${attachmentsHtml}

      <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; margin-top: 16px;">
        <p style="margin: 0; font-size: 13px; color: #94a3b8; font-style: italic;">Agradecemos su retroalimentación, la cual nos ayuda a mejorar continuamente nuestros servicios.</p>
      </div>
    </div>

    <div style="margin-top: 28px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
      <p style="margin: 0 0 14px 0; color: #94a3b8; font-size: 13px;">Atentamente,</p>
      ${buildExecutiveSignatureCard(adminName, adminRole)}
    </div>
  `;
  return masterLayout(content);
}

export function buildExecutiveSignatureCard(adminName: string, adminRole: string): string {
  const frontendBase = (process.env.FRONTEND_URL || 'https://www.bytecode.com.pe').replace(/\/+$/, '');
  const signatureImgUrl = `${frontendBase}/vectors/designs/Firma.png`;
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 10px; background-color: #031422; border: 1px solid rgba(6, 207, 214, 0.25); border-top: 3px solid #06CFD6; border-radius: 8px; box-sizing: border-box;">
      <tr>
        <td style="padding: 18px 20px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <!-- Monograma Insignia del Firmante -->
              <td style="width: 50px; vertical-align: top; padding-right: 16px;">
                <table cellpadding="0" cellspacing="0" border="0" style="width: 50px; height: 50px; background-color: #010b10; border: 1.5px solid #06CFD6; border-radius: 8px; text-align: center; border-collapse: separate; overflow: hidden;">
                  <tr>
                    <td style="text-align: center; vertical-align: middle; padding: 0; width: 50px; height: 50px;">
                      <img src="${signatureImgUrl}" alt="Firma Oficial Bytecode" width="46" height="42" style="display: block; margin: 0 auto; max-width: 46px; max-height: 46px; width: 46px; height: auto; object-fit: contain; border: 0;" />
                    </td>
                  </tr>
                </table>
              </td>

              <!-- Datos del Funcionario y Cargo -->
              <td style="vertical-align: middle;">
                <div style="font-size: 16px; font-weight: bold; color: #ffffff; letter-spacing: 0.3px; line-height: 1.2;">
                  ${escapeHtml(adminName)}
                </div>
                <div style="font-size: 12px; font-weight: bold; color: #06CFD6; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 3px;">
                  ${escapeHtml(adminRole)}
                </div>
                <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                  Dirección de Asuntos Legales y Cumplimiento Normativo
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                  Bytecode &mdash; Innovación Tecnológica & Consultoría
                </div>
              </td>
            </tr>
          </table>

          <!-- Divisor interior tenue -->
          <div style="border-top: 1px solid rgba(255,255,255,0.08); margin: 14px 0 12px 0;"></div>

          <!-- Canales y Certificación Oficial -->
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="vertical-align: middle; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
                <div>
                  <span style="color: #64748b;">Canal Oficial:</span> 
                  <a href="mailto:reclamos@bytecode.com.pe" style="color: #06CFD6; text-decoration: none;">reclamos@bytecode.com.pe</a>
                </div>
                <div>
                  <span style="color: #64748b;">Portal Web:</span> 
                  <a href="https://www.bytecode.com.pe" style="color: #06CFD6; text-decoration: none;">www.bytecode.com.pe</a>
                </div>
              </td>
              <td style="text-align: right; vertical-align: middle;">
                <div style="display: inline-block; background-color: rgba(6, 207, 214, 0.08); border: 1px solid rgba(6, 207, 214, 0.3); border-radius: 4px; padding: 5px 12px; font-size: 11px; color: #06CFD6; font-weight: bold; letter-spacing: 0.5px;">
                  &#10004; Notificación Oficial Certificada
                </div>
                <div style="font-size: 10px; color: #64748b; margin-top: 3px;">
                  Libro de Reclamaciones Virtual
                </div>
              </td>
            </tr>
          </table>

          <!-- Cláusula de validez legal -->
          <div style="margin-top: 12px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 9px; font-size: 10px; color: #64748b; line-height: 1.4;">
            Comunicación formal con valor legal probatorio conforme a la normativa de protección al consumidor (Ley N° 29571 / D.S. N° 011-2011-PCM de la República del Perú).
          </div>
        </td>
      </tr>
    </table>
  `;
}

export function buildStaffAuditSignatureCard(adminName: string, adminRole: string, adminEmail?: string): string {
  const frontendBase = (process.env.FRONTEND_URL || 'https://www.bytecode.com.pe').replace(/\/+$/, '');
  const signatureImgUrl = `${frontendBase}/vectors/designs/Firma.png`;
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 12px; background-color: #031422; border: 1px solid rgba(6, 207, 214, 0.25); border-left: 3px solid #06CFD6; border-radius: 6px; box-sizing: border-box;">
      <tr>
        <td style="padding: 16px 18px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <!-- Insignia de Control Interno -->
              <td style="width: 46px; vertical-align: top; padding-right: 14px;">
                <table cellpadding="0" cellspacing="0" border="0" style="width: 46px; height: 46px; background-color: #010b10; border: 1.5px solid #06CFD6; border-radius: 6px; text-align: center; border-collapse: separate; overflow: hidden;">
                  <tr>
                    <td style="text-align: center; vertical-align: middle; padding: 0; width: 46px; height: 46px;">
                      <img src="${signatureImgUrl}" alt="Firma Oficial Bytecode" width="42" height="38" style="display: block; margin: 0 auto; max-width: 42px; max-height: 42px; width: 42px; height: auto; object-fit: contain; border: 0;" />
                    </td>
                  </tr>
                </table>
              </td>

              <!-- Datos del Emisor y Control -->
              <td style="vertical-align: middle;">
                <div style="font-size: 15px; font-weight: bold; color: #ffffff;">
                  ${escapeHtml(adminName)}
                </div>
                <div style="font-size: 12px; color: #06CFD6; font-weight: 600; margin-top: 2px;">
                  ${escapeHtml(adminRole)}${adminEmail ? ` &bull; <span style="color: #94a3b8; font-weight: normal;">${escapeHtml(adminEmail)}</span>` : ''}
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                  Panel de Administración &bull; Módulo de Reclamaciones & Cumplimiento Legal
                </div>
              </td>
            </tr>
          </table>

          <div style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-size: 11px; color: #94a3b8;">
                  <strong style="color: #cbd5e1;">Trazabilidad:</strong> Evento <code style="color: #06CFD6; background: rgba(255,255,255,0.05); padding: 1px 4px; border-radius: 2px;">OFFICIAL_RESPONSE_SENT</code>
                </td>
                <td style="font-size: 11px; color: #94a3b8; text-align: right;">
                  <span style="color: #4ade80; font-weight: bold;">● Estado Terminal Aplicado</span>
                </td>
              </tr>
            </table>
          </div>
        </td>
      </tr>
    </table>
  `;
}

export interface ComplaintResolutionStaffParams {
  complaintCode: string;
  claimType: string;
  isCompany: boolean;
  clientOrCompanyName: string;
  representativeName?: string;
  docType?: string;
  docNumber?: string;
  resolutionType: string;
  resolutionBody: string;
  adminName: string;
  adminEmail?: string;
  adminRole?: string;
  attachedFileNames?: string[];
  resolvedAt?: string;
}

export function buildComplaintResolutionStaffNotification(params: ComplaintResolutionStaffParams): string {
  const {
    complaintCode,
    claimType,
    isCompany,
    clientOrCompanyName,
    representativeName,
    docType,
    docNumber,
    resolutionType,
    resolutionBody,
    adminName,
    adminEmail,
    adminRole = 'Administrador',
    attachedFileNames = [],
    resolvedAt = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }),
  } = params;

  const content = `
    <h2 style="color: #ffffff; margin-top: 0; text-align: center;">Notificación de Resolución Oficial</h2>
    <p style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: -8px;">Aviso Interno para Administración y Asesoría Legal</p>
    
    <p>Se ha emitido y notificado la respuesta formal final al reclamante para el expediente <span class="highlight">${escapeHtml(complaintCode)}</span>, quedando el caso cerrado con carácter terminal.</p>
    
    <div class="card" style="margin: 18px 0; padding: 20px;">
      <h3 style="color: #ffffff; margin-top: 0; font-size: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">Ficha Resumen del Expediente</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); width: 140px;"><strong style="color: #06CFD6;">Código:</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); font-family: monospace; font-size: 15px; color: #ffffff;">${escapeHtml(complaintCode)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);"><strong style="color: #06CFD6;">Tipo de Caso:</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${escapeHtml(claimType || 'Reclamación')}</td>
        </tr>
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);"><strong style="color: #06CFD6;">${isCompany ? 'Razón Social:' : 'Reclamante:'}</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${escapeHtml(clientOrCompanyName)} ${isCompany ? '<span style="font-size: 11px; color: #38bdf8;">(Persona Jurídica)</span>' : '<span style="font-size: 11px; color: #a7f3d0;">(Persona Natural)</span>'}</td>
        </tr>
        ${isCompany && representativeName ? `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);"><strong style="color: #06CFD6;">Representante:</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${escapeHtml(representativeName)}</td>
        </tr>` : ''}
        ${docNumber ? `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);"><strong style="color: #06CFD6;">Documento:</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${escapeHtml(docType ? `${docType}: ` : '')}${escapeHtml(docNumber)}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);"><strong style="color: #06CFD6;">Sentido Emitido:</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; color: ${resolutionType.toLowerCase().includes('fundado') && !resolutionType.toLowerCase().includes('infundado') ? '#4ade80' : '#f87171'};">${escapeHtml(resolutionType)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);"><strong style="color: #06CFD6;">Resuelto por:</strong></td>
          <td style="padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">${escapeHtml(adminName)}${adminEmail ? ` &lt;${escapeHtml(adminEmail)}&gt;` : ''} (${escapeHtml(adminRole)})</td>
        </tr>
        <tr>
          <td style="padding: 8px 10px;"><strong style="color: #06CFD6;">Fecha Legal (UTC-5):</strong></td>
          <td style="padding: 8px 10px;">${escapeHtml(resolvedAt)}</td>
        </tr>
      </table>

      <div style="margin-top: 18px;">
        <p style="font-size: 13px; font-weight: bold; color: #06CFD6; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Copia de la Respuesta Notificada:</p>
        <div style="background-color: rgba(6, 207, 214, 0.04); border-left: 4px solid #06CFD6; border-radius: 0 4px 4px 0; padding: 12px 14px; color: #e2e8f0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(resolutionBody)}</div>
      </div>

      ${attachedFileNames.length > 0 ? `
      <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
        <p style="font-size: 12px; font-weight: bold; color: #06CFD6; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Adjuntos enviados al reclamante (${attachedFileNames.length}):</p>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #cbd5e1;">
          ${attachedFileNames.map(f => `<li style="margin-bottom: 4px;">${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>` : ''}
    </div>

    <!-- Bloque de Auditoría y Firma Administrativa -->
    <div style="margin-top: 24px;">
      <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: bold;">
        Registro de Emisión & Auditoría de Cierre:
      </p>
      ${buildStaffAuditSignatureCard(adminName, adminRole, adminEmail)}
    </div>

    <div style="text-align: center; margin: 28px 0 10px 0;">
      <a href="https://www.bytecode.com.pe/admin/reclamos" class="button">Ver Expediente en Panel Admin</a>
    </div>
  `;
  return masterLayout(content);
}
