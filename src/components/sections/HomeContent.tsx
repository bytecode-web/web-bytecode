import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './TechnologyRibbon.css';

// No animation-frame loop: observers gate CSS motion and infrequent slide updates.
function useHomeMotion() {
  const ref = useRef<HTMLElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => setEnabled(visible && !document.hidden && !reduced.matches);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      reduced.removeEventListener('change', update);
    };
  }, []);
  return { ref, playing: enabled && !paused, paused, toggle: () => setPaused(value => !value) };
}

function useSlideCycle(count: number, delay: number, mobileDelay = delay, initial = 0) {
  const motion = useHomeMotion();
  const [active, setActive] = useState(initial);
  useEffect(() => {
    if (!motion.playing) return;
    const mobile = window.matchMedia('(max-width: 767px)');
    let timer: ReturnType<typeof setInterval>;
    const restart = () => {
      clearInterval(timer);
      timer = setInterval(() => setActive(value => (value + 1) % count), mobile.matches ? mobileDelay : delay);
    };
    restart();
    mobile.addEventListener('change', restart);
    return () => { clearInterval(timer); mobile.removeEventListener('change', restart); };
  }, [motion.playing, count, delay, mobileDelay]);
  return { ...motion, active, setActive };
}

function MotionControl({ paused, toggle, label }: { paused: boolean; toggle: () => void; label: string }) {
  return <button type="button" className="home-motion-control" onClick={toggle} aria-label={`${paused ? 'Reanudar' : 'Pausar'} ${label}`} aria-pressed={paused}>
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">{paused ? <path d="m6 3 11 7-11 7Z" fill="currentColor" /> : <path d="M5 3h3v14H5zm7 0h3v14h-3z" fill="currentColor" />}</svg>
  </button>;
}

const services = [
  { title: 'Página Web', description: 'Te mereces un sitio web\nque haga todo lo que necesitas.', image: '/images/home/website.webp' },
  { title: 'App Móvil', description: 'Aplicaciones nativas e híbridas\npara cualquier dispositivo.', image: '/images/home/mobile-app.webp' },
  { title: 'App de Escritorio', description: 'Aplicaciones de escritorio con\ninterfaces modernas y robustas.', image: '/images/showcase/DesktopApp.webp' },
];

export function HomeServices() {
  const { ref, active, setActive, paused, toggle } = useSlideCycle(services.length, 4500, 3000);
  return (
    <section ref={ref} className="home-services" aria-labelledby="home-services-title" aria-roledescription="carrusel">
      <div className="home-services-backdrop" aria-hidden="true"><svg viewBox="0 0 731 100" preserveAspectRatio="none"><path d="M0 85C110-35 590-20 731 100V120H0Z" fill="white" /></svg></div>
      <header className="home-services-heading">
        <h2 id="home-services-title">Haz crecer tu negocio</h2>
        <p>Te mereces un sitio web que haga <span>todo lo que necesitas.</span></p>
      </header>
      <div className="home-service-stack">
        {services.map((service, index) => <Link key={service.title} to="/servicios" className="home-service-card" data-slot={(index - active + services.length) % services.length} tabIndex={index === active ? 0 : -1} aria-hidden={index !== active} aria-label={`Ver servicios: ${service.title}`}>
          <img className="home-service-photo" src={service.image} alt="" width="1256" height="554" loading="lazy" decoding="async" />
          <div className="home-service-shade" />
          <svg className="home-service-curve" viewBox="0 0 640 284" preserveAspectRatio="none" aria-hidden="true"><path d="M640 120 Q610 230 540 284 H640Z" fill="#008ca3" /></svg>
          <svg className="home-service-mobile-curve" viewBox="0 0 156 193" preserveAspectRatio="none" aria-hidden="true"><path d="M0 120Q78 154 156 120V193H0Z" fill="#008ba2" /></svg>
          <div className="home-service-copy"><h3>{service.title}</h3><p>{service.description}</p></div>
          <img className="home-card-mark" src="/vectors/logos/isotipo.svg" alt="" width="36" height="44" />
        </Link>)}
      </div>
      <MotionControl paused={paused} toggle={toggle} label="servicios" />
      <div className="home-service-dots" aria-label="Seleccionar servicio">
        {services.map((item, index) => <button key={item.title} type="button" onClick={() => setActive(index)} aria-label={item.title} aria-pressed={index === active}><span className={index === active ? 'is-active' : ''} /></button>)}
      </div>
    </section>
  );
}

export function HomeTools() {
  const { ref, playing, paused, toggle } = useHomeMotion();
  return <section ref={ref} className="home-tools" aria-labelledby="home-tools-title" data-playing={playing}>
    <h2 id="home-tools-title"><span>Nuestras Herramientas</span></h2>
    <div className="home-tools-window"><div className="home-tools-track">
      {[0, 1].map(copy => <div key={copy} className="home-tools-logos" aria-hidden={copy === 1 || undefined}>
        {[['laravel', 'Laravel'], ['github', 'GitHub'], ['php', 'PHP'], ['JAVA', 'Java'], ['mongodb', 'MongoDB']].map(([file, title]) => <img key={file} className={`home-tool-${file}`} src={`/vectors/logos/brands/${file}.svg`} alt={copy === 0 ? title : ''} width="180" height="65" loading="lazy" decoding="async" />)}
      </div>)}
    </div>
    </div>
    <MotionControl paused={paused} toggle={toggle} label="tecnologías" />
  </section>;
}

export function HomeAI() {
  return <section className="home-ai" aria-labelledby="home-ai-title">
    <svg className="home-ai-wave" viewBox="0 0 731 160" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="home-wave-cyan"><stop stopColor="#0ca7bf" /><stop offset="1" stopColor="#007aa4" /></linearGradient></defs>
      <path d="M0 0H731V46C704 119 655 137 597 137C483 137 370 72 270 44C166 15 81 19 0 70Z" fill="white" />
      <path d="M0 70C81 19 166 15 270 44C370 72 483 137 597 137C655 137 704 119 731 46V101C681 132 652 145 597 145C463 145 373 93 268 65C164 38 72 51 0 123Z" fill="url(#home-wave-cyan)" />
      <path d="M731 46C704 119 655 137 597 137C567 137 536 132 506 124C604 159 674 145 731 101Z" fill="#006b95" />
    </svg>
    <div className="home-ai-layout">
      <div className="home-ai-portrait home-ai-woman">
        <img src="/images/characters/fondochica.webp" alt="" width="346" height="613" loading="lazy" decoding="async" />
        <img className="home-ai-face" src="/images/characters/chica.png" alt="Retrato de inteligencia artificial en tonos turquesa" width="409" height="557" loading="lazy" decoding="async" />
      </div>
      <div className="home-ai-copy">
        <h2 id="home-ai-title">Comenzar nunca ha sido<br />tan fácil gracias a la IA</h2>
        <p>No hace falta tener experiencia.</p>
        <small>Kit de diseño con IA, uno de los mejores<br />inventos de TIME de 2025*</small>
      </div>
      <div className="home-ai-portrait home-ai-man"><img src="/images/characters/hombre.webp" alt="Diseñador trabajando con un modelo de inteligencia artificial" width="346" height="613" loading="lazy" decoding="async" /></div>
    </div>
  </section>;
}

export function HomeTestimonials() {
  const { ref, active, paused, toggle } = useSlideCycle(3, 3500, 3500, 1);
  return <section ref={ref} className="home-testimonials" aria-labelledby="home-trust-title" aria-roledescription="carrusel">
    <div className="home-testimonials-inner">
      <div className="home-trust-copy" id="home-trust-title"><p>Con la confianza de</p><h2>14 Millones</h2><p>de emprendedores en todo el mundo</p></div>
      <div className="home-review-stack">
        {[
          { name: 'María García', role: 'Emprendedora', image: 'cliente2senito', text: 'Excelente servicio, mi negocio creció enormemente. Totalmente conforme.' },
          { name: 'Dante Gallardo', role: 'CEO', image: 'cliente3', text: 'Muy bueno con el trabajo!\nTotalmente conforme.' },
          { name: 'Carlos Ruiz', role: 'Director', image: 'cliente1', text: 'Profesionales de primer nivel, los recomiendo.' },
        ].map((person, index) => <article className="home-review" data-slot={(index - active + 3) % 3} key={person.name}>
          <img src={`/images/avatars/${person.image}.webp`} alt={person.name} width="150" height="150" loading="lazy" decoding="async" />
          <h3>{person.name}<br />{person.role}</h3>
          <p>{person.text}</p>
          <div className="home-review-stars" aria-label="5 de 5 estrellas">★★★★★</div>
        </article>)}
      </div>
      <img className="home-trust-geometry" src="/vectors/shapes/grafico-derecha.svg" alt="" width="500" height="300" loading="lazy" />
    </div>
    <MotionControl paused={paused} toggle={toggle} label="testimonios" />
  </section>;
}
