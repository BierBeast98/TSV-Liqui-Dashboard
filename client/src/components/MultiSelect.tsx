import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  allLabel?: string;
  name?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Auswählen...",
  className,
  allLabel = "Alle",
  name = "multiselect",
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAll = () => {
    onChange([]);
  };

  const displayValue = () => {
    if (selected.length === 0) {
      return allLabel;
    }
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label || selected[0];
    }
    return `${selected.length} ausgewählt`;
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={isOpen}
        className="w-full justify-between rounded-lg h-10 font-normal"
        onClick={() => setIsOpen(!isOpen)}
        data-testid={`multiselect-${name}-trigger`}
      >
        <span className="truncate text-left flex-1">{displayValue()}</span>
        <ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform", isOpen && "rotate-180")} />
      </Button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[180px] rounded-md border bg-popover p-1 shadow-md max-h-60 overflow-auto">
          <div
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover-elevate",
              selected.length === 0 && "bg-accent"
            )}
            onClick={selectAll}
            data-testid={`multiselect-${name}-option-all`}
          >
            <div className={cn(
              "flex h-4 w-4 items-center justify-center rounded-sm border",
              selected.length === 0 ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
            )}>
              {selected.length === 0 && <Check className="h-3 w-3" />}
            </div>
            <span className="text-sm">{allLabel}</span>
          </div>

          <div className="my-1 h-px bg-border" />

          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <div
                key={option.value}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover-elevate",
                  isSelected && "bg-accent"
                )}
                onClick={() => toggleOption(option.value)}
                data-testid={`multiselect-${name}-option-${option.value}`}
              >
                <div className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-sm border",
                  isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                )}>
                  {isSelected && <Check className="h-3 w-3" />}
                </div>
                <span className="text-sm truncate">{option.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
