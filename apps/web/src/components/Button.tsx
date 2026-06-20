import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'subtle';
};

const baseClasses =
  'inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-medium ' +
  'transition-all duration-200 ease-cozy ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent text-white hover:opacity-90 active:scale-[0.98]',
  ghost: 'text-text-primary hover:bg-bg-elevated',
  subtle: 'bg-bg-elevated text-text-primary hover:bg-bg-elevated/70',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
