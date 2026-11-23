import type { ReactNode } from 'react';
import type { ValidationMessage } from '../config/types';
import { errorDomId, fieldDomId, hintDomId } from './fieldIds';

interface FieldProps {
  path: string;
  label: string;
  hint?: string;
  error?: ValidationMessage;
  className?: string;
  children: ReactNode;
}

export function Field({
  path,
  label,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  const id = fieldDomId(path);
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <p className="field-hint" id={hintDomId(path)}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={errorDomId(path)}>
          {error.message}
        </p>
      ) : null}
    </div>
  );
}