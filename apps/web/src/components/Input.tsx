import { forwardRef, type InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, name, ...props }, ref) => {
    const inputId = id ?? name;
    return (
      <div className="mb-4">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm text-text-muted mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          name={name}
          className={
            'w-full px-3.5 py-2.5 rounded-lg bg-bg-elevated ' +
            'border border-transparent ' +
            'focus:border-accent focus:outline-none ' +
            'transition-colors duration-200 ease-cozy ' +
            'text-text-primary placeholder:text-text-muted ' +
            className
          }
          {...props}
        />
        {error && (
          <p className="text-sm text-danger mt-1.5" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
