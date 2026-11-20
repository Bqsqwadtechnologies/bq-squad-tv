import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_COUNTRIES, getCountryRule } from "@/lib/kyc-country-rules";

interface KycCountryPickerProps {
  value: string;
  onChange: (countryName: string) => void;
  label?: string;
  required?: boolean;
}

export function KycCountryPicker({
  value,
  onChange,
  label = "Country",
  required = false,
}: KycCountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = ALL_COUNTRIES.find((country) => country.name === value);
  const selectedRule = selected ? getCountryRule(selected.code) : undefined;

  const filteredCountries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter((country) =>
      `${country.name} ${country.code} ${country.dialCode}`
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [query]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function chooseCountry(countryName: string) {
    onChange(countryName);
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredCountries.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && filteredCountries[activeIndex]) {
      event.preventDefault();
      chooseCountry(filteredCountries[activeIndex].name);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      <label className="block text-xs font-bold uppercase tracking-wide text-slate-300">
        {label}
      </label>
      <input
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="kyc-country-options"
        aria-activedescendant={
          open && filteredCountries[activeIndex]
            ? `kyc-country-${filteredCountries[activeIndex].code}`
            : undefined
        }
        required={required}
        value={open ? query : (selected?.name ?? value)}
        placeholder="Search country or dial code"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActiveIndex(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2.5 text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
      />
      {selectedRule && !open && (
        <p className="text-xs text-slate-400" aria-live="polite">
          {selectedRule.flag} {selectedRule.dialCode} · {selectedRule.defaultCurrency}
        </p>
      )}
      {open && (
        <ul
          id="kyc-country-options"
          role="listbox"
          aria-label="Countries"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-cyan-400/30 bg-[#071331] p-1 shadow-2xl"
        >
          {filteredCountries.length ? (
            filteredCountries.map((country, index) => {
              const rule = getCountryRule(country.code);
              return (
                <li
                  id={`kyc-country-${country.code}`}
                  key={country.code}
                  role="option"
                  aria-selected={country.name === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseCountry(country.name)}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm text-white transition ${index === activeIndex ? "bg-cyan-500/20" : "hover:bg-white/5"}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden="true" className="text-lg">
                      {rule.flag}
                    </span>
                    <span className="truncate">{country.name}</span>
                  </span>
                  <span className="ml-3 shrink-0 text-xs tabular-nums text-slate-400">
                    {country.dialCode}
                  </span>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-3 text-sm text-slate-400">No countries match that search.</li>
          )}
        </ul>
      )}
    </div>
  );
}
