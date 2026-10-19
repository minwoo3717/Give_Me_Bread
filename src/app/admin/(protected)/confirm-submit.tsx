"use client";

export function ConfirmSubmit({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className="rounded-md px-2 py-1 text-danger hover:bg-danger-soft"
    >
      {children}
    </button>
  );
}
