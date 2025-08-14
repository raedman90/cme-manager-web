import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import type { MedicalCatalogItem } from "@/data/medicalCatalog";
import { MEDICAL_CATALOG } from "@/data/medicalCatalog";

export default function MedicalNameCombobox({
  value,
  onChange,
  onSuggestionPicked,
  placeholder = "Buscar material...",
}: {
  value: string;
  onChange: (val: string) => void;
  onSuggestionPicked?: (item: MedicalCatalogItem) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MEDICAL_CATALOG;
    return MEDICAL_CATALOG.filter((i) => {
      const targets = [i.name, ...(i.synonyms || [])].join(" ").toLowerCase();
      return targets.includes(q);
    });
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          {value ? value : "Selecione ou digite..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
          <CommandGroup heading="Sugestões">
            {list.map((item) => (
              <CommandItem
                key={item.name}
                value={item.name}
                onSelect={() => {
                  onChange(item.name);
                  onSuggestionPicked?.(item);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === item.name ? "opacity-100" : "opacity-0")} />
                <span>{item.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          {query && (
            <CommandGroup heading="Personalizado">
              <CommandItem
                value={query}
                onSelect={() => {
                  onChange(query);
                  setOpen(false);
                }}
              >
                <span>Usar "{query}"</span>
              </CommandItem>
            </CommandGroup>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}