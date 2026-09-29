import { useMemo } from 'react';
import '../../styles/InternBackground.css';

/**
 * InternBackground Component
 * Visual Identity: "Glass + Floating Light"
 *
 * Base Environment: Cool White (#F8FAFC) + Pale Blue (#E0F2FE) + Sky Blue (#0284C7) + Cyan (#06B6D4) + Mint Glow (#10B981)
 * Visual Atmosphere: Light, bright, spacious, atmospheric depth with blurred translucent forms and soft light blooms.
 * STRICT REQUIREMENT: ZERO lines, paths, nodes, grids, graph lines, or workflow graphics.
 */
export default function InternBackground({ currentPath = '/intern/dashboard', children }) {
  // Determine page category for atmospheric subtle variations
  const atmosphereVariant = useMemo(() => {
    if (currentPath.includes('/assessment')) return 'assessment';
    if (currentPath.includes('/apply')) return 'apply';
    if (currentPath.includes('/submitted')) return 'submitted';
    if (currentPath.includes('/track')) return 'track';
    if (currentPath.includes('/interview')) return 'interview';
    if (currentPath.includes('/internships/')) return 'details';
    if (currentPath.includes('/explore')) return 'explore';
    return 'dashboard';
  }, [currentPath]);

  return (
    <div className={`intern-bg-root intern-bg-variant-${atmosphereVariant}`}>
      {/* Environmental Base Lighting */}
      <div className="intern-bg-base" />

      {/* Atmospheric Diffused Light Blooms */}
      <div className="intern-bg-light-blooms">
        {/* Soft Circular Cyan Bloom */}
        <div className="intern-bloom bloom-cyan" />

        {/* Diffused Mint Glow */}
        <div className="intern-bloom bloom-mint" />

        {/* Sky Blue Ambient Aura */}
        <div className="intern-bloom bloom-sky" />

        {/* Soft Top Atmosphere Fill */}
        <div className="intern-bloom bloom-top-aura" />
      </div>

      {/* Overlapping Translucent Depth Layer */}
      <div className="intern-bg-depth-forms">
        <div className="intern-shape shape-orb-1" />
        <div className="intern-shape shape-orb-2" />
        <div className="intern-shape shape-pill-1" />
      </div>

      {/* Page Content Container */}
      <div className="intern-bg-content">
        {children}
      </div>
    </div>
  );
}
