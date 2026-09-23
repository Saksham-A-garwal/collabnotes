import { useEffect, useRef, useState } from "react";
import { SEARCH_QUERY_MIN, type SearchResult } from "@collabnotes/shared";
import { ApiRequestError } from "../lib/apiClient.js";
import { documentsApi } from "../lib/documentsApi.js";

type State = { results: SearchResult[]; loading: boolean; error: string | null };
const IDLE: State = { results: [], loading: false, error: null };

export function useDocumentSearch(rawQuery: string): State & { active: boolean } {
  const query = rawQuery.trim();
  const active = query.length >= SEARCH_QUERY_MIN;
  const [state, setState] = useState<State>(IDLE);
  const latest = useRef(0);

  useEffect(() => {
    const ticket = ++latest.current;
    if (!active) {
      setState(IDLE);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const timer = window.setTimeout(async () => {
      try {
        const { results } = await documentsApi.search(query);
        if (ticket === latest.current) setState({ results, loading: false, error: null });
      } catch (err) {
        if (ticket !== latest.current) return;
        setState({ results: [], loading: false, error: err instanceof ApiRequestError ? err.message : "Search isn't available right now." });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, active]);

  return { active, ...state };
}
