import { useEffect } from "react";

// WCAG 2.4.2: every screen has a title that says where you are — it's also
// what shows in browser tabs, history and screen-reader window lists.
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · CollabNotes` : "CollabNotes";
  }, [title]);
}
