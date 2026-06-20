import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-text-primary text-center mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-center text-sm text-text-muted mb-8">{subtitle}</p>
        )}
        {!subtitle && <div className="mb-8" />}
        {children}
      </div>
    </div>
  );
}
