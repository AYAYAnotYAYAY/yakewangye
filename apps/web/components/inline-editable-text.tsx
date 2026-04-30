import type { ElementType, KeyboardEvent } from "react";
import { useEffect, useRef } from "react";

type InlineEditableTextProps = {
  as?: ElementType;
  value: string;
  className?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
};

export function InlineEditableText({
  as: Tag = "span",
  value,
  className,
  multiline = false,
  onChange,
}: InlineEditableTextProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value]);

  const commit = () => {
    const nextValue = ref.current?.textContent ?? "";
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      ref.current?.blur();
    }
  };

  return (
    <Tag
      ref={ref}
      className={`inline-editable-text${className ? ` ${className}` : ""}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={commit}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    >
      {value}
    </Tag>
  );
}
