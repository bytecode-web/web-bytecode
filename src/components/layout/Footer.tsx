import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { WhatsAppIcon } from '../icons/SocialIcons';
import { useSettings } from '../../contexts/SettingsContext';
import './Footer.css';

const Footer: React.FC = () => {
  const { settings } = useSettings();
  const phones = [settings?.contact_info?.phone_1, settings?.contact_info?.phone_2].filter((phone): phone is string => Boolean(phone));
  const email = settings?.contact_info?.email;
  return (
    <footer className="home-footer">
      <div className="home-footer-cta">
        <img className="home-footer-geometry" src="/vectors/designs/elemento_footer.svg" alt="" width="240" height="260" loading="lazy" />
        <h2>Un clic para ti,<br />un salto para tu<br /> marca.</h2>
        <Link to="/contacto" className="home-footer-connect">Conectar</Link>
        <img className="home-footer-mark" src="/vectors/logos/isotipo.svg" alt="" width="36" height="44" loading="lazy" />
      </div>
      <div className="home-footer-details">
        <div className="home-footer-contact">
          <strong>Contáctanos</strong>
          {phones.map(phone => {
            const digits = phone.replace(/\D/g, '');
            const international = digits.startsWith('51') && digits.length === 11 ? digits : `51${digits}`;
            return <a key={phone} href={`https://wa.me/${international}`} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /><span>{digits.length === 9 ? `(+51) ${phone}` : phone}</span></a>;
          })}
          {email && <a href={`mailto:${email}`}><Mail size={18} /><span>{email}</span></a>}
        </div>
        <div className="home-footer-copyright">© 2026 Bytecode. Todos los derechos reservados.<small>Diseñado por Marco Román</small></div>
        <nav aria-label="Información legal"><Link to="/condiciones">Condiciones</Link><Link to="/privacidad">Privacidad</Link><Link to="/reclamaciones">Libro de Reclamaciones</Link></nav>
      </div>
    </footer>
  );
};
export default Footer;
