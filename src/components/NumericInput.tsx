import { useEffect, useState } from "react";
import { Input } from "~/components/ui/input";

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
}

export function NumericInput({
  value,
  onChange,
  min = 0,
  max,
  className,
  disabled,
}: NumericInputProps) {
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    // Allow empty string for editing
    if (val === "" || /^\d+$/.test(val)) {
      setInputValue(val);
    }
  };

  const handleBlur = () => {
    let parsed = parseInt(inputValue);

    if (isNaN(parsed)) {
      parsed = min;
    } else {
      if (parsed < min) parsed = min;
      if (max !== undefined && parsed > max) parsed = max;
    }

    onChange(parsed);
    setInputValue(parsed.toString());
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={inputValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      disabled={disabled}
    />
  );
}
