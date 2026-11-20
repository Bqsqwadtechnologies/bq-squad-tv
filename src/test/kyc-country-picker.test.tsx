import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KycCountryPicker } from "@/components/KycCountryPicker";

describe("KycCountryPicker", () => {
  it("searches countries by name and shows flags and dial codes", () => {
    render(<KycCountryPicker value="Nigeria" onChange={() => undefined} />);
    const input = screen.getByRole("combobox", { name: "Country" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Kenya" } });

    const option = screen.getByRole("option");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(option).toHaveTextContent("Kenya");
    expect(option).toHaveTextContent("+254");
    expect(option.textContent).toContain("🇰🇪");
  });

  it("supports keyboard search and selecting the active country", () => {
    const onChange = vi.fn();
    render(<KycCountryPicker value="Nigeria" onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Country" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "United States" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("United States");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("supports dial-code search", () => {
    render(<KycCountryPicker value="Nigeria" onChange={() => undefined} />);
    const input = screen.getByRole("combobox", { name: "Country" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "+234" } });

    expect(within(screen.getByRole("listbox")).getByRole("option")).toHaveTextContent("Nigeria");
  });
});
