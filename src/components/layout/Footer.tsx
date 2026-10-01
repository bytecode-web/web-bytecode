import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from "lucide-react";
import SpotlightText from "../typography/SpotlightText";
import { WhatsAppIcon } from '../icons/SocialIcons';
import { useSettings } from '../../contexts/SettingsContext';

const Footer: React.FC = () => {
  const { settings } = useSettings();

  const phone1 = settings?.contact_info?.phone_1 || '';
  const phone2 = settings?.contact_info?.phone_2 || '';
  const email = settings?.contact_info?.email || '';

  const phone1Link = phone1.replace(/\D/g, '');
  const phone2Link = phone2.replace(/\D/g, '');

  return (
    <div className="bg-transparent font-sansation select-none">
      {/* TODO(CSP): Move this embedded <style> block to a static stylesheet before enforcing CSP. */}
      <style>
        {`
          @keyframes float-logo {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-7px); }
          }
          .animate-float-logo {
            animation: float-logo 4s ease-in-out infinite;
          }
        `}
      </style>

      <footer className="home-footer bg-gradient-to-b from-[#00171c] to-[#001b21]" style={{ position: 'relative' }}>
        {/* Decorativo Fondo Footer (Geométrico) */}
        <img
          src="/vectors/designs/elemento_footer.svg"
          alt=""
          className="footer-decoration absolute top-[35%] sm:top-[20%] md:top-[5%] left-[-1.1%] w-32 sm:w-42 md:w-62 opacity-60 pointer-events-none object-contain z-0"
          style={{
            filter:
              "brightness(0) saturate(100%) invert(20%) sepia(54%) saturate(2973%) hue-rotate(183deg) brightness(97%) contrast(98%)",
          }}
        />

        {/* Línea Separadora */}
        <div className="footer-top-divider border-t border-white mb-16 w-[86.6%] mx-auto" />

        {/* ========================================= */}
        {/* SECCIÓN SUPERIOR */}
        {/* ========================================= */}
        <div className="max-w-7xl mx-auto w-full relative z-10 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-20 mb-16">

          {/* Lado Izquierdo: Texto Principal */}
          <div className="text-center lg:text-left">
            <h2 className="pb-[1.25em] md:pb-[1.15em] lg:pb-0 text-3xl md:text-5xl lg:text-5xl font-bold leading-tight md:leading-[1.15]">
              <SpotlightText>
                Un clic para ti,
                <br />
                un salto para tu
                <br className="hidden lg:block" />
                <span className="lg:hidden"> </span>
                marca.
              </SpotlightText>
            </h2>
          </div>

          <div className="flex items-center -mt-5 mb-5 md:-mt-8 md:mb-8 lg:mt-0 lg:mb-0">
            <Link
              to="/contacto"
              className="bg-[#06CFD6] text-white font-bold text-lg md:text-2xl lg:text-3xl py-4 px-16 md:py-5 md:px-24 lg:px-28 xl:px-20 2xl:px-48 rounded-[30px] shadow-[0_10px_30px_rgba(6,207,214,0.3)] transition-all duration-300 lg:hover:bg-[#0CA3C6] lg:hover:scale-105"
            >
              Conectar
            </Link>
          </div>

          {/* Isotipo */}
          <div className="absolute right-8.5 md:right-17 lg:right-[6%] xl:right-25 2xl:-right-31 lg:block [@media(max-height:720px)]:lg:hidden shrink-0 transform translate-y-31 md:translate-y-37 lg:translate-y-21 transition-all duration-500">
            <div className="animate-float-logo transition-all duration-300 lg:hover:drop-shadow-[0_0_20px_rgba(6,207,214,0.9)]">
              <img
                src="/vectors/designs/elemento_logo.svg"
                alt="Bytecode Element"
                draggable={false}
                className="w-8 md:w-9 lg:w-11 h-auto object-contain opacity-90 transition-all duration-300"
                style={{
                  filter:
                    "brightness(0) saturate(100%) invert(68%) sepia(35%) saturate(3821%) hue-rotate(143deg) brightness(96%) contrast(94%)",
                }}
              />
            </div>
          </div>
        </div>

        {/* ========================================= */}
        {/* SECCIÓN INFERIOR (Línea + Textos) */}
        {/* ========================================= */}

        {/* Línea Separadora */}
        <div className="border-t border-white mb-8 md:mb-1 w-[86.6%] mx-auto" />

        <div className="relative mx-auto w-full max-w-[1700px] px-6 md:px-12 pt-0 pb-8 md:py-8" style={{ zIndex: 1 }}>
          {/* Contenedor inferior */}
          <div className="flex flex-col gap-8 lg:gap-9">
            {/* --- FILA 1: Contacto --- */}
            <div className="flex flex-col lg:flex-row lg:flex-wrap 2xl:flex-nowrap items-center lg:justify-center 2xl:justify-between w-full gap-5 lg:gap-x-10 lg:gap-y-6 2xl:gap-6 text-white font-normal text-base md:text-lg">
              <div className="flex flex-col lg:flex-row lg:flex-wrap 2xl:flex-nowrap items-center justify-center gap-5 lg:gap-x-10 lg:gap-y-6 xl:gap-27 2xl:gap-29">
                <span className="font-semibold text-xl md:text-2xl whitespace-nowrap">
                  Contáctanos
                </span>

                {/* WhatsApp 1 */}
                {phone1 && (
                  <a
                    href={`https://wa.me/51${phone1Link}?text=%C2%A1Hola%2C%20equipo%20de%20Bytecode!%20Me%20gustar%C3%ADa%20cotizar%20el%20desarrollo%20de%20un%20software.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 group outline-none"
                  >
                    <WhatsAppIcon className="text-[#06CFD6] transition-transform duration-300 shrink-0 lg:group-hover:scale-110" size={22} />
                    <span className="text-gray-300 transition-colors duration-300 whitespace-nowrap lg:group-hover:text-white" aria-label="WhatsApp">
                      (+51) {phone1}
                    </span>
                  </a>
                )}

                {/* WhatsApp 2 */}
                {phone2 && (
                  <a
                    href={`https://wa.me/51${phone2Link}?text=%C2%A1Hola%2C%20equipo%20de%20Bytecode!%20Me%20gustar%C3%ADa%20cotizar%20el%20desarrollo%20de%20un%20software.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 group outline-none"
                  >
                    <WhatsAppIcon className="text-[#06CFD6] transition-transform duration-300 shrink-0 lg:group-hover:scale-110" size={22} />
                    <span className="text-gray-300 transition-colors duration-300 whitespace-nowrap lg:group-hover:text-white" aria-label="WhatsApp">
                      (+51) {phone2}
                    </span>
                  </a>
                )}

                {/* Correo */}
                {email && (
                  <a
                    href={`mailto:${email}?subject=Cotizaci%C3%B3n%20de%20desarrollo%20de%20software&body=%C2%A1Hola%2C%20equipo%20de%20Bytecode!%20Me%20gustar%C3%ADa%20cotizar%20el%20desarrollo%20de%20un%20software.`}
                    className="flex items-center gap-3 group outline-none"
                  >
                    <Mail className="text-[#06CFD6] transition-transform duration-300 shrink-0 lg:group-hover:scale-110" size={22} />
                    <span className="text-gray-300 transition-colors duration-300 whitespace-nowrap lg:group-hover:text-white">
                      {email}
                    </span>
                  </a>
                )}
              </div>

              {/* Copyright (Solo visible en Escritorio Gigante 2XL) */}
              <div className="hidden 2xl:flex flex-col items-end gap-1 shrink-0">
                <span className="text-gray-300 text-base text-right whitespace-nowrap">
                  © 2026 Bytecode. Todos los derechos reservados.
                </span>
              </div>
            </div>

            {/* --- FILA 2: Enlaces Legales --- */}
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-14 text-gray-400 text-sm md:text-base font-normal w-full">
              <Link to="/condiciones" className="transition-colors lg:hover:text-[#06CFD6]">Condiciones</Link>
              <Link to="/privacidad" className="transition-colors lg:hover:text-[#06CFD6]">Privacidad</Link>
              <span className="group relative inline-flex cursor-not-allowed text-gray-500 transition-colors lg:hover:text-[#06CFD6]">
                Libro de Reclamaciones
                <span className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-3 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-[#06CFD6]/40 bg-[#010b10]/95 px-4 py-2 text-[11px] font-bold tracking-wide text-white/85 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur-md lg:block lg:opacity-0 lg:translate-y-1 lg:transition-all lg:duration-200 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 before:absolute before:-bottom-1 before:left-1/2 before:h-2 before:w-2 before:-translate-x-1/2 before:rotate-45 before:border-b before:border-r before:border-[#06CFD6]/25 before:bg-[#010b10]">
                  En proceso de construcción
                </span>
              </span>
            </div>

            {/* --- FILA 3: Copyright Móvil/Tablet/Laptop --- */}
            <div className="flex 2xl:hidden w-full justify-center mt-2">
              <span className="text-gray-300 text-sm md:text-base text-center">
                © 2026 Bytecode. Todos los derechos reservados.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Footer;
