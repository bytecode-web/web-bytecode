# 🌌 Bytecode - Software de Siguiente Nivel

![Bytecode Banner](/public/vectors/designs/variante_logo_color1.svg)

Bienvenido al repositorio oficial del sitio web de **Bytecode**, una landing page de vanguardia diseñada para reflejar la innovación, calidad y visión tecnológica de nuestra marca. Este proyecto no es solo un sitio web; es una experiencia digital interactiva construida con las tecnologías más modernas del ecosistema web.

## 🚀 Visión General

Bytecode es una empresa dedicada al desarrollo de software, aplicaciones móviles y transformación digital. Este sitio web actúa como nuestra carta de presentación, utilizando elementos visuales avanzados, animaciones fluidas y una arquitectura robusta para demostrar nuestras capacidades técnicas.

---

## ✨ Características Destacadas

-   **Experiencia Inmersiva**: Integración de escenas 3D y fondos galácticos dinámicos utilizando `React Three Fiber`.
-   **Interfaz de Usuario "Viva"**: Animaciones complejas de entrada, flotación e interacción gestionadas con `Framer Motion`.
-   **Rendimiento Extremo**: Carga progresiva y *Code Splitting* a nivel de ruta para asegurar que el usuario solo descargue lo que necesita.
-   **Diseño Adaptativo (Responsive)**: Optimizado meticulosamente para dispositivos móviles, tablets y escritorio, con layouts específicos para cada experiencia.
-   **SEO & Accesibilidad**: Implementación de metadatos dinámicos, datos estructurados (JSON-LD) y cumplimiento de estándares de accesibilidad (A11y).

---

## 🛠️ Stack Tecnológico

El proyecto se mantiene en la "cresta de la ola" tecnológica, utilizando las versiones más recientes y potentes:

-   **Core**: [React 19](https://react.dev/)
-   **Build Tool**: [Vite 8](https://vitejs.dev/)
-   **Lenguaje**: [TypeScript 5.9](https://www.typescriptlang.org/)
-   **Estilos**: [Tailwind CSS 4.2](https://tailwindcss.com/) (Next Generation Utility-First CSS)
-   **Enrutado**: [React Router 7](https://reactrouter.com/)
-   **Animaciones**: [Framer Motion 12](https://www.framer.com/motion/) & [GSAP](https://gsap.com/)
-   **Gráficos 3D**: [React Three Fiber](https://r3f.docs.pmnd.rs/) & [Three.js](https://threejs.org/)

---

## 🏗️ Arquitectura del Proyecto

El código sigue un patrón modular basado en **Layouts** y **Páginas**:

```bash
src/
├── assets/          # Fuentes personalizadas (Sansation) y recursos estáticos.
├── components/      # Componentes UI reutilizables (AuroraBackground, Carousel3D, Stack, etc.).
├── layouts/         # Contenedores de estructura (MainLayout, AltLayout, ContactLayout).
├── pages/           # Vistas principales (Home, Nosotros, Portafolio, Servicios, etc.).
├── hooks/           # Lógica reutilizable y gestión de estado local.
├── App.tsx          # Orquestador de rutas y gestión de Suspense.
└── main.tsx         # Punto de entrada y configuración global.
```

---

## 🛠️ Guía de Desarrollo

### Requisitos

-   **Node.js**: v20 o superior.
-   **npm**: v10 o superior.

### Configuración Local

1.  Clona el repositorio:
    ```bash
    git clone [url-del-repo]
    ```
2.  Instala las dependencias:
    ```bash
    npm install
    ```
3.  Inicia el servidor de desarrollo:
    ```bash
    npm run dev
    ```

### Comandos Útiles

| Comando | Acción |
| :--- | :--- |
| `npm run build` | Genera una versión optimizada para producción en `/dist`. |
| `npm run lint` | Verifica la calidad del código y consistencia de estilos. |
| `npm run preview` | Previsualiza localmente el build de producción. |

---

## 🎨 Convenciones de Diseño

-   **Tipografía**: Se utiliza la fuente **Sansation** para un look moderno y tecnológico.
-   **Paleta de Colores**: El color **Cian (#06CFD6 / #0CA3C6)** es nuestra identidad, representando claridad e innovación.
-   **Componentes**: Se prefiere la composición sobre la herencia, utilizando componentes funcionales y hooks personalizados.

---

## 📄 Licencia

© 2026 **Bytecode**. Todos los derechos reservados. Este software es propiedad privada y no puede ser distribuido sin permiso expreso.
