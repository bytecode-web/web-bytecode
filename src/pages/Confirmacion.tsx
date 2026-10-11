import React from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import { Rocket, FileCheck, ArrowLeft } from 'lucide-react';
import ContactFooter from '../components/layout/ContactFooter';
import LazyGalaxyBackground from '../components/effects/LazyGalaxyBackground';
import ShineBorder from '../components/ui/shine-border';
import SpotlightText from "../components/typography/SpotlightText";

// 1. DICCIONARIO DE VISTAS
const CONFIRMATION_VIEWS = {
  contacto: {
    icon: Rocket,
    titleStart: "¡Despegue ",
    titleHighlight: "exitoso!",
    description: "Hemos recibido tus datos en nuestra base estelar. Un especialista se comunicará contigo a la velocidad de la luz."
  },
  reclamo: {
    icon: FileCheck,
    titleStart: "Reclamo ",
    titleHighlight: "registrado",
    description: "Tu solicitud ha sido ingresada a nuestra base de datos con éxito. Te notificaremos dentro del plazo de ley establecido."
  }
};

type ViewType = keyof typeof CONFIRMATION_VIEWS;

const Confirmacion: React.FC = () => {
  const [searchParams] = useSearchParams();
  
  const sourceParam = searchParams.get('source');
  
  const source: ViewType = sourceParam === 'reclamo' ? 'reclamo' : 'contacto';
  
  const viewData = CONFIRMATION_VIEWS[source];
  const IconComponent = viewData.icon;

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden font-sansation select-none">
      
      {/* Fondo espacio */}
      <div className="fixed inset-0" style={{ backgroundColor: '#040e1f' }}>
        <LazyGalaxyBackground luminousPoints /> 
        <div className="absolute inset-0 bg-[#040e1f]/40" />
        <div className="absolute inset-0 bg-[#040e1f]/70" />

        <div
          className="absolute inset-0 opacity-70 mix-blend-screen"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }}
        />
        <div
          className="absolute inset-0 opacity-50 rotate-180 mix-blend-screen"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }}
        />
        <div className="absolute inset-0 bg-[#040e1f]/50" />
      </div>

      <div className="relative z-10 w-full max-w-[750px] mx-auto px-6 py-20 pointer-events-auto flex-1 flex flex-col justify-center items-center">
        
        {/* Contenedor Animado de Entrada */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative z-10 w-full max-w-2xl bg-white/[0.03] backdrop-blur-xl rounded-[2.5rem] shadow-[0_0_50px_rgba(0,0,0,0.3)]"
        >
          {/* Tarjeta Shine Border de Magic UI */}
          <ShineBorder
            className="relative flex flex-col items-center text-center w-full bg-transparent p-10 md:p-14"
            color={["#024F79", "#026B9B", "#06CFD6", "#0CA3C6"]}
            borderRadius={40} 
            borderWidth={2}
          >
            {/* Contenedor del Icono */}
            <div className="relative flex justify-center items-center mb-10 w-32 h-32 mt-4">
              
              {/* Ondas Expansivas (Rings) */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 0.4, 0], scale: [0.9, 1.2, 1.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border border-[#06CFD6]"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 0.4, 0], scale: [0.9, 1.2, 1.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 1 }}
                className="absolute inset-0 rounded-full border border-[#06CFD6]"
              />
              
              {/* Base Círculo Neón */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, stiffness: 100, delay: 0.2 }}
                className="relative flex justify-center items-center w-24 h-24 bg-gradient-to-tr from-[#06CFD6]/20 to-[#0CA3C6]/5 border border-[#06CFD6]/30 rounded-full shadow-[0_0_30px_rgba(6,207,214,0.4)] backdrop-blur-sm"
              >
                {/* Icono con flotación continua (Dinámico) */}
                <motion.div
                  animate={{ y: [-3, 3, -3], rotate: [-1.5, 1.5, -1.5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <IconComponent size={44} className="text-[#06CFD6] drop-shadow-[0_0_12px_rgba(6,207,214,0.8)]" strokeWidth={1.5} />
                </motion.div>
              </motion.div>
            </div>

            {/* Textos con secuencia escalonada (Dinámico) */}
            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-[clamp(2.2rem,5vw,3.5rem)] font-bold text-white mb-5 tracking-tight drop-shadow-md"
            >
              {viewData.titleStart} <span className="text-[#06CFD6]">{viewData.titleHighlight}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="text-white/80 text-[clamp(1rem,2vw,1.2rem)] md:text-[clamp(1.1rem,2.3vw,1.4rem)] lg:text-[clamp(1rem,2vw,1.2rem)] leading-relaxed font-light mb-10 max-w-[400px]"
            >
              <SpotlightText>
                {viewData.description}
              </SpotlightText>
            </motion.p>

            {/* Botón CTA - Regresar */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
            >
              <Link
                to="/"
                className="group flex items-center gap-3 px-8 py-3.5 rounded-full border border-white/20 bg-white/5 text-white transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.2)] active:scale-95 outline-none font-medium text-[1.1rem] lg:hover:bg-[#06CFD6] lg:hover:border-[#06CFD6] lg:hover:shadow-[0_0_25px_rgba(6,207,214,0.5)]"
              >
                <ArrowLeft size={22} className="transition-transform duration-300 text-white/70 lg:group-hover:-translate-x-1.5 lg:group-hover:text-white" strokeWidth={2} />
                Volver al inicio
              </Link>
            </motion.div>

          </ShineBorder>
        </motion.div>
      </div>
      
      <div className="relative z-10 pointer-events-auto">
        <ContactFooter />
      </div>
    </div>
  );
};

export default Confirmacion;
