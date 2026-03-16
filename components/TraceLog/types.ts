export interface TraceEntry {
    idx: number;
    op: string;
    kind: TraceKind;
    gas: number;
    gasCost: number;
    depth: number;
    pc: number;
    /** For SLOAD/SSTORE: storage slot */
    slot?: string;
    /** For SLOAD: value read. For SSTORE: value written */
    value?: string;
    /** For CALL types: target address */
    to?: string;
    /** For CALL: input calldata */
    input?: string;
    /** For CALL: ETH value */
    callValue?: string;
    /** For LOG: topics */
    topics?: string[];
    /** For LOG: data */
    logData?: string;
    /** Stack top values */
    stackTop?: string[];
    /** Decoded function or event name */
    decoded?: string;
    /** Decoded call params (ordered) */
    decodedCallParams?: string[];
    /** Decoded event params with labels */
    decodedEventParams?: { label: string; value: string }[];
    /** Whether this call reverted */
    error?: boolean;
}

export type TraceKind =
    | "CALL"
    | "DELEGATECALL"
    | "STATICCALL"
    | "CREATE"
    | "SLOAD"
    | "SSTORE"
    | "LOG"
    | "JUMP"
    | "RETURN"
    | "REVERT"
    | "OTHER";

export interface TraceFilters {
    showGas: boolean;
    showFullTrace: boolean;
    showStorage: boolean;
    showEvents: boolean;
    search: string;
}
