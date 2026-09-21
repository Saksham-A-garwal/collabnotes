// The editor pulls in Tiptap, ProseMirror, Yjs and the realtime client — most
// of the app's JavaScript — so it's a separate chunk that the sign-in and
// dashboard screens don't pay for. One shared loader lets App lazy-load the
// route and the dashboard warm the same chunk (dynamic import() is cached, so
// a second call is free).
export const loadEditorPage = () => import("./EditorPage.js");
