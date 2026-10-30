'use client';

import type React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'bordered' | 'flat';
  interactive?: boolean;
}

export function Card({
  variant = 'default',
  interactive = false,
  className = '',
  children,
  ...props
}: CardProps) {
  const baseClass = 'ui-card';
  const variantClass = `ui-card-${variant}`;
  const interactiveClass = interactive ? 'ui-card-interactive' : '';

  const combinedClasses = [baseClass, variantClass, interactiveClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={combinedClasses} {...props}>
      {children}
    </div>
  );
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  borderBottom?: boolean;
}

export function CardHeader({
  borderBottom = false,
  className = '',
  children,
  ...props
}: CardHeaderProps) {
  const borderClass = borderBottom ? 'ui-card-header-bordered' : '';
  const combinedClasses = ['ui-card-header', borderClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={combinedClasses} {...props}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function CardTitle({
  as: Component = 'h3',
  className = '',
  children,
  ...props
}: CardTitleProps) {
  return (
    <Component className={`ui-card-title ${className}`.trim()} {...props}>
      {children}
    </Component>
  );
}

export interface CardDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {}

export function CardDescription({
  className = '',
  children,
  ...props
}: CardDescriptionProps) {
  return (
    <p className={`ui-card-description ${className}`.trim()} {...props}>
      {children}
    </p>
  );
}

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CardContent({
  className = '',
  children,
  ...props
}: CardContentProps) {
  return (
    <div className={`ui-card-content ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  borderTop?: boolean;
}

export function CardFooter({
  borderTop = false,
  className = '',
  children,
  ...props
}: CardFooterProps) {
  const borderClass = borderTop ? 'ui-card-footer-bordered' : '';
  const combinedClasses = ['ui-card-footer', borderClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={combinedClasses} {...props}>
      {children}
    </div>
  );
}
