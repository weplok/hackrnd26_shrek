import type { ReactNode } from 'react';
import type { ContentNode } from '@zero-day/engine';

export type DeviceKind =
  | 'wifi'
  | 'router'
  | 'speaker'
  | 'pc'
  | 'laptop'
  | 'phone'
  | 'camera'
  | 'printer'
  | 'server'
  | 'mail'
  | 'portal'
  | 'gateway'
  | 'controller'
  | 'person'
  | 'target'
  | 'generic';

const KEYWORD_DEVICE: ReadonlyArray<[RegExp, DeviceKind]> = [
  [/wi-?fi|wlan|вай-?фай/, 'wifi'],
  [/router|роутер|админк/, 'router'],
  [/speaker|колонк/, 'speaker'],
  [/camera|камер/, 'camera'],
  [/printer|принтер/, 'printer'],
  [/mail|почт/, 'mail'],
  [/portal|портал/, 'portal'],
  [/gateway|шлюз/, 'gateway'],
  [/controller|контроллер|домен/, 'controller'],
  [/laptop|ноут/, 'laptop'],
  [/phone|телефон|смартфон/, 'phone'],
  [/server|сервер|почтов/, 'server'],
  [/\bpc\b|пк|комп/, 'pc'],
];

// Pick a concrete device icon from the node's id/label, then fall back to its kind.
export function resolveDevice(node: Pick<ContentNode, 'id' | 'label' | 'kind'>): DeviceKind {
  const haystack = `${node.id} ${node.label}`.toLowerCase();
  for (const [pattern, device] of KEYWORD_DEVICE) {
    if (pattern.test(haystack)) return device;
  }
  switch (node.kind) {
    case 'person':
      return 'person';
    case 'target':
      return 'target';
    case 'machine':
      return 'pc';
    default:
      return 'generic';
  }
}

const PATHS: Record<DeviceKind, ReactNode> = {
  wifi: (
    <>
      <path d="M4 9a13 13 0 0 1 16 0" />
      <path d="M7 12.5a8 8 0 0 1 10 0" />
      <path d="M10 16a3 3 0 0 1 4 0" />
      <circle cx="12" cy="19" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  router: (
    <>
      <rect x="3" y="13" width="18" height="6" rx="1" />
      <path d="M8 10 7 7M16 10l1-3" />
      <circle cx="8" cy="16" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="11" cy="16" r="0.6" fill="currentColor" stroke="none" />
      <path d="M16 16h2" />
    </>
  ),
  speaker: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <circle cx="12" cy="15" r="3.2" />
      <circle cx="12" cy="7" r="1.2" />
    </>
  ),
  pc: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  laptop: (
    <>
      <rect x="5" y="5" width="14" height="9" rx="1" />
      <path d="M3 18h18l-1.5-2H4.5L3 18Z" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M10 18h4" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8h10l2.5-2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="9" cy="13" r="3" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="7" rx="1" />
      <rect x="7" y="14" width="10" height="6" />
      <circle cx="17" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="3" width="16" height="7" rx="1" />
      <rect x="4" y="14" width="16" height="7" rx="1" />
      <path d="M8 6.5h.01M8 17.5h.01" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  portal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  gateway: (
    <>
      <path d="M5 21V6l7-3 7 3v15" />
      <path d="M5 21h14M10 21v-6h4v6" />
    </>
  ),
  controller: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  generic: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
};

export function DeviceIcon({ device }: { device: DeviceKind }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="network-map__device-icon"
      fill="none"
      height="28"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="28"
    >
      {PATHS[device]}
    </svg>
  );
}
