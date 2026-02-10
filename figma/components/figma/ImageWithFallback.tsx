import React from 'react';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({ 
  src, 
  fallback = 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000', 
  alt, 
  ...props 
}) => {
  const [error, setError] = React.useState(false);

  return (
    <img
      src={error ? fallback : src}
      alt={alt}
      onError={() => setError(true)}
      {...props}
    />
  );
};
