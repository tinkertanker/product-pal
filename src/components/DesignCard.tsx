import { DESIGN_LANDS, DIRECTION_OPTIONS, FONT_OPTIONS, PALETTE_OPTIONS, type Design, type DesignChoice } from '../shared/design';

type Props = {
  design: Design;
  onChange: (patch: Partial<Design>) => void;
};

function ChoiceList({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  options: readonly DesignChoice[];
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="design__set">
      <legend>{legend}</legend>
      <p className="field__lands">Lands in {DESIGN_LANDS}</p>
      <div className="design__choices">
        {options.map((option) => (
          <label key={option.id} className={`design__choice${value === option.id ? ' is-selected' : ''}`}>
            <input type="radio" name={name} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} />
            <span>
              {option.label}
              {option.hint && <span className="field__help">{option.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DesignCard({ design, onChange }: Props) {
  return (
    <section className="design" aria-labelledby="design-title">
      <h3 id="design-title">How should it look and what is it built on?</h3>
      <p className="field__help">Optional. Skip it if you want Pal to leave look and stack to the builder.</p>
      <ChoiceList legend="Palette" name="design-palette" value={design.palette} options={PALETTE_OPTIONS} onChange={(palette) => onChange({ palette })} />
      <ChoiceList legend="Font" name="design-font" value={design.font} options={FONT_OPTIONS} onChange={(font) => onChange({ font })} />
      <ChoiceList
        legend="Design direction"
        name="design-direction"
        value={design.direction}
        options={DIRECTION_OPTIONS}
        onChange={(direction) => onChange({ direction })}
      />
      <div className="field">
        <label htmlFor="design-stack">What is it built on?</label>
        <p className="field__help">Default for this class: one Python process, no frontend build. Change it if your facilitator said otherwise.</p>
        <p className="field__lands">Lands in {DESIGN_LANDS} · Stack</p>
        <textarea id="design-stack" rows={3} value={design.stack} maxLength={4000} onChange={(e) => onChange({ stack: e.target.value })} />
      </div>
    </section>
  );
}
