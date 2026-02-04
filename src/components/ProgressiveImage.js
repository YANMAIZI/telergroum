import React, { useState, useEffect } from 'react';

const ProgressiveImage = ({ src, placeholder, alt, className }) => {
    const [imgSrc, setImgSrc] = useState(placeholder || src);
    const [customClass, setCustomClass] = useState(placeholder ? 'loading' : 'loaded');

    useEffect(() => {
        if (!src) return;

        const img = new Image();
        img.src = src;
        img.onload = () => {
            setImgSrc(src);
            setCustomClass('loaded');
        };
    }, [src]);

    return (
        <img
            src={imgSrc}
            alt={alt || ''}
            className={`${className || ''} ${customClass}`}
            style={{
                transition: 'filter 0.5s ease-out',
                filter: customClass === 'loading' ? 'blur(10px)' : 'none',
                willChange: 'filter'
            }}
        />
    );
};

export default ProgressiveImage;
