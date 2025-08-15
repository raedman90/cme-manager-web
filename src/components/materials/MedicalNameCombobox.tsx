import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { MEDICAL_CATALOG, type MedicalCatalogItem } from "@/data/medicalCatalog";
import { ChevronDown } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSuggestionPicked?: (item: MedicalCatalogItem) => void;
  placeholder?: string;
};

export default function MedicalNameCombobox({ value, onChange, onSuggestionPicked, placeholder }: Props) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState(value || "");

  React.useEffect(() => { setQ(value || ""); }, [value]);

  const items = React.useMemo(() => {
    const term = (q || "").toLowerCase().trim();
    const base = MEDICAL_CATALOG;
    if (!term) return base.slice(0, 50);
    return base
      .filter((it) => {
        const hay = [it.name, ...(it.synonyms ?? [])].join(" ").toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 100);
  }, [q]);

  function pick(item: MedicalCatalogItem) {
    onChange(item.name);
    setQ(item.name);
    onSuggestionPicked?.(item);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              onChange(v);
              if (!open) setOpen(true);
            }}
            onClick={() => setOpen(true)}
            placeholder={placeholder || "Buscar material…"}
            role="combobox"
            aria-expanded={open}
            aria-controls="medical-combobox-list"
          />
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-[--radix-popover-trigger-width]"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={q}
            onValueChange={(v) => {
              setQ(v);
              onChange(v);
            }}
            placeholder="Digite para filtrar…"
          />
          <CommandList id="medical-combobox-list" className="max-h-64 overflow-auto">
            <CommandEmpty>Nenhum resultado</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.name}
                  value={item.name}
                  onSelect={() => pick(item)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{item.name}</span>
                    {item.synonyms?.length ? (
                      <span className="text-xs text-muted-foreground">{item.synonyms.join(", ")}</span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {!!q && (
              <CommandGroup heading="Ação">
                <CommandItem
                  value={`usar:${q}`}
                  onSelect={() => {
                    onChange(q);
                    setOpen(false);
                  }}
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