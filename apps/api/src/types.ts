export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  email_otp_enabled?: boolean;
}

export interface Country {
  id: string;
  iso: string;
  name: string;
  dialCode: string;
  maxLength: number;
  tax_id_label: string;
  tax_id_regex: string;
  tax_id_placeholder: string;
}

declare global {
// eslint-disable-next-line @typescript-eslint/no-namespace PROBANDO DESPLIEGUE1
  namespace Express {
    interface Request {
      admin?: AdminUser;
      sessionId?: string;
      rawBody?: Buffer;
    }
  }
}
