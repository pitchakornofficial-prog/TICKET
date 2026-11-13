'use client';

type ImageFormat = 'avif' | 'webp';

export function supportsResponsiveVariants(src: string): 'media' | 'unsplash' | null {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
    return null;
  }
  const cleanPath = src.split('?')[0]?.toLowerCase() || '';
  if (cleanPath.endsWith('.svg')) {
    return null;
  }
  if (src.startsWith('/api/media/')) {
    return 'media';
  }
  if (src.startsWith('https://images.unsplash.com/')) {
    return 'unsplash';
  }
  return null;
}

export function buildResponsiveVariantUrl(
  src: string,
  width: number,
  format?: ImageFormat,
): string {
  const provider = supportsResponsiveVariants(src);
  if (!provider) return src;

  try {
    const isRelative = src.startsWith('/');
    const url = new URL(src, 'http://localhost');
    url.searchParams.set('w', String(width));
    if (format) {
      url.searchParams.set('fm', format);
    }
    if (provider === 'unsplash' && !url.searchParams.has('q')) {
      url.searchParams.set('q', '80');
    }
    return isRelative ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return src;
  }
}

export function buildResponsiveSrcSet(
  src: string,
  widths: readonly number[],
  format?: ImageFormat,
): string {
  return widths
    .map(w => `${buildResponsiveVariantUrl(src, w, format)} ${w}w`)
    .join(', ');
}

export interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'sync' | 'auto';
  widths: readonly number[];
  sizes: string;
  fetchPriority?: 'high' | 'low' | 'auto';
}

export function ResponsiveImage({
  src,
  alt,
  className,
  loading = 'lazy',
  decoding = 'async',
  widths,
  sizes,
  fetchPriority,
}: ResponsiveImageProps) {
  const provider = supportsResponsiveVariants(src);

  if (!provider) {
    return (
      /* biome-ignore lint/performance/noImgElement: supports external/data URLs cleanly */
      <img
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
      />
    );
  }

  const avifSrcSet = buildResponsiveSrcSet(src, widths, 'avif');
  const webpSrcSet = buildResponsiveSrcSet(src, widths, 'webp');
  const fallbackSrcSet = buildResponsiveSrcSet(src, widths);

  return (
    <picture>
      <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
      <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
      <img
        src={src}
        srcSet={fallbackSrcSet}
        sizes={sizes}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
      />
    </picture>
  );
}
