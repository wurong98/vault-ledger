import type { Ledger } from '@ledgerbox/contracts';
export declare function HomePage({ ledger, onRefresh, }: {
    ledger: Ledger | null;
    onRefresh: () => void;
}): import("react").JSX.Element;
