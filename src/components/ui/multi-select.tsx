"use client"

import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { cn } from "@/lib/utils/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

export interface MultiSelectOption {
    label: string
    value: string
}

interface MultiSelectProps {
    options: MultiSelectOption[]
    selected: string[]
    onChange: (values: string[]) => void
    placeholder?: string
    className?: string
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Seleccionar...",
    className,
}: MultiSelectProps) {
    const [open, setOpen] = React.useState(false)

    const handleSelect = (value: string) => {
        const newSelected = selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value]
        onChange(newSelected)
    }

    const handleRemove = (value: string, e: React.MouseEvent) => {
        e.stopPropagation()
        onChange(selected.filter((item) => item !== value))
    }

    const handleClearAll = (e: React.MouseEvent) => {
        e.stopPropagation()
        onChange([])
    }

    const selectedLabels = selected
        .map((value) => options.find((opt) => opt.value === value)?.label)
        .filter(Boolean)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between font-normal",
                        className
                    )}
                >
                    <div className="flex gap-1 flex-wrap flex-1 min-w-0">
                        {selected.length === 0 && (
                            <span className="text-muted-foreground">{placeholder}</span>
                        )}
                        {selected.length > 0 && (
                            <>
                                {selectedLabels.slice(0, 2).map((label) => (
                                    <Badge
                                        variant="secondary"
                                        key={label}
                                        className="mr-1"
                                        onClick={(e) => {
                                            const value = options.find((opt) => opt.label === label)?.value
                                            if (value) handleRemove(value, e)
                                        }}
                                    >
                                        {label}
                                        <button
                                            className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    const value = options.find((opt) => opt.label === label)?.value
                                                    if (value) handleRemove(value, e as any)
                                                }
                                            }}
                                            onMouseDown={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                            }}
                                            onClick={(e) => {
                                                const value = options.find((opt) => opt.label === label)?.value
                                                if (value) handleRemove(value, e)
                                            }}
                                        >
                                            <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                        </button>
                                    </Badge>
                                ))}
                                {selected.length > 2 && (
                                    <Badge variant="secondary" className="mr-1">
                                        +{selected.length - 2} más
                                    </Badge>
                                )}
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                        {selected.length > 0 && (
                            <button
                                onClick={handleClearAll}
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                }}
                                className="rounded-full p-0.5 hover:bg-muted"
                            >
                                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            </button>
                        )}
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </div>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <div className="max-h-64 overflow-auto p-2">
                    {options.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">
                            No hay opciones disponibles
                        </p>
                    ) : (
                        <div className="space-y-1">
                            {options.map((option) => (
                                <div
                                    key={option.value}
                                    onClick={() => handleSelect(option.value)}
                                    className="flex items-center space-x-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent hover:text-accent-foreground"
                                >
                                    <Checkbox
                                        checked={selected.includes(option.value)}
                                        onCheckedChange={() => handleSelect(option.value)}
                                    />
                                    <label className="flex-1 cursor-pointer text-sm">
                                        {option.label}
                                    </label>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
