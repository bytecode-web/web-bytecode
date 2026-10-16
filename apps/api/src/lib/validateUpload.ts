import crypto from 'node:crypto';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { MAX_UPLOAD_MB } from '../config/constants.js';
import { HttpError } from '../utils/httpError.js';

const allowedUploadMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const allowedExtensionsByMimeType = new Map([
  ['application/pdf', new Set(['.pdf'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
]);

const DANGEROUS_EXTENSIONS = new Set([
  'php', 'php3', 'php4', 'php5', 'phtml', 'phar',
  'exe', 'dll', 'so', 'dylib', 'bin', 'com',
  'sh', 'bash', 'zsh', 'csh', 'ksh', 'bat', 'cmd',
  'vbs', 'vbe', 'ws', 'wsf', 'wsc', 'ps1', 'ps2', 'ps1xml', 'psc1', 'psc2',
  'js', 'jse', 'mjs', 'cjs', 'ts',
  'py', 'pyc', 'pyw', 'pyo',
  'rb', 'pl', 'cgi',
  'jar', 'war', 'ear', 'class',
  'jsp', 'jspx', 'jsw', 'jsv', 'jspf',
  'asp', 'aspx', 'axd', 'asx', 'ashx', 'asmx',
  'cer', 'csr', 'crt',
  'htm', 'html', 'shtm', 'shtml', 'xhtml', 'xht',
  'svg', 'svgz', 'xml', 'xsl', 'xslt', 'dtd',
  'swf', 'fla',
  'hta', 'scr', 'pif', 'reg', 'inf', 'ins', 'isp', 'chm', 'hlp',
  'lnk', 'url',
  'htaccess', 'htpasswd', 'config', 'env',
]);

export type ValidatedUpload = {
  originalName: string;
  mimeType: string;
  checksumSha256: string;
};

export const allowedUploadMimeTypeList = [...allowedUploadMimeTypes];

export function sanitizeOriginalFileName(originalName: string): string {
  if (!originalName || typeof originalName !== 'string') return 'evidence';

  // 1. Eliminar caracteres nulos, de control y de anulación de dirección Unicode (RTL override)
  let cleaned = originalName
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g, '')
    .trim();

  // 2. Extraer nombre base eliminando rutas de directorios
  cleaned = path.basename(cleaned);

  // 3. Normalizar caracteres especiales
  cleaned = cleaned.replace(/[^\w.\- ]+/g, '_').trim();

  // 4. Quitar puntos y espacios iniciales o finales
  cleaned = cleaned.replace(/^[\s.]+|[\s.]+$/g, '');

  // 5. Truncar nombre preservando la extensión a un máximo de 100 caracteres
  if (cleaned.length > 100) {
    const ext = path.extname(cleaned);
    const base = path.basename(cleaned, ext).slice(0, Math.max(10, 100 - ext.length));
    cleaned = `${base}${ext}`;
  }

  return cleaned || 'evidence';
}

function checkDoubleExtensions(fileName: string): void {
  const parts = fileName.toLowerCase().split('.').filter(Boolean);
  if (parts.length > 2) {
    for (let i = 0; i < parts.length - 1; i++) {
      if (DANGEROUS_EXTENSIONS.has(parts[i])) {
        throw new HttpError(400, `El archivo presenta una extensión intermedia sospechosa o no permitida (".${parts[i]}").`);
      }
    }
  }
}

function inspectBufferContent(buffer: Buffer, mime: string): void {
  // Detección de binarios ejecutables en primeros bytes
  // Encabezado DOS / Windows PE: 'MZ' (0x4D, 0x5A)
  if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
    throw new HttpError(400, 'Archivo ejecutable binario no permitido.');
  }

  // Encabezado Linux ELF: 0x7F 'ELF' (0x7F, 0x45, 0x4C, 0x46)
  if (buffer.length >= 4 && buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    throw new HttpError(400, 'Archivo binario ejecutable ELF no permitido.');
  }

  // Script shebang: '#!/'
  if (buffer.length >= 3 && buffer[0] === 0x23 && buffer[1] === 0x21 && buffer[2] === 0x2F) {
    throw new HttpError(400, 'Script ejecutable no permitido.');
  }

  // Inspección profunda de estructura según MIME permitido
  if (mime === 'application/pdf') {
    const header = buffer.subarray(0, 8).toString('latin1');
    if (!header.startsWith('%PDF-')) {
      throw new HttpError(400, 'Encabezado PDF inválido o corrupto.');
    }

    // Escaneo de acciones activas o incrustadas peligrosas en primeros 64KB
    const inspectChunk = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('latin1');
    const dangerousPdfPatterns = [
      /\/Launch\b/i,
      /\/EmbeddedFile\b/i,
      /\/JavaScript\b/i,
      /\/JS\b/i,
      /<script\b/i,
    ];
    for (const pattern of dangerousPdfPatterns) {
      if (pattern.test(inspectChunk)) {
        throw new HttpError(400, 'El documento PDF contiene elementos activos o código embebido no permitido.');
      }
    }
  } else if (mime === 'image/png') {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(pngSignature)) {
      throw new HttpError(400, 'Firma binaria de imagen PNG inválida.');
    }
    const textSample = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1');
    if (/<\?php|<\?=|eval\(|<script\b/i.test(textSample)) {
      throw new HttpError(400, 'La imagen contiene fragmentos de código no permitidos.');
    }
  } else if (mime === 'image/jpeg') {
    if (buffer.length < 3 || buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
      throw new HttpError(400, 'Firma binaria de imagen JPEG inválida.');
    }
    const textSample = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1');
    if (/<\?php|<\?=|eval\(|<script\b/i.test(textSample)) {
      throw new HttpError(400, 'La imagen contiene fragmentos de código no permitidos.');
    }
  } else if (mime === 'image/webp') {
    if (buffer.length < 12) {
      throw new HttpError(400, 'Firma de imagen WEBP incompleta.');
    }
    const riff = buffer.subarray(0, 4).toString('latin1');
    const webp = buffer.subarray(8, 12).toString('latin1');
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new HttpError(400, 'Firma binaria de imagen WEBP inválida.');
    }
    const textSample = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('latin1');
    if (/<\?php|<\?=|eval\(|<script\b/i.test(textSample)) {
      throw new HttpError(400, 'La imagen contiene fragmentos de código no permitidos.');
    }
  }
}

export async function validateUpload(file: Express.Multer.File): Promise<ValidatedUpload> {
  if (!file.buffer?.length) {
    throw new HttpError(400, 'Archivo no disponible.');
  }

  if (file.buffer.length < 32) {
    throw new HttpError(400, 'El archivo es demasiado pequeño o está corrupto.');
  }

  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes || file.buffer.length > maxBytes) {
    throw new HttpError(413, `El archivo supera el límite de ${MAX_UPLOAD_MB}MB.`);
  }

  // 1. Sanitizar y verificar nombre y extensiones sospechosas
  const originalName = sanitizeOriginalFileName(file.originalname);
  checkDoubleExtensions(file.originalname);
  checkDoubleExtensions(originalName);

  const extension = path.extname(originalName).toLowerCase();
  if (!extension) {
    throw new HttpError(400, 'El archivo debe tener una extensión válida.');
  }

  // 2. Detectar tipo real por magic numbers
  const detected = await fileTypeFromBuffer(file.buffer);

  if (!detected || !allowedUploadMimeTypes.has(detected.mime)) {
    throw new HttpError(400, 'Archivo no permitido.');
  }

  const allowedExtensions = allowedExtensionsByMimeType.get(detected.mime);
  if (!allowedExtensions?.has(extension)) {
    throw new HttpError(400, 'La extensión del archivo no coincide con su contenido real.');
  }

  if (!allowedUploadMimeTypes.has(file.mimetype)) {
    throw new HttpError(400, 'Tipo MIME reportado no permitido.');
  }

  // 3. Inspección profunda de seguridad del buffer (firmas binarias, polyglots, código embebido)
  inspectBufferContent(file.buffer, detected.mime);

  return {
    originalName,
    mimeType: detected.mime,
    checksumSha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
  };
}
