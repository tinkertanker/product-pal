import type { FieldDef } from '../shared/steps';

type Props = {
  stepId: string;
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  /** Extra class on the wrapper (used by the 4Cs cards). */
  className?: string;
};

export function FieldInput({ stepId, field, value, onChange, className = '' }: Props) {
  const id = `f-${stepId}-${field.id.replace('.', '-')}`;
  const helperId = field.helper ? `${id}-help` : undefined;
  return (
    <div className={`field${field.main ? ' field--main' : ''} ${className}`.trim()}>
      <label htmlFor={id}>
        {field.label}
        {!field.required && <span className="optional"> (optional)</span>}
      </label>
      {field.helper && (
        <p id={helperId} className="field__help">
          {field.helper}
        </p>
      )}
      {field.multiline ? (
        <textarea
          id={id}
          rows={field.main ? 4 : 3}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
          aria-describedby={helperId}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
          aria-describedby={helperId}
        />
      )}
    </div>
  );
}
