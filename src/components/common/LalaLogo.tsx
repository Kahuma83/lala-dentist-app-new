import React, { useState, useEffect } from "react";

interface LalaLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  src?: string | null;
  alt?: string;
}

export const LalaLogo: React.FC<LalaLogoProps> = ({
  className = "w-10 h-10",
  size,
  showText = false,
  src,
  alt = "Lala Dentist Logo"
}) => {
  const [imgError, setImgError] = useState(false);
  const imageSource = src || "/logo.png";

  // Reset imgError whenever src changes
  useEffect(() => {
    setImgError(false);
  }, [src, imageSource]);

  if (!imgError && imageSource) {
    return (
      <img
        src={imageSource}
        alt={alt}
        className={`object-contain inline-block ${className}`}
        style={size ? { width: size, height: size } : undefined}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <svg
      viewBox={showText ? "0 0 800 800" : "150 120 500 520"}
      width={size || undefined}
      height={size || undefined}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="lalaGoldComponent" x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#D5BB75" />
          <stop offset="25%" stopColor="#B89238" />
          <stop offset="55%" stopColor="#E2CA8B" />
          <stop offset="80%" stopColor="#9C7721" />
          <stop offset="100%" stopColor="#805F13" />
        </linearGradient>
        <linearGradient id="lalaGoldTextComp" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#A5832E" />
          <stop offset="50%" stopColor="#C5A34E" />
          <stop offset="100%" stopColor="#8E6C1D" />
        </linearGradient>
      </defs>

      <g fill="url(#lalaGoldComponent)">
        {/* Main Tooth Crest and Crown Silhouette */}
        <path d="M 330,170 
                 C 270,180 215,225 215,310
                 C 215,400 245,490 310,610
                 C 315,620 325,620 330,605
                 C 355,520 395,450 440,395
                 C 405,435 375,495 345,580
                 C 285,465 260,390 260,315
                 C 260,250 295,215 340,210
                 C 375,205 405,240 435,260
                 C 442,265 448,255 442,250
                 C 410,225 370,195 425,175
                 C 500,150 565,190 575,270
                 C 585,350 520,445 470,490
                 C 535,425 610,335 595,240
                 C 585,170 515,135 430,165
                 C 385,180 360,165 330,170 Z" />

        {/* Elegant Dental Root Swoop */}
        <path d="M 310,610
                 C 350,560 410,480 520,410
                 C 430,470 370,540 330,605
                 Z" />
        <path d="M 315,600
                 C 380,510 470,440 575,410
                 C 480,450 390,520 325,595
                 Z" />

        {/* 5 Stars inside the Upper Right Tooth Area */}
        <path d="M 488,212 L 492,224 L 505,224 L 494,232 L 498,244 L 488,236 L 478,244 L 482,232 L 471,224 L 484,224 Z" />
        <path d="M 548,228 L 552,240 L 565,240 L 554,248 L 558,260 L 548,252 L 538,260 L 542,248 L 531,240 L 544,240 Z" />
        <path d="M 445,268 L 449,280 L 462,280 L 451,288 L 455,300 L 445,292 L 435,300 L 439,288 L 428,280 L 441,280 Z" />
        <path d="M 522,278 L 526,290 L 539,290 L 528,298 L 532,310 L 522,302 L 512,310 L 516,298 L 505,290 L 518,290 Z" />
        <path d="M 482,310 L 487,324 L 502,324 L 490,333 L 494,347 L 482,338 L 470,347 L 474,333 L 462,324 L 477,324 Z" />

        {/* Smile Curve Underneath with End Dimples */}
        <path d="M 175,560 C 168,545 178,530 195,532 C 190,542 186,552 185,562 Z" />
        <path d="M 625,560 C 632,545 622,530 605,532 C 610,542 614,552 615,562 Z" />
        <path d="M 180,555 
                 C 240,655 560,655 620,555 
                 C 555,640 245,640 180,555 Z" />
      </g>

      {showText && (
        <>
          <text
            x="400"
            y="735"
            textAnchor="middle"
            fill="url(#lalaGoldTextComp)"
            fontFamily="'Plus Jakarta Sans', 'Cinzel', 'Playfair Display', Georgia, sans-serif"
            fontSize="64"
            fontWeight="800"
            letterSpacing="16"
          >
            LALA
          </text>
          <text
            x="400"
            y="785"
            textAnchor="middle"
            fill="url(#lalaGoldTextComp)"
            fontFamily="'Plus Jakarta Sans', 'Cinzel', 'Playfair Display', Georgia, serif"
            fontSize="32"
            fontWeight="600"
            letterSpacing="18"
          >
            DENTIST
          </text>
        </>
      )}
    </svg>
  );
};
