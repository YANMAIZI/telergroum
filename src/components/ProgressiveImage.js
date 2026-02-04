import React, { useState, useEffect } from 'react';

/**
 * Progressive Image Component with lazy loading optimization
 * Loads a low-res placeholder first, then switches to high-res
 */
export const ProgressiveImage = ({ 
  src, 
  placeholder, 
  alt = '', 
  className = '', 
  style = {},
  onLoad 
}) => {
  const [imgSrc, setImgSrc] = useState(placeholder || src);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    // Preload the full image
    const img = new Image();
    img.src = src;
    
    img.onload = () => {
      setImgSrc(src);
      setIsLoading(false);
      if (onLoad) onLoad();
    };

    img.onerror = () => {
      setIsError(true);
      setIsLoading(false);
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, onLoad]);

  if (isError) {
    return (
      <div 
        className={`${className} flex items-center justify-center bg-gray-800`}
        style={style}
      >
        <span className="text-gray-500 text-xs">⚠️</span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={`progressive-image ${className} ${isLoading ? 'loading' : 'loaded'}`}
      style={style}
      loading="lazy"
      decoding="async"
    />
  );
};

/**
 * iOS-style Icon Component with rounded corners
 */
export const IOSIcon = ({ 
  src, 
  placeholder, 
  alt, 
  className = '', 
  onClick,
  size = 60
}) => {
  return (
    <div
      className={`ios-dock-icon ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <ProgressiveImage
        src={src}
        placeholder={placeholder}
        alt={alt}
        className="w-full h-full object-cover"
      />
    </div>
  );
};

export default ProgressiveImage;
