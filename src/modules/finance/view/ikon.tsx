export function IkonRingkasan({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <rect x="3" y="12" width="4" height="8" />
      <rect x="10" y="7" width="4" height="13" />
      <rect x="17" y="3" width="4" height="17" />
    </svg>
  );
}

export function IkonRencana({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 6h16M4 12h10M4 18h7" strokeLinecap="round" />
    </svg>
  );
}

export function IkonTransaksi({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M12 3v18M7 7l5-4 5 4M7 17l5 4 5-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IkonTambah({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.5 : 2}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function IkonPos({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <path d="M8 7V5a4 4 0 0 1 8 0v2" />
    </svg>
  );
}

export function IkonPiutang({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 2-2.5 2.5-2.5 4.5M12 17v.5" strokeLinecap="round" />
    </svg>
  );
}

export function IkonTarget({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IkonAsisten({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 5h16v11H9l-5 4V5z" strokeLinejoin="round" />
      <path d="M8.5 10h.01M12 10h.01M15.5 10h.01" strokeLinecap="round" strokeWidth={2.2} />
    </svg>
  );
}

export function IkonRekap({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  );
}

export function IkonProfil({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" strokeLinecap="round" />
    </svg>
  );
}

export function IkonKunci({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IkonPanah() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IkonMata({ buka }: { buka: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" />
      {buka ? <path d="M4 20 20 4" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function IkonHapus({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
    </svg>
  );
}

export function IkonMasuk({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M12 3v12M7 10l5 5 5-5M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IkonKeluar({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <path d="M12 21V9M7 14l5-5 5 5M4 3h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IkonLainnya({ aktif }: { aktif: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={aktif ? 2.4 : 1.8}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export function SaldoIlustrasi() {
  return (
    <svg className="saldo-ilustrasi" viewBox="0 0 132 96" aria-hidden="true">
      <rect x="8" y="40" width="76" height="44" rx="10" fill="rgba(255,255,255,0.18)" />
      <rect x="24" y="30" width="76" height="44" rx="10" fill="rgba(255,255,255,0.28)" />
      <rect x="40" y="20" width="76" height="44" rx="10" fill="rgba(255,255,255,0.9)" />
      <circle cx="96" cy="42" r="9" fill="#7fc8f3" />
      <path d="M96 37v10M92 40h8M92 44h8" stroke="#2b86bd" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="112" cy="70" r="11" fill="rgba(255,255,255,0.24)" />
      <circle cx="112" cy="70" r="6" fill="rgba(255,255,255,0.5)" />
      <path d="M18 82h168" stroke="rgba(255,255,255,0.16)" strokeLinecap="round" />
    </svg>
  );
}
