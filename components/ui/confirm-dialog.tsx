"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createContext, useCallback, useContext, useRef, useState } from "react";

interface ConfirmOptions {
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "default" | "destructive";
}

interface ConfirmContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
    confirm: () => Promise.resolve(false),
});

export function useConfirm() {
    return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolveRef = useRef<(value: boolean) => void>(undefined);

    const confirm = useCallback((opts: ConfirmOptions) => {
        setOptions(opts);
        setOpen(true);
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const handleConfirm = () => {
        setOpen(false);
        resolveRef.current?.(true);
    };

    const handleCancel = () => {
        setOpen(false);
        resolveRef.current?.(false);
    };

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{options?.title ?? "Confirm"}</DialogTitle>
                        <DialogDescription>{options?.description ?? ""}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleCancel}>
                            {options?.cancelLabel ?? "Cancel"}
                        </Button>
                        <Button
                            variant={options?.variant ?? "default"}
                            onClick={handleConfirm}
                        >
                            {options?.confirmLabel ?? "Confirm"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ConfirmContext.Provider>
    );
}
