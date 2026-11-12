import { useState } from 'react';

type Props = {
  /** Product/company name used to derive the fallback monogram. */
  name: string;
  /** Existing tile class: `brand-mark` (sidebar) or `auth-mark` (login). */
  className?: string;
};

/**
 * Renders the product logo from `/logo.avif` (or `/logo.png`). If the file is missing or fails to
 * load we fall back to a monogram tile so the shell never shows a broken image.
 */
export default function BrandMark({ name, className = 'brand-mark' }: Props) {
  const [src, setSrc] = useState('/logo.avif');
  const [failed, setFailed] = useState(false);
  const letter = name.trim().charAt(0).toUpperCase() || 'M';

  const handleError = () => {
    if (src === '/logo.avif') {
      setSrc('/logo.png');
    } else {
      setFailed(true);
    }
  };

  if (failed) {
    return <span className={className} aria-hidden="true">{letter}</span>;
  }

  return (
    <span className={`${className} has-logo`} aria-hidden="true">
      <img src={src} alt={name || 'Logo'} className="brand-mark-img" onError={handleError} />
    </span>
  );
}
