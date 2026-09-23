import { useEffect, useState } from "react";
import type { CommentPerson } from "@collabnotes/shared";
import { commentsApi } from "../lib/commentsApi.js";

export function usePeople(documentId: string, enabled: boolean): CommentPerson[] {
  const [people, setPeople] = useState<CommentPerson[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || loadedFor === documentId) return;
    let cancelled = false;
    commentsApi
      .people(documentId)
      .then(({ people }) => {
        if (cancelled) return;
        setPeople(people);
        setLoadedFor(documentId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentId, enabled, loadedFor]);

  return people;
}
