"use client";

/** Marca ou desmarca todas as caixas de seleção (name="ids") do formulário. */
export function SelectAll({ label }: { label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-5 align-middle"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]:not(:disabled)').forEach((box) => {
          box.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
