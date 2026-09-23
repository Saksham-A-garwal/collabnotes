import type { ReactNode } from "react";

function Svg({ children, className = "icon" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const PlusIcon = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const FileIcon = ({ className = "icon doc-icon" }: { className?: string }) => (
  <Svg className={className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
);

export const CommentIcon = () => (
  <Svg>
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);

export const CheckIcon = () => (
  <Svg>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
);

export const BellIcon = () => (
  <Svg>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </Svg>
);

export const DownloadIcon = () => (
  <Svg>
    <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
  </Svg>
);

export const ChevronLeftIcon = () => (
  <Svg>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const ClockIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const UsersIcon = () => (
  <Svg>
    <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9.5" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

export const LogOutIcon = () => (
  <Svg>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

export const CloseIcon = () => (
  <Svg>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const ListIcon = () => (
  <Svg>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </Svg>
);

export const OrderedListIcon = () => (
  <Svg>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M4 5.5 5.2 5v3.5M3.8 14.5c0-.9 2.4-.9 2.4.2 0 .7-.6 1-2.4 2.5h2.6M3.8 19c.8-.4 2.2-.2 2.2.7 0 .7-.6 1-1.4 1 .9 0 1.6.3 1.6 1 0 1-1.6 1.2-2.4.6" />
  </Svg>
);

export const LinkIcon = () => (
  <Svg>
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.5-1.5" />
  </Svg>
);

export const QuoteIcon = () => (
  <Svg>
    <path d="M4 6v12M9 8h11M9 12h11M9 16h7" />
  </Svg>
);

export const CodeIcon = () => (
  <Svg>
    <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
  </Svg>
);

export const StrikeIcon = () => (
  <Svg>
    <path d="M4 12h16M16.5 6.5C15.7 5.4 14.2 5 12.5 5 10 5 8 6.2 8 8c0 1.2.8 2 2 2.5M8 16.5c.8 1.3 2.4 2 4.4 2 2.6 0 4.6-1.2 4.6-3.2 0-.8-.3-1.4-.9-1.8" />
  </Svg>
);

export const GoogleIcon = () => (
  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.09A12 12 0 0 0 12 24z" />
    <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76z" />
    <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l4 3.09C6.23 6.86 8.88 4.75 12 4.75z" />
  </svg>
);

export const EmptyPagesArt = () => (
  <svg className="empty-art" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="22" y="10" width="46" height="60" rx="6" />
    <rect x="30" y="20" width="46" height="60" rx="6" />
    <path d="M40 38h26M40 48h26M40 58h16" />
  </svg>
);
