import { audio } from '../audio';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
};

export default function Keypad({ value, onChange, onSubmit, submitLabel, submitDisabled }: Props) {
  const press = (fn: () => void) => () => { audio.play('click'); fn(); };
  const push = (ch: string) => press(() => onChange(value + ch));
  const back = press(() => onChange(value.slice(0, -1)));
  const clear = press(() => onChange(''));

  return (
    <div>
      <div className="display">{value === '' ? '0' : value}</div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} className="key" onClick={push(d)}>{d}</button>
        ))}
        <button className="key op" onClick={push('.')}>.</button>
        <button className="key" onClick={push('0')}>0</button>
        <button className="key op" onClick={push('00')}>00</button>
        <button className="key danger" onClick={back}>⌫</button>
        <button className="key danger wide" onClick={clear}>C</button>
        <button
          className="key confirm wide"
          disabled={submitDisabled}
          onClick={press(() => onSubmit())}
          style={{ opacity: submitDisabled ? 0.5 : 1 }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
