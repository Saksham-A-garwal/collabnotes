import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// WCAG 2.1.1 / 2.4.3: when a dialog opens, focus moves into it; a modal
// traps Tab so keyboard users can't wander into the page behind it; when it
// closes, focus returns to whatever opened it.
export function useDialogFocus(ref: RefObject<HTMLElement | null>, { trap }: { trap: boolean }): void {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0] ?? container).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (!trap || e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [ref, trap]);
}
