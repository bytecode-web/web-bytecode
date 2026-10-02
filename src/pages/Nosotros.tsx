import React from 'react';
import { motion } from 'framer-motion';
import AltFooter from '../components/layout/AltFooter';
import SEO from '../components/shared/SEO';

const infoBlocks = [
  {
    title: 'Misión',
    text: 'Transformar retos de negocio en productos digitales funcionales, estéticos y técnicamente excelentes.',
  },
  {
    title: 'Visión',
    text: 'Ser el aliado tecnológico referente en la región, elevando los estándares de desarrollo y escalabilidad en productos de clase mundial.',
  },
  {
    title: 'Valores',
    text: 'Precisión técnica, Innovación disruptiva, Escalabilidad multiplataforma, Transparencia operativa y Calidad de código.',
  },
];

const Nosotros: React.FC = () => {
  const [isHovered, setIsHovered] = React.useState(false);
  const [glowPos, setGlowPos] = React.useState({ x: 0, y: 0 });
  const [supportsHover, setSupportsHover] = React.useState(false);

  React.useEffect(() => {
    const hoverQuery = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    const updateHoverSupport = () => {
      setSupportsHover(hoverQuery.matches);
      if (!hoverQuery.matches) {
        setIsHovered(false);
        setGlowPos({ x: 0, y: 0 });
      }
    };

    updateHoverSupport();
    hoverQuery.addEventListener('change', updateHoverSupport);
    return () => hoverQuery.removeEventListener('change', updateHoverSupport);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!supportsHover) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 40;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 40;
      setGlowPos({ x, y });
  };

  return (
    <div className="relative flex w-full flex-col overflow-x-clip bg-[#044553] font-sansation select-none">
      <SEO
        title="Nosotros"
        description="Conoce a Bytecode, especialistas en ingeniería de software multiplataforma y automatización inteligente para negocios escalables."
      />

      {/* ── ESTRUCTURA RESPONSIVA UNIFICADA ── */}
      <section className="relative w-full lg:pb-[100px] 2xl:pb-[150px]">

        {/* === Fondos Base === */}
        <div className="relative lg:absolute left-0 top-0 w-full overflow-hidden h-[18rem] sm:h-[17rem] md:h-[24rem] lg:h-[700px] xl:h-[850px] 2xl:h-[1000px] [@media(max-height:720px)]:lg:h-[560px] [@media(max-height:720px)]:xl:h-[620px] bg-black transition-all duration-500 z-0">
          <img
            src="/images/nosotros/imagenchicalaptoparriba.png"
            alt="Fondo Laptop"
            draggable={false}
            className="h-full w-full object-cover object-center lg:object-top opacity-70 lg:opacity-100 lg:-translate-y-[18%] [@media(max-height:720px)]:lg:-translate-y-[8%]"
          />
          {/* Overlays Móviles */}
          <div className="absolute inset-x-0 bottom-0 h-32 md:h-48 bg-gradient-to-t from-[#0CA3C6] via-black/15 to-transparent lg:hidden" />
          {/* Overlays Escritorio */}
          <div className="hidden lg:block absolute inset-0 w-full bg-gradient-to-r from-black/50 via-black/30 to-transparent lg:w-[90%] 2xl:w-[80%]" />
          <div className="hidden lg:block absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0CA3C6]" />
        </div>

        {/* Fondo ondulado azul base (Escritorio) */}
        <div className="hidden lg:block absolute left-0 w-full overflow-hidden rounded-tr-[90px] bg-[#0CA3C6] shadow-[15px_-15px_40px_rgba(0,0,0,0.25)] lg:top-[500px] xl:top-[600px] 2xl:top-[750px] lg:-bottom-[150px] xl:-bottom-[300px] 2xl:-bottom-[471px] [@media(max-height:720px)]:lg:top-[390px] [@media(max-height:720px)]:xl:top-[430px] [@media(max-height:720px)]:lg:-bottom-[90px] [@media(max-height:720px)]:xl:-bottom-[120px] transition-all duration-500 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0CA3C6]/0 via-[#0CA3C6]/10 to-[#044553]" />
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-[#044553]" />
        </div>

        {/* === Contenedor Principal Unificado === */}
        <div className="relative z-10 flex flex-col lg:block w-full lg:overflow-visible bg-[#0CA3C6] lg:bg-transparent px-4 sm:px-6 lg:px-[80px] xl:px-12 2xl:px-[100px] pb-16 sm:pb-20 lg:pb-0 pt-5 sm:pt-8 lg:pt-[140px] xl:pt-[200px] 2xl:pt-[250px] [@media(max-height:720px)]:lg:pt-[90px] [@media(max-height:720px)]:xl:pt-[110px] mx-auto max-w-none lg:max-w-[1600px] lg:min-h-[1050px] xl:min-h-[1350px] 2xl:min-h-[1600px] [@media(max-height:720px)]:lg:min-h-[760px] [@media(max-height:720px)]:xl:min-h-[860px] transition-all duration-500">

          {/* Decorativos Intermedios Móvil */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#0CA3C6] to-transparent lg:hidden" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[#044553] lg:hidden" />
          <div className="pointer-events-none absolute inset-0 z-0 opacity-80 top-[225px] md:top-[350px] lg:hidden">
            <img
              src="/vectors/designs/elemento_intermedio_nosotros_vista_movil.svg"
              alt="Patrón"
              className="h-[434px] w-[648px] md:w-full md:h-auto md:scale-90 md:scale-x-[1.12] md:origin-top object-cover object-left-top"
            />
          </div>

          {/* Bloque Izquierdo (Textos) */}
          <div className="relative z-30 w-full lg:w-1/2 lg:pl-[30px] flex flex-col order-2 lg:order-none">

            {/* Título y Párrafo principal */}
            <div className="absolute lg:relative -top-[750px] md:-top-[990px] sm:-top-[140px] lg:top-0 left-0 lg:left-auto w-full lg:w-auto px-5 sm:px-8 lg:px-0 text-center lg:text-left z-20 lg:z-auto">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="font-bold text-[#0CA3C6] leading-none lg:leading-tight text-[clamp(2rem,8.5vw,3.2rem)] md:text-[clamp(2.3rem,9vw,3.5rem)] lg:text-[65px] xl:text-[75px] 2xl:text-[85px] lg:mb-6 transition-all"
              >
                Nosotros
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="mx-auto lg:mx-0 mt-3 sm:mt-4 lg:mt-0 max-w-[19rem] sm:max-w-[24rem] lg:max-w-[1600px] text-[0.9rem] md:text-[1.3rem] sm:text-[1rem] lg:text-[22px] xl:text-[26px] 2xl:text-[32px] leading-[1.05rem] md:leading-[1.5rem] sm:leading-[1.2rem] lg:leading-snug 2xl:leading-[36px] text-white/90 lg:text-white lg:text-justify lg:mb-[70px] xl:mb-[100px] 2xl:mb-[150px] transition-all"
              >
                Nos especializamos en ingeniería de software multiplataforma y automatización inteligente para negocios escalables.
              </motion.p>
            </div>

            {/* Misión, Visión, Valores */}
            <div className="relative z-10 flex flex-col items-center lg:items-start text-center lg:text-left gap-11 sm:gap-14 lg:gap-[50px] xl:gap-[80px] 2xl:gap-[120px] max-w-[20rem] sm:max-w-[24rem] lg:max-w-none mx-auto lg:mx-0 mt-[190px] mb-[190px] md:mt-[540px] md:mb-[190px] sm:mt-0 sm:mb-[250px] lg:mt-[100px] lg:mb-0 xl:mt-[220px] 2xl:mt-[250px] [@media(max-height:720px)]:lg:mt-[30px] [@media(max-height:720px)]:xl:mt-[80px] lg:pl-20 transition-all duration-500">
              {infoBlocks.map((block, index) => (
                <motion.div key={block.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }} className="flex flex-col items-center lg:items-start">
                  <h2 className="font-bold text-white [text-shadow:0px_4px_10.7px_rgba(255,255,255,0.49)] text-[clamp(2.2rem,9vw,3.3rem)] lg:text-[42px] xl:text-[54px] 2xl:text-[64px] leading-none lg:mb-4 2xl:mb-8 transition-all">
                    {block.title}
                  </h2>
                  <p className="mt-4 lg:mt-0 max-w-[18rem] sm:max-w-[22rem] lg:max-w-[550px] text-[0.95rem] md:text-[1.35rem] sm:text-[1rem] lg:text-[18px] xl:text-[20px] 2xl:text-[24px] leading-[1.2rem] md:leading-[1.5rem] sm:leading-[1.35rem] lg:leading-relaxed text-white/85 lg:text-white lg:text-justify transition-all">
                    {block.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bloque Derecho (Gráficos Decorativos y El Hombre) */}
          <div className="relative lg:absolute z-10 lg:z-20 w-full lg:w-[800px] max-w-[18rem] sm:max-w-[21rem] lg:max-w-none mx-auto lg:mx-0 mb-24 sm:mb-14 md:mb-40 lg:mb-0 aspect-[0.72] lg:aspect-auto lg:right-0 lg:top-[55px] lg:h-[1700px] [@media(max-height:720px)]:lg:h-[1280px] md:origin-top lg:origin-[100%_15%] md:scale-[1.5] lg:scale-[0.62] xl:scale-[0.82] 2xl:scale-[1.21] [@media(max-height:720px)]:lg:scale-[0.48] [@media(max-height:720px)]:xl:scale-[0.62] [@media(max-height:720px)]:2xl:scale-[0.82] 2xl:-right-34 pointer-events-none lg:transition-transform lg:duration-500 order-1 lg:order-none mt-[20px] lg:mt-0">

            {/* 1. Rectángulo azul oscuro */}
            <motion.div initial={{ opacity: 0, x: 80 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }} className="absolute -top-[20px] left-[calc(100%-140px)] md:left-[calc(100%-164px)] lg:top-[50px] lg:left-auto lg:right-0 2xl:right-[var(--nosotros-right-edge)] h-[104px] w-[100vw] md:h-[114px] lg:h-[258px] lg:w-[355px] rounded-l-[20px] lg:rounded-l-[60px] rounded-r-none bg-[#024F79]" style={{ '--nosotros-right-edge': 'min(136px, calc(936px - 50vw))' } as React.CSSProperties} />

            {/* 2. Cuadrado inferior izquierdo */}
            <motion.div initial={{ opacity: 0, x: -60, y: 60 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }} className="absolute top-[336px] right-[calc(100%-164.2px)] md:top-[391px] md:right-[calc(100%-196px)] lg:top-[1029px] lg:right-auto lg:left-[80px] h-[149px] w-[100vw] md:h-[169px] lg:h-[403px] lg:w-[414px] rounded-r-[34px] lg:rounded-[59px] rounded-l-none lg:rounded-l-[59px] bg-[#026B9B] shadow-[3px_5px_6px_rgba(0,0,0,0.4)]" />

            {/* 3. Rectángulo vertical cian principal */}
            <motion.div initial={{ opacity: 0, y: -80 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }} className="absolute left-[66px] top-[7px] md:left-[77px] md:top-[7px] lg:left-[210px] lg:top-[99px] w-[161px] h-[441.3px] md:h-[516px] md:w-[190px] lg:h-[1240px] lg:w-[456px] rounded-[25px] md:rounded-[28px] lg:rounded-[60px] bg-gradient-to-b from-[#06CFD6] to-[#036C70]" />

            {/* 4. Círculo cian */}
            <motion.div initial={{ opacity: 0, x: 60, y: -60 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }} className="absolute right-[29px] top-[20px] md:right-[31px] md:top-[24px] lg:right-[51px] lg:top-[145px] h-[153px] w-[153px] md:h-[182px] md:w-[182px] lg:h-[435px] lg:w-[435px] rounded-full bg-[#0CA3C6] shadow-[3px_5px_60px_-10px_rgba(0,0,0,1)] lg:shadow-[0_60px_60px_-20px_rgba(0,0,0,0.35)]" />

            {/* 5. Sombra del piso */}
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }} className="absolute top-[430px] left-[142px] md:top-[499px] md:left-[166px] lg:top-[1275px] lg:left-[60px] z-0 w-[90%] lg:w-[730px] -translate-x-1/2 lg:translate-x-0 opacity-85 lg:opacity-100">
              <motion.img
                src="/images/nosotros/sombrapisohombre.png"
                alt=""
                draggable={false}
                className="w-full opacity-90 lg:opacity-100"
                animate={{
                  scale: isHovered ? 0.95 : 1,
                  opacity: isHovered ? 0.4 : 0.9,
                  filter: isHovered ? "blur(6px)" : "blur(0px)"
                }}
                transition={{
                  scale: { type: "spring", stiffness: 300, damping: 25 },
                  opacity: { type: "spring", stiffness: 300, damping: 25 },
                  filter: { type: "tween", duration: 0.3, ease: "easeInOut" }
                }}
              />
            </motion.div>

            {/* 6. El Hombre */}
            <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.9, delay: 0.4, ease: "easeOut" }} className="absolute left-1/2 lg:left-[60px] top-[3.8%] lg:top-[125px] z-10 w-[93%] lg:w-[750px] -translate-x-1/2 lg:translate-x-0 pointer-events-none">
              <motion.img
                src="/images/nosotros/hombredepie.png"
                alt="Tecnología"
                draggable={false}
                className="w-full"
                initial={{ filter: "drop-shadow(0px 20px 25px #0000004D) brightness(1)" }}
                animate={{
                  y: isHovered ? -15 : 0,
                  scale: isHovered ? 1.02 : 1,
                  filter: isHovered
                    ? `drop-shadow(${-glowPos.x}px ${-glowPos.y}px 30px #06CFD6D9) brightness(1.1)`
                    : `drop-shadow(0px 20px 25px #0000004D) brightness(1)`
                }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              />
            </motion.div>

            {/* 7. Hover Interaction Area (Solo Escritorio) */}
            {supportsHover && (
              <div className="hidden lg:block absolute left-[210px] top-[200px] z-20 h-[1050px] w-[450px] cursor-crosshair pointer-events-auto" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => { setIsHovered(false); setGlowPos({ x: 0, y: 0 }); }} onMouseMove={handleMouseMove} />
            )}
          </div>
        </div>
      </section>

      {/* === Gráficos Finales de Cierre === */}
      {/* SVG Lateral (Solo Escritorio) */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-0 hidden lg:block max-w-[250px] lg:top-[500px] xl:top-[600px] 2xl:top-[750px] [@media(max-height:720px)]:lg:top-[390px] [@media(max-height:720px)]:xl:top-[430px] lg:w-[10vw] xl:w-[15vw] 2xl:w-[20vw] lg:opacity-40 xl:opacity-70 2xl:opacity-100 transition-all duration-500">
        <img src="/vectors/designs/elemento_lateral_fondo_nosotros.svg" alt="Patrón Lateral" draggable={false} className="h-full w-full object-contain object-left-top" />
      </div>

      {/* SVG Final (Solo Móvil) */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[950px]  w-full lg:hidden">
        <img
          src="/vectors/designs/elemento_final_nosotros_vista_movil.svg"
          alt="Fondo Móvil"
          className="h-full w-full object-cover object-bottom md:object-fill"
        />
      </div>

      {/* 4. EL FOOTER */}
      <div className="relative z-10">
        <AltFooter />
      </div>
    </div>
  );
};

export default Nosotros;
