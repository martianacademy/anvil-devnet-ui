"use client";

import { useState } from "react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getOpcodeColor } from "@/lib/traceParser";
import type { EvmStep } from "@/lib/traceParser";

interface Props {
    steps: EvmStep[];
}

export function OpcodeTrace({ steps }: Props) {
    const { currentStep, setCurrentStep } = useDevnetStore();
    const step = steps[currentStep];

    if (!steps.length) {
        return (
            <div className="py-6 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No opcode trace available</p>
                <p className="text-xs text-muted-foreground/70">
                    Simple ETH transfers don&apos;t execute EVM opcodes.
                    Traces are generated for transactions that interact with smart contracts
                    (e.g. token transfers, contract calls, deployments).
                </p>
            </div>
        );
    }

    const go = (n: number) => {
        const clamped = Math.max(0, Math.min(steps.length - 1, n));
        setCurrentStep(clamped);
    };

    const stackTop8 = (step?.stack ?? []).slice(-8).reverse();

    return (
        <div className="space-y-3">
            {/* Scrubber */}
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-xs font-mono">
                        Step {currentStep + 1} / {steps.length}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Slider
                        min={0}
                        max={steps.length - 1}
                        step={1}
                        value={[currentStep]}
                        onValueChange={(vals) => setCurrentStep(Array.isArray(vals) ? vals[0] : (vals as number))}
                        className="w-full"
                    />
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => go(0)}>⏮</Button>
                        <Button size="sm" variant="outline" onClick={() => go(currentStep - 1)}>◀</Button>
                        <Button size="sm" variant="outline" onClick={() => go(currentStep + 1)}>▶</Button>
                        <Button size="sm" variant="outline" onClick={() => go(steps.length - 1)}>⏭</Button>
                    </div>
                    {step && (
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div>
                                <span className="text-gray-400">Opcode: </span>
                                <span className={`font-bold ${getOpcodeColor(step.op)}`}>{step.op}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">PC: </span>
                                <span className="text-white">0x{step.pc.toString(16)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Gas Left: </span>
                                <span className="text-white">{step.gas.toLocaleString()}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Gas Cost: </span>
                                <span className="text-yellow-300">{step.gasCost}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Depth: </span>
                                <span className="text-white">{step.depth}</span>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Stack + Memory side by side */}
            <div className="grid grid-cols-2 gap-3">
                {/* Stack */}
                <Card className="bg-gray-900 border-gray-700">
                    <CardHeader className="pb-1">
                        <CardTitle className="text-gray-400 text-xs">STACK (top 8)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-40">
                            {stackTop8.map((item, i) => (
                                <div key={i} className="flex gap-2 text-xs font-mono py-0.5">
                                    <span className="text-gray-500 w-6">[{i}]</span>
                                    <span className="text-green-300 break-all">{item}</span>
                                </div>
                            ))}
                            {stackTop8.length === 0 && <span className="text-gray-600 text-xs">empty</span>}
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* Memory */}
                <Card className="bg-gray-900 border-gray-700">
                    <CardHeader className="pb-1">
                        <CardTitle className="text-gray-400 text-xs">MEMORY</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-40">
                            {(step?.memory ?? []).map((chunk, i) => (
                                <div key={i} className="flex gap-2 text-xs font-mono py-0.5">
                                    <span className="text-gray-500 w-12">{(i * 32).toString(16).padStart(6, "0")}:</span>
                                    <span className="text-blue-300 break-all">{chunk}</span>
                                </div>
                            ))}
                            {(step?.memory ?? []).length === 0 && <span className="text-gray-600 text-xs">empty</span>}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* Storage at this step */}
            {step && Object.keys(step.storage ?? {}).length > 0 && (
                <Card className="bg-gray-900 border-gray-700">
                    <CardHeader className="pb-1">
                        <CardTitle className="text-gray-400 text-xs">STORAGE SNAPSHOT</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-32">
                            {Object.entries(step.storage).map(([slot, value]) => (
                                <div key={slot} className="flex gap-2 text-xs font-mono py-0.5">
                                    <span className="text-orange-300">{slot}:</span>
                                    <span className="text-white">{value}</span>
                                </div>
                            ))}
                        </ScrollArea>
                    </CardContent>
                </Card>
            )}

            {/* SSTORE highlight */}
            {step?.op === "SSTORE" && (
                <Card className="bg-orange-900/20 border-orange-700">
                    <CardContent className="pt-3 text-xs font-mono">
                        <span className="text-orange-400 font-bold">SSTORE </span>
                        <span className="text-gray-300">slot[</span>
                        <span className="text-white">{step.stack[step.stack.length - 1]}</span>
                        <span className="text-gray-300">] = </span>
                        <span className="text-yellow-300">{step.stack[step.stack.length - 2]}</span>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
