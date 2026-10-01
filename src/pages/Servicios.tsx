import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/shared/SEO';
import Footer from '../components/layout/Footer';
import { HomeTools } from '../components/sections/HomeContent';
import './ServiciosReference.css';

const services = [
  { title: 'Página Web', image: '/images/home/website.webp', alt: 'Desarrollo de una página web en un portátil', description: 'Creamos soluciones digitales multiplataforma que fusionan estética de vanguardia con arquitectura técnica robusta y escalable.' },
  { title: 'App Móvil', image: '/images/home/mobile-app.webp', alt: 'Aplicación en un teléfono móvil', description: 'Creamos aplicaciones para iOS y Android con interfaces intuitivas, integraciones seguras y rendimiento optimizado para acompañar el crecimiento de tu negocio.' },
  { title: 'App de Escritorio', image: '/images/showcase/DesktopApp.webp', alt: 'Interfaz de una aplicación de escritorio', description: 'Desarrollamos software de escritorio a medida para simplificar procesos, centralizar información y mejorar la eficiencia de tu equipo.' },
];

export default function Servicios() {
  const [active, setActive] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const service = services[active];
  const change = (direction: number) => setActive(value => (value + direction + services.length) % services.length);
  return <div className="services-reference">
    <SEO title="Servicios" description="Diseño y desarrollo de páginas web, aplicaciones móviles y software de escritorio a medida." />
    <section className="services-viewer" aria-label="Nuestros servicios" aria-roledescription="carrusel" tabIndex={0}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); change(event.key === 'ArrowLeft' ? -1 : 1); } }}>
      <div className="services-photo" onTouchStart={event => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }} onTouchCancel={() => { touchStart.current = null; }} onTouchEnd={event => {
        if (touchStart.current) {
          const delta = event.changedTouches[0].clientX - touchStart.current.x;
          const vertical = event.changedTouches[0].clientY - touchStart.current.y;
          if (Math.abs(delta) > 60 && Math.abs(delta) > Math.abs(vertical)) change(delta < 0 ? 1 : -1);
        }
        touchStart.current = null;
      }}>
        <img key={service.image} src={service.image} alt={service.alt} width="1280" height="853" fetchPriority={active === 0 ? 'high' : 'auto'} decoding="async" />
      </div>
      <button className="services-arrow services-arrow-prev" type="button" aria-label="Servicio anterior" onClick={() => change(-1)}><svg viewBox="0 0 50 90" aria-hidden="true"><path d="M42 8 8 45l34 37" /></svg></button>
      <button className="services-arrow services-arrow-next" type="button" aria-label="Servicio siguiente" onClick={() => change(1)}><svg viewBox="0 0 50 90" aria-hidden="true"><path d="m8 8 34 37L8 82" /></svg></button>
      <div className="services-information">
        <div className="services-description" aria-live="polite" aria-atomic="true">
          <p className="services-label">Servicios</p>
          <h1 data-compact={active === 2}>{service.title}</h1>
          <p className="services-description-text">{service.description}</p>
        </div>
        <div className="services-contact"><h2>Obtén mucha más información</h2><Link to="/contacto">Conectar</Link></div>
      </div>
    </section>
    <HomeTools />
    <div className="services-reference-footer"><Footer /></div>
  </div>;
}
