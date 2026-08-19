"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

/** Button-based checkbox: the props are the button's, minus the ones we control. */
interface CheckboxProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "role" | "onClick" | "onChange"> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
    ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
        <button
            {...props}
            ref={ref}
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onCheckedChange?.(!checked)}
            className={cn(
                "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "flex items-center justify-center transition-colors",
                checked ? "bg-primary text-primary-foreground" : "bg-transparent",
                className
            )}
        >
            {checked && <Check className="h-3 w-3" />}
        </button>
    )
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
