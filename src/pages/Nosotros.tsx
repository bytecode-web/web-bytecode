import Footer from '../components/layout/Footer';
import SEO from '../components/shared/SEO';
import './Nosotros.css';

const infoBlocks = [
  { title: 'Misión', text: 'Transformar retos de negocio en productos digitales funcionales, estéticos y técnicamente excelentes.' },
  { title: 'Visión', text: 'Ser el aliado tecnológico referente en la región, elevando los estándares de desarrollo y escalabilidad en productos de clase mundial.' },
  { title: 'Valores', text: 'Precisión técnica, Innovación disruptiva, Escalabilidad multiplataforma, Transparencia operativa y Calidad de código.' },
];

export default function Nosotros() {
  return <div className="about-page">
    <SEO title="Nosotros" description="Conoce a Bytecode, especialistas en ingeniería de software multiplataforma y automatización inteligente para negocios escalables." />
    <div className="about-composition">
      <section className="about-intro" aria-labelledby="about-title">
        <img className="about-intro-photo" src="/images/home/website.webp" alt="" width="1280" height="853" fetchPriority="high" decoding="async" />
        <div className="about-intro-copy">
          <h1 id="about-title">Nosotros</h1>
          <p>Nos especializamos en ingeniería de software multiplataforma y automatización inteligente para negocios escalables.</p>
        </div>
      </section>
      <div className="about-art">
        <div className="about-art-top" aria-hidden="true" />
        <div className="about-art-bottom" aria-hidden="true" />
        <div className="about-art-panel" aria-hidden="true" />
        <div className="about-art-circle" aria-hidden="true" />
        <img className="about-art-shadow" src="/images/nosotros/sombrapisohombre.png" alt="" width="745" height="162" loading="lazy" decoding="async" />
        <img className="about-art-person" src="/images/nosotros/hombredepie-749.webp" srcSet="/images/nosotros/hombredepie-480.webp 480w, /images/nosotros/hombredepie-749.webp 749w" sizes="(max-width: 767px) 79vw, 49vw" alt="Personaje con una chaqueta futurista iluminada en turquesa" width="749" height="1313" decoding="async" />
      </div>
      <section className="about-values" aria-label="Misión, visión y valores">
        {infoBlocks.map(block => <article key={block.title}><h2>{block.title}</h2><p>{block.text}</p></article>)}
      </section>
      <img className="about-lines-desktop" src="/vectors/designs/elemento_lateral_fondo_nosotros.svg" alt="" loading="lazy" decoding="async" />
      <img className="about-lines-middle" src="/vectors/designs/elemento_intermedio_nosotros_vista_movil.svg" alt="" loading="lazy" decoding="async" />
    </div>
    <img className="about-lines-bottom" src="/vectors/designs/elemento_final_nosotros_vista_movil.svg" alt="" loading="lazy" decoding="async" />
    <div className="about-footer"><Footer /></div>
  </div>;
}
