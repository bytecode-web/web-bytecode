import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';

// 1. Importación de Layouts (Se mantienen estáticos porque son compartidos y ligeros)
import MainLayout from './layouts/MainLayout';
import AltLayout from './layouts/AltLayout';
import LegalLayout from './layouts/LegalLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminLayout from './components/admin/AdminLayout';
import RoleGuard from './components/admin/RoleGuard';

// 2. Code Splitting: Importamos las páginas de forma dinámica
// Esto genera archivos .js separados que solo se descargan cuando el usuario visita la ruta.
const Home = lazy(() => import('./pages/Home'));
const Nosotros = lazy(() => import('./pages/Nosotros'));
const Portafolio = lazy(() => import('./pages/Portafolio'));
const Servicios = lazy(() => import('./pages/Servicios'));
const Contacto = lazy(() => import('./pages/Contacto'));
const Confirmacion = lazy(() => import('./pages/Confirmacion'));
const LibroReclamaciones = lazy(() => import('./pages/LibroReclamaciones'));
const Condiciones = lazy(() => import('./pages/Condiciones'));
const Privacidad = lazy(() => import('./pages/Privacidad'));

// Admin Pages
const AdminLogin = lazy(() => import('./pages/admin/Login'));
const AdminVerifyAccount = lazy(() => import('./pages/admin/VerifyAccount'));
const AdminSetupPassword = lazy(() => import('./pages/admin/SetupPassword'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminDirectorio = lazy(() => import('./pages/admin/DirectorioAdmin'));
const AdminContactos = lazy(() => import('./pages/admin/Contactos'));
const AdminReclamos = lazy(() => import('./pages/admin/Reclamos'));
const AdminCotizador = lazy(() => import('./pages/admin/Cotizador'));
const AdminProyectos = lazy(() => import('./pages/admin/Proyectos'));
const AdminProyectoDetalle = lazy(() => import('./pages/admin/ProyectoDetalle'));
const AdminPortafolio = lazy(() => import('./pages/admin/PortafolioAdmin'));
const AdminUsuarios = lazy(() => import('./pages/admin/Usuarios'));
const AdminRoles = lazy(() => import('./pages/admin/Roles'));
const AdminConfiguracion = lazy(() => import('./pages/admin/Configuracion'));
const AdminNotificaciones = lazy(() => import('./pages/admin/Notificaciones'));
const AdminSeguridad = lazy(() => import('./pages/admin/Seguridad'));
const AdminCMS = lazy(() => import('./pages/admin/CMS'));
const AdminAuditoria = lazy(() => import('./pages/admin/Auditoria'));
const AdminPerfil = lazy(() => import('./pages/admin/Perfil'));

const NotFound = lazy(() => import('./pages/NotFound'));

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);

    // Google Analytics: Track page views manually (excluding admin routes)
    if (!pathname.startsWith('/admin') && typeof (window as any).gtag === 'function') {
      setTimeout(() => {
        (window as any).gtag('event', 'page_view', {
          page_path: pathname,
          page_title: document.title,
        });
      }, 100);
    }
  }, [pathname]);
  return null;
};

const App: React.FC = () => {
  return (
    <Router>
      <ScrollToTop />
      
      {/* 3. Suspense envuelve las rutas para manejar el estado de carga de los componentes lazy */}
      <Suspense fallback={null}>
        <Routes>
          {/* 🟢 GRUPO 1: Header Normal + Footer Normal */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
          </Route>
          
          {/* 🔵 GRUPO 2: AltHeader + AltFooter */}
          <Route element={<AltLayout />}>
            <Route path="/nosotros" element={<Nosotros />} />
            <Route path="/portafolio" element={<Portafolio />} />
            <Route path="/servicios" element={<Servicios />} />
            <Route path="/contacto" element={<Contacto />} />
            <Route path="/confirmacion" element={<Confirmacion />} />
            <Route path="/reclamaciones" element={<LibroReclamaciones />} />
          </Route>

          {/* 🔵 GRUPO 3: MainHeader + ContactFooter */}
          <Route element={<LegalLayout />}>
            <Route path="/condiciones" element={<Condiciones />} />
            <Route path="/privacidad" element={<Privacidad />} />
          </Route>

          {/* 🔴 RUTAS ADMIN */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/verify-account" element={<AdminVerifyAccount />} />
          <Route path="/admin/setup-password" element={<AdminSetupPassword />} />
          
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<RoleGuard requiredPermission="admin.dashboard.view"><AdminDashboard /></RoleGuard>} />
            <Route path="directorio" element={<RoleGuard requiredPermission="admin.directorio.view"><AdminDirectorio /></RoleGuard>} />
            <Route path="contactos" element={<RoleGuard requiredPermission="admin.contactos.view"><AdminContactos /></RoleGuard>} />
            <Route path="reclamos" element={<RoleGuard requiredPermission="admin.reclamos.view"><AdminReclamos /></RoleGuard>} />
            <Route path="cotizador" element={<RoleGuard requiredPermission="admin.cotizador.view"><AdminCotizador /></RoleGuard>} />
            <Route path="proyectos" element={<RoleGuard requiredPermission="admin.proyectos.view"><AdminProyectos /></RoleGuard>} />
            <Route path="proyectos/:id" element={<RoleGuard requiredPermission="admin.proyectos.view"><AdminProyectoDetalle /></RoleGuard>} />
            <Route path="portafolio" element={<RoleGuard requiredPermission="admin.portafolio.view"><AdminPortafolio /></RoleGuard>} />
            <Route path="usuarios" element={<RoleGuard requiredPermission="admin.usuarios.view"><AdminUsuarios /></RoleGuard>} />
            <Route path="roles" element={<RoleGuard requiredPermission="admin.roles.view"><AdminRoles /></RoleGuard>} />
            <Route path="configuracion" element={<RoleGuard requiredPermission="admin.configuracion.view"><AdminConfiguracion /></RoleGuard>} />
            <Route path="notificaciones" element={<RoleGuard requiredPermission="admin.notificaciones.view"><AdminNotificaciones /></RoleGuard>} />
            <Route path="seguridad" element={<RoleGuard requiredPermission="admin.seguridad.view"><AdminSeguridad /></RoleGuard>} />
            <Route path="cms" element={<RoleGuard requiredPermission="admin.cms.view"><AdminCMS /></RoleGuard>} />
            <Route path="auditoria" element={<RoleGuard requiredPermission="admin.auditoria.view"><AdminAuditoria /></RoleGuard>} />
            <Route path="perfil" element={<AdminPerfil />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
};

export default App;
