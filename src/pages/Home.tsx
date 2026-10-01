import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import SEO from '../components/shared/SEO';
import HeroGalaxy from '../components/effects/HeroGalaxy';
import { HomeServices, HomeTools, HomeAI, HomeTestimonials } from '../components/sections/HomeContent';
import './Home.css';

/* ==========================================================================
    CONFIGURACIÓN Y DATOS ESTÁTICOS
   ========================================================================== */

const HERO_ACTION_LINK_BASE =
  'flex h-[clamp(42px,4.5vw,60px)] w-full min-w-[clamp(180px,20vw,260px)] max-w-full items-center justify-center rounded-full text-[clamp(1.15rem,5vw,1.45rem)] font-bold transition-all md:w-auto md:text-[clamp(1.3rem,2vw,1.7rem)] lg:h-[clamp(48px,5vw,68px)] lg:hover:scale-105 lg:hover:shadow-[0px_0px_25px_rgba(6,207,214,0.5)]'

const HERO_BOTTOM_CORNER_POSITION =
  'right-1.5 md:right-3 lg:right-[6%] xl:right-4 2xl:-right-31';

const HERO_CORNER_SIZE = 'w-[48%] sm:w-[42%] md:w-[40%] xl:w-[36%] 2xl:w-[34%]';

/* ==========================================================================
    SECTION: HERO
   ========================================================================== */

const HeroActionLink: React.FC<{
  to: string;
  variant: 'cyan' | 'white';
  children: React.ReactNode;
}> = ({ to, variant, children }) => (
  <Link
    to={to}
      className={`${HERO_ACTION_LINK_BASE} ${
      variant === 'cyan'
        ? 'bg-[#06CFD6] text-white'
        : 'border-2 border-[#0CA3C6] bg-white text-[#0CA3C6]'
    }`}
  >
    {children}
  </Link>
);

const HeroSection: React.FC = () => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [supportsHover, setSupportsHover] = React.useState(false);

  React.useEffect(() => {
    const hoverQuery = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    const updateHoverSupport = () => {
      setSupportsHover(hoverQuery.matches);
      if (!hoverQuery.matches) setIsHovered(false);
    };

    updateHoverSupport();
    hoverQuery.addEventListener('change', updateHoverSupport);
    return () => hoverQuery.removeEventListener('change', updateHoverSupport);
  }, []);
  
  return (
    <section className="relative min-h-[88svh] overflow-hidden select-none font-sansation lg:min-h-screen">
      {/* Background elements */}
      <div className="absolute inset-0 bg-[#040e1f]" aria-hidden="true">
        <HeroGalaxy />
      </div>

      <img src="/vectors/shapes/esquina-arriba.svg" aria-hidden="true" className={`absolute left-0 top-0 z-10 pointer-events-none hidden lg:block ${HERO_CORNER_SIZE}`} />
      <img src="/vectors/shapes/esquina-abajo.svg" aria-hidden="true" className={`absolute bottom-0 z-0 pointer-events-none hidden lg:block ${HERO_CORNER_SIZE} ${HERO_BOTTOM_CORNER_POSITION}`} />
      <img src="/vectors/shadows/sombra-general.svg" aria-hidden="true" className="absolute top-0 left-0 w-full pointer-events-none z-[9]" />
      <img src="/vectors/shadows/sombra-arriba.svg" aria-hidden="true" className="absolute top-0 left-0 w-full pointer-events-none z-10" />
      <img src="/vectors/shadows/sombra-arriba.svg" aria-hidden="true" className="absolute top-0 left-0 w-full pointer-events-none z-10 opacity-50" />

      <div className="relative z-10 mx-auto flex min-h-[88svh] w-full max-w-[1440px] flex-col items-center justify-center gap-6 px-6 pb-10 pt-20 md:gap-4 md:px-10 md:pt-24 lg:min-h-screen [@media(max-height:720px)]:lg:min-h-[auto] [@media(max-height:720px)]:lg:h-[100vh] lg:flex-row lg:justify-between [@media(max-height:720px)]:lg:justify-center [@media(max-height:720px)]:lg:gap-8 lg:gap-0 lg:px-14 lg:pb-0 lg:pt-[144px] [@media(max-height:720px)]:lg:pt-[92px] lg:-translate-x-[40px] lg:-translate-y-[92px] xl:px-20 xl:-translate-x-[80px] xl:-translate-y-[112px] [@media(max-height:720px)]:xl:-translate-y-0 [@media(max-height:720px)]:lg:-translate-y-0 [@media(max-height:720px)]:lg:translate-x-0 [@media(max-height:720px)]:xl:translate-x-0">
        
        <div className="order-1 flex w-full max-w-[720px] flex-col items-center text-center z-20 lg:order-2 lg:w-[60%] lg:max-w-none lg:items-start lg:text-left [@media(max-height:720px)]:lg:w-auto [@media(max-height:720px)]:lg:-mt-[160px]">
          <h1
            className="mb-2 text-white uppercase leading-[1.08] [text-shadow:0px_4px_7.3px_rgba(0,0,0,0.51)] md:mb-4 whitespace-nowrap [@media(max-height:720px)]:md:mb-2"
          >
            <span className="font-bold lg:whitespace-nowrap text-[clamp(3rem,13.5vw,5rem)] lg:text-[clamp(2.2rem,4.8vw,4.875rem)] [@media(max-height:720px)]:lg:text-[clamp(1.7rem,2.8vw,2.8rem)] block lg:inline">UN GRAN</span>
            <span className="font-bold lg:hidden text-[clamp(2.75rem,12.8vw,4.6rem)] block">SITIO WEB</span>
            <span className="hidden lg:inline font-bold lg:whitespace-nowrap text-[clamp(2.2rem,4.8vw,4.875rem)] [@media(max-height:720px)]:lg:text-[clamp(1.7rem,2.8vw,2.8rem)]"> SITIO WEB,</span>
            <br className="hidden lg:block" />
            <span className="lg:whitespace-nowrap text-[clamp(1rem,5.5vw,1.8rem)] lg:text-[clamp(1.8rem,3.8vw,4rem)] [@media(max-height:720px)]:lg:text-[clamp(1.25rem,2.1vw,2.1rem)]">HACE IDEAS REALIDAD</span>
          </h1>

          <p className="mb-5 text-[clamp(0.9rem,1.8vw,1.75rem)] font-normal leading-[1.3] text-white [text-shadow:0_0_8px_rgba(6,207,214,0.8)] md:mb-10 md:text-[1.5rem] [@media(max-height:720px)]:md:mb-4 [@media(max-height:720px)]:md:text-[1.1rem]">
            Adquiere tu consulta <span className="font-bold text-[#06CFD6]">GRATIS</span>
          </p>

          <div className="flex w-full max-w-[520px] flex-col gap-3 md:w-auto md:flex-row md:gap-5 [@media(max-height:720px)]:md:scale-[0.86] [@media(max-height:720px)]:lg:origin-left">
            <HeroActionLink to="/contacto" variant="cyan" >Conectar</HeroActionLink>
            <HeroActionLink to="/servicios" variant="white">Servicios</HeroActionLink>
          </div>
        </div>

        <div className="order-2 flex w-full flex-shrink-0 items-center justify-center lg:order-1 lg:w-[48%] lg:justify-start [@media(max-height:720px)]:lg:w-auto">
          <motion.div
            animate={{ y: [0, -20, 0], rotate: [0, 2, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative w-[clamp(160px,38vw,360px)] -translate-y-3 md:-translate-y-5 lg:translate-y-0 lg:w-[clamp(260px,34vw,500px)] xl:w-[clamp(360px,38vw,560px)] [@media(max-height:720px)]:lg:w-[clamp(220px,27vw,380px)] [@media(max-height:720px)]:lg:-mt-[150px]"
          >
            <motion.img
              src="/images/characters/astronauta.png"
              alt="Astronauta"
              width={581}
              height={677}
              loading="eager"
              fetchPriority="high"
              decoding="sync"
              className="pointer-events-none w-full h-auto"
              initial={{ filter: "drop-shadow(0px 25px 50px #00000040) brightness(1)" }}
              animate={{
                scale: isHovered ? 1.05 : 1,
                filter: isHovered
                  ? `drop-shadow(0px 0px 40px #06CFD64D) brightness(1.1)`
                  : `drop-shadow(0px 25px 50px #00000040) brightness(1)`,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            />

            {supportsHover && (
              <div
                className="absolute left-[10%] top-[10%] h-[80%] w-[80%] z-20 cursor-crosshair pointer-events-auto"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              />
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
};

const Home: React.FC = () => {

  return (
    <div className="relative isolate overflow-x-hidden font-sansation">
      <Helmet>
        <link rel="preload" href="/images/characters/astronauta.png" as="image" />
      </Helmet>
      <SEO 
        title="Inicio" 
        description="Bytecode es tu socio tecnológico experto en desarrollo de software, aplicaciones móviles y transformación digital."
      />

      {/* Structured Data (JSON-LD) for SEO */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Bytecode",
          "url": "https://tu-dominio.com",
          "logo": "https://tu-dominio.com/designs/mini_logo.svg",
          "description": "Expertos en desarrollo de software y transformación digital.",
          "address": {
            "@type": "PostalAddress",
            "addressCountry": "PE"
          },
          "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "customer service",
            "areaServed": "Global",
            "availableLanguage": ["Spanish", "English"]
          }
        })}
      </script>

      <HeroSection />
      <HomeServices />
      <HomeTools />
      <div className="home-space">
        <HomeAI />
        <HomeTestimonials />
      </div>
    </div>
  );
};

export default Home;
