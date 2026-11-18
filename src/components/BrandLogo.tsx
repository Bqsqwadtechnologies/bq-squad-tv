import React from "react";

export interface BrandLogoProps {
  variant?: "icon" | "horizontal" | "splash";
  className?: string;
  size?: number | string;
}

export function BrandLogo({ variant = "horizontal", className = "", size }: BrandLogoProps) {
  let src = "/brand/logo-horizontal.png";
  let defaultClass = "h-8 w-auto object-contain";

  if (variant === "icon") {
    src = "/brand/icon-mark.png";
    defaultClass = "h-10 w-10 rounded-xl object-contain shadow-sm";
  } else if (variant === "splash") {
    src = "/brand/icon-mark.png";
    defaultClass = "h-24 w-24 rounded-2xl object-contain shadow-lg";
  }

  return (
    <img
      src={src}
      alt="BQ SQWAD TV"
      className={`${defaultClass} ${className}`}
      style={size ? { height: size, width: size } : undefined}
      loading="eager"
    />
  );
}
