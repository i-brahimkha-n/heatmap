import React from 'react';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const I = (children) => (props) => <svg {...base} {...props}>{children}</svg>;

export const FlameIcon = I(<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.4.9 2.2 1.8 2.5C10.3 8.5 11 5.5 12 3z" />);
export const SearchIcon = I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const BellIcon = I(<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>);
export const DownloadIcon = I(<><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M5 21h14" /></>);
export const PlayIcon = I(<path d="M7 4v16l13-8z" fill="currentColor" />);
export const PauseIcon = I(<><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></>);
export const GlobeIcon = I(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3 3 15 0 18-3-3-3-15 0-18z" /></>);
export const MapIcon = I(<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14" /><path d="M15 6v14" /></>);
export const XIcon = I(<><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>);
export const AlertIcon = I(<><path d="M12 3 2 20h20z" /><path d="M12 10v4" /><path d="M12 17.5v.01" /></>);
export const ShieldIcon = I(<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />);
export const PinIcon = I(<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const HandIcon = I(<><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11" /><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7c-3 0-4.5-1.5-6-4l-1.3-2.2a1.5 1.5 0 0 1 2.6-1.5L8 15" /></>);
export const RectIcon = I(<rect x="4" y="6" width="16" height="12" rx="1" />);
export const PolyIcon = I(<path d="M12 3 21 9l-3 11H6L3 9z" />);
export const CircleIcon = I(<circle cx="12" cy="12" r="8" />);
export const TrashIcon = I(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>);
export const InfoIcon = I(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8v.01" /></>);
export const TableIcon = I(<><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18" /><path d="M9 4v16" /></>);
export const RefreshIcon = I(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>);
export const CheckIcon = I(<path d="m5 12 5 5 9-10" />);
