import type { WorkspaceBrand } from '../../domain/workspace';
/** Display a page-based wordmark without changing the supplied image file. */
export function BrandLogo({ brand, width = 145 }: { brand: WorkspaceBrand; width?: number }) {
  if (brand.logoLayout === 'page-wordmark')
    return (
      <span
        className="brand-wordmark"
        style={{
          display: 'inline-block',
          position: 'relative',
          overflow: 'hidden',
          width,
          height: width / 3.6,
          flexShrink: 0,
          margin: 0,
        }}
      >
        <img
          src={brand.logo}
          alt={brand.name}
          style={{
            position: 'absolute',
            width: '172%',
            maxWidth: 'none',
            height: 'auto',
            maxHeight: 'none',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -47%)',
            margin: 0,
          }}
        />
      </span>
    );
  return (
    <img
      src={brand.logo}
      alt={brand.name}
      width={width}
      style={{ objectFit: 'contain', maxHeight: 80, height: 'auto' }}
    />
  );
}
