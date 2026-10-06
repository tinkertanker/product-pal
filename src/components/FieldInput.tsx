import type { ReactNode } from 'react';
import { fieldLabel, isFieldRequired, type Canvas } from '../shared/canvas';
import type { FieldDef } from '../shared/steps';

type Props = {
  stepId: string;
  canvas: Canvas;
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  /** Pal is writing into this box, so it can't be typed in for the moment. */
  readOnly?: boolean;
  /** A button beside the label ("Draft it for me"). */
  action?: ReactNode;
  /** Anything that belongs directly under the box (the three suggestions). */
  below?: ReactNode;
};

export function FieldInput({ stepId, canvas, field, value, onChange, readOnly, action, below }: Props) {
  const id = `f-${stepId}-${field.id.replace('.', '-')}`;
  const helperId = field.helper ? `${id}-help` : undefined;
  const required = isFieldRequired(canvas, field);
  return (
    <div className="field">
      <div className={action ? 'field__head field__head--action' : 'field__head'}>
        <label htmlFor={id}>
          {fieldLabel(canvas, field)}
          {!required && <span className="optional"> (optional)</span>}
        </label>
        {action}
      </div>
      {field.helper && (
        <p id={helperId} className="field__help">
          {field.helper}
        </p>
      )}
      {field.multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          maxLength={4000}
          readOnly={readOnly}
          aria-busy={readOnly || undefined}
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
          readOnly={readOnly}
          aria-describedby={helperId}
        />
      )}
      {below}
    </div>
  );
}
