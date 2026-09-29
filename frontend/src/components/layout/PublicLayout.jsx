import Header from './Header';
import Footer from './Footer';
import '../../styles/PublicLayout.css';

export default function PublicLayout({ children, activePath, onNavigate }) {
  return (
    <div className="public-layout">
      <Header activePath={activePath} onNavigate={onNavigate} />
      <main className="public-layout-main">
        {children}
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
