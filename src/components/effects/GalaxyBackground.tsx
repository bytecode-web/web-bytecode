import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function GalaxyBackground({ luminousPoints = false }: { luminousPoints?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // OPTIMIZACIÓN 1: Detectar si es un dispositivo móvil
    const getViewportSize = () => {
      const viewport = window.visualViewport;
      return {
        width: Math.max(1, Math.round(viewport?.width ?? window.innerWidth)),
        height: Math.max(1, Math.round(viewport?.height ?? window.innerHeight)),
      };
    };

    const getPixelRatio = (width: number) => {
      if (width < 768) return 1;
      if (width < 1024) return Math.min(window.devicePixelRatio, 1.25);
      return Math.min(window.devicePixelRatio, 2);
    };

    const initialSize = getViewportSize();
    const isMobile = initialSize.width < 768;
    const isTablet = initialSize.width >= 768 && initialSize.width < 1024;

    // ── Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.03);

    // ── Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      initialSize.width / initialSize.height,
      0.1,
      100
    );
    camera.position.set(0, 1, 6);
    camera.lookAt(0, -1, 0);

    // ── Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(getPixelRatio(initialSize.width));
    renderer.setSize(initialSize.width, initialSize.height, false);

    // Soft circular sprite keeps WebGL points round and gives them a glow.
    const pointCanvas = document.createElement('canvas');
    pointCanvas.width = 32;
    pointCanvas.height = 32;
    const pointContext = pointCanvas.getContext('2d');
    if (pointContext) {
      const glow = pointContext.createRadialGradient(16, 16, 0, 16, 16, 16);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.18, 'rgba(255,255,255,0.9)');
      glow.addColorStop(0.48, 'rgba(255,255,255,0.28)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      pointContext.fillStyle = glow;
      pointContext.fillRect(0, 0, 32, 32);
    }
    const pointTexture = new THREE.CanvasTexture(pointCanvas);

    // ── Parameters
    const parameters = {
      count: isMobile ? 30000 : isTablet ? 50000 : 80000,
      size: 0.015,
      radius: 8,
      branches: 4,
      spin: 1,
      randomness: 0.3,
      randomnessPower: 3,
      insideColor: '#ffbb44', 
      outsideColor: '#1a99ee',
    };

    // ─────────────────────────────────────────
    // Galaxy
    // ─────────────────────────────────────────
    const geoGalaxy = new THREE.BufferGeometry();
    const positions  = new Float32Array(parameters.count * 3);
    const colors     = new Float32Array(parameters.count * 3);
    const colorIn    = new THREE.Color(parameters.insideColor);
    const colorOut   = new THREE.Color(parameters.outsideColor);

    for (let i = 0; i < parameters.count; i++) {
      const i3 = i * 3;
      let radius = Math.random() * parameters.radius;
      
      if (radius < 0.1) radius += 0.05;

      const spinAngle   = radius * parameters.spin;
      const branchAngle = (i % parameters.branches) / parameters.branches * Math.PI * 2;
      const rnd = (pow: number) =>
        Math.pow(Math.random(), pow) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * radius;

      positions[i3]     = Math.cos(branchAngle + spinAngle) * radius + rnd(parameters.randomnessPower);
      positions[i3 + 1] = rnd(parameters.randomnessPower) / 2;
      positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + rnd(parameters.randomnessPower);

      const mixed = colorIn.clone().lerp(colorOut, radius / parameters.radius);
      colors[i3]     = mixed.r;
      colors[i3 + 1] = mixed.g;
      colors[i3 + 2] = mixed.b;
    }

    geoGalaxy.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geoGalaxy.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    const matGalaxy = new THREE.PointsMaterial({
      size: parameters.size * (luminousPoints ? 3 : 1), sizeAttenuation: true,
      map: luminousPoints ? pointTexture : null, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    });
    const galaxyPoints = new THREE.Points(geoGalaxy, matGalaxy);
    scene.add(galaxyPoints);

    // ─────────────────────────────────────────
    // Glowing Core
    // ─────────────────────────────────────────
    const coreCanvas = document.createElement('canvas');
    coreCanvas.width = 256;
    coreCanvas.height = 256;
    const ctx = coreCanvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(0.05, 'rgba(255, 230, 120, 0.5)');
      gradient.addColorStop(0.15, 'rgba(255, 180, 40, 0.2)');
      gradient.addColorStop(0.3, 'rgba(200, 100, 20, 0.05)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    }
    
    // CORRECCIÓN WEBGL: Ajustar parámetros de la textura para evitar el error de texImage3D
    const coreTexture = new THREE.CanvasTexture(coreCanvas);
    coreTexture.colorSpace = THREE.SRGBColorSpace; // Obligatorio en Three.js moderno
    coreTexture.flipY = false; // Esto previene el error "FLIP_Y isn't allowed"
    coreTexture.premultiplyAlpha = false;

    const coreMaterial = new THREE.SpriteMaterial({
      map: coreTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6
    });
    const coreSprite = new THREE.Sprite(coreMaterial);
    coreSprite.scale.set(4.5, 0.8, 1);
    scene.add(coreSprite);

    // ─────────────────────────────────────────
    // Background stars
    // ─────────────────────────────────────────
    const starCount = isMobile ? 1000 : isTablet ? 1800 : 3000;
    const starGeo   = new THREE.BufferGeometry();
    const starPos   = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const i3  = i * 3;
      const r   = 15 + Math.random() * 90;
      const t   = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i3]     = r * Math.sin(phi) * Math.cos(t);
      starPos[i3 + 1] = r * Math.sin(phi) * Math.sin(t);
      starPos[i3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x888888, size: 0.03 * (luminousPoints ? 3 : 1), sizeAttenuation: true,
      map: luminousPoints ? pointTexture : null, transparent: true, opacity: 0.5, depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    // ─────────────────────────────────────────
    // Intersection Observer
    // ─────────────────────────────────────────
    let isVisible = true;
    const observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries[0].isIntersecting;
      },
      { threshold: 0.01 }
    );
    observer.observe(canvas);

    // ─────────────────────────────────────────
    // Animation loop (CORRECCIÓN THREE.Clock)
    // ─────────────────────────────────────────
    // Eliminamos THREE.Clock() y usamos JavaScript nativo para evitar warnings
    const startTime = performance.now();
    let animId: number;

    const tick = () => {
      if (isVisible) {
        const elapsedTime = (performance.now() - startTime) * 0.001;
        galaxyPoints.rotation.y = elapsedTime * 0.05;
        renderer.render(scene, camera);
      }
      animId = requestAnimationFrame(tick);
    };
    tick();

    // ─────────────────────────────────────────
    // Resize
    // ─────────────────────────────────────────
    let renderWidth = initialSize.width;
    let renderHeight = initialSize.height;
    let renderPixelRatio = getPixelRatio(initialSize.width);
    let resizeFrameId: number | null = null;

    const resizeRenderer = () => {
      const { width, height } = getViewportSize();
      const nextPixelRatio = getPixelRatio(width);

      if (width === renderWidth && height === renderHeight && nextPixelRatio === renderPixelRatio) {
        return;
      }

      renderWidth = width;
      renderHeight = height;
      renderPixelRatio = nextPixelRatio;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(nextPixelRatio);
      renderer.setSize(width, height, false);
    };

    const onResize = () => {
      if (resizeFrameId !== null) return;

      resizeFrameId = requestAnimationFrame(() => {
        resizeFrameId = null;
        resizeRenderer();
      });
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      if (resizeFrameId !== null) {
        cancelAnimationFrame(resizeFrameId);
      }
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      observer.disconnect();
      renderer.dispose();
      geoGalaxy.dispose(); matGalaxy.dispose();
      starGeo.dispose();   starMat.dispose();
      pointTexture.dispose();
      coreTexture.dispose(); coreMaterial.dispose();
    };
  }, [luminousPoints]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', contain: 'strict' }}
    />
  );
}
