import React, { useState, useEffect, useRef } from 'react';

const ProgressiveImage = ({ src, placeholder, alt, className, fallbackSrc, fallbackPlaceholder }) => {
    const triedFallbackRef = useRef(false);
    const [imgSrc, setImgSrc] = useState(placeholder || src);
    const [customClass, setCustomClass] = useState(placeholder ? 'loading' : 'loaded');

    useEffect(() => {
        if (!src) return;

        triedFallbackRef.current = false;
        setImgSrc(placeholder || src);
        setCustomClass(placeholder ? 'loading' : 'loaded');

        const img = new Image();
        img.src = src;
        img.onload = () => {
            setImgSrc(src);
            setCustomClass('loaded');
        };

        img.onerror = () => {
            if (!fallbackSrc || triedFallbackRef.current) return;
            triedFallbackRef.current = true;

            if (fallbackPlaceholder) {
                setImgSrc(fallbackPlaceholder);
                setCustomClass('loading');
            }

            const fallbackImg = new Image();
            fallbackImg.src = fallbackSrc;
            fallbackImg.onload = () => {
                setImgSrc(fallbackSrc);
                setCustomClass('loaded');
            };
        };
    }, [src, placeholder, fallbackSrc, fallbackPlaceholder]);

    return (
        <img
            src={imgSrc}
            alt={alt || ''}
            className={`${className || ''} ${customClass}`}
            onError={() => {
                if (!fallbackSrc || triedFallbackRef.current) return;
                triedFallbackRef.current = true;
                setImgSrc(fallbackSrc);
                setCustomClass('loaded');
            }}
            style={{
                transition: 'filter 0.5s ease-out',
                filter: customClass === 'loading' ? 'blur(10px)' : 'none',
                willChange: 'filter'
            }}
        />
    );
};

export default ProgressiveImage;
