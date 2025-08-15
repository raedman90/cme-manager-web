import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  items: readonly string[];
  placeholder?: string;
  allowCustom?: boolean; // default false -> restringe às categorias pré-definidas
};

export default function CategoryCombobox({
  value,
  onChange,
  items,
  placeholder,
  allowCustom = false,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState(value || "");

  React.useEffect(() => { setQ(value || ""); }, [value]);

  const list = React.useMemo(() => {
    const term = (q || "").toLowerCase().trim();
    if (!term) return items.slice(0, 200);
    return items.filter((it) => it.toLowerCase().includes(term)).slice(0, 200);
  }, [q, items]);

  function pick(v: string) {
    onChange(v);
    setQ(v);
    setOpen(false);
  }

  const hasExact = items.some((it) => it.toLowerCase() === (q || "").toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {value || (placeholder || "Selecione ou busque…")}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-[--radix-popover-trigger-width]"
        onOpenAutoFocus={(e) => e.preventDefault()} // evita ping-pong de foco
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={(v) => setQ(v)}
            placeholder="Digite para filtrar…"
          />
          <CommandList id="category-combobox-list" className="max-h-64 overflow-auto">
            <CommandEmpty>Nenhum resultado</CommandEmpty>
            <CommandGroup>
              {list.map((it) => (
                <CommandItem
                  key={it}
                  value={it}
                  onSelect={() => pick(it)}
                  onMouseDown={(e) => e.preventDefault()} // não fecha antes do onSelect
                >
                  {it}
                </CommandItem>
              ))}
            </CommandGroup>
            {allowCustom && !!q && !hasExact && (
              <CommandGroup heading="Ação">
                <CommandItem
                  value={`usar:${q}`}
                  onSelect={() => pick(q)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  Usar “{q}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}