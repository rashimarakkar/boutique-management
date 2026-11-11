'use client';

import { ChangeEvent, FocusEvent, KeyboardEvent, useId, useRef, useState } from 'react';
import styles from '../invoices/invoices.module.css';

type GarmentTypeInputProps = {
  id: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
};

export function GarmentTypeInput({
  id,
  value,
  options,
  onChange,
  required = false,
  minLength,
  maxLength,
  placeholder,
}: GarmentTypeInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const query = value.trim().toLocaleLowerCase();
  const suggestions = options
    .filter((option) => !query || option.toLocaleLowerCase().includes(query))
    .slice(0, 8);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    setOpen(true);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleSuggestionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons?.[Math.min(index + 1, suggestions.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else buttons?.[index - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={`${styles.draftField} ${styles.garmentTypeField}`} onBlur={handleBlur}>
      <label htmlFor={id}>Item / garment</label>
      <div className={styles.garmentTypeInputWrap}>
        <input
          ref={inputRef}
          id={id}
          className={styles.formInput}
          value={value}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          onFocus={() => setOpen(true)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        {open && suggestions.length > 0 && (
          <div className={styles.garmentTypeSuggestions} id={listId} role="listbox" aria-label="Garment type suggestions">
            {suggestions.map((suggestion, index) => (
              <button
                type="button"
                role="option"
                aria-selected={value === suggestion}
                key={suggestion}
                onMouseDown={(event) => event.preventDefault()}
                onKeyDown={(event) => handleSuggestionKeyDown(event, index)}
                onClick={() => {
                  onChange(suggestion);
                  setOpen(false);
                  inputRef.current?.focus();
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
