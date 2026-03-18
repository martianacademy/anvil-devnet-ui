import { Badge } from "@/components/ui/badge";
import { Blocks, ArrowRightLeft, Fuel, Activity } from "lucide-react";

interface StatsBarProps {
  latestBlock: number;
  txCount: number;
  gasPrice: string;
  nodeStatus: string;
}

export function StatsBar({ latestBlock, txCount, gasPrice, nodeStatus }: StatsBarProps) {
  const stats = [
    {
      icon: <Blocks className="w-4 h-4 text-primary" />,
      label: "Latest Block",
      value: latestBlock.toLocaleString(),
      color: "bg-primary/10",
    },
    {
      icon: <ArrowRightLeft className="w-4 h-4 text-violet-400" />,
      label: "Transactions",
      value: txCount.toLocaleString(),
      color: "bg-violet-400/10",
    },
    {
      icon: <Fuel className="w-4 h-4 text-amber-400" />,
      label: "Gas Price",
      value: nodeStatus === "running" ? gasPrice : "—",
      color: "bg-amber-400/10",
    },
    {
      icon: <Activity className="w-4 h-4 text-emerald-400" />,
      label: "Node Status",
      value: null as string | null,
      color: "bg-emerald-400/10",
    },
  ];

  return (
    <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 stagger-children">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 sm:gap-3 px-3 sm:px-6 py-4
              ${i < 3 ? "border-r border-border/50" : ""}
              ${i >= 2 ? "border-t border-border/50 sm:border-t-0" : ""}
              hover:bg-accent/20 transition-colors`}
          >
            <div className={`p-2 rounded-lg ${stat.color} flex-shrink-0`}>
              {stat.icon}
            </div>
            <div className="min-w-0">
              <div className="text-muted-foreground text-[10px] uppercase tracking-widest font-medium">
                {stat.label}
              </div>
              {stat.value !== null ? (
                <div className="text-foreground font-mono font-bold text-sm mt-0.5 truncate">
                  {stat.value}
                </div>
              ) : (
                <div className="mt-1">
                  <Badge
                    variant={nodeStatus === "running" ? "default" : nodeStatus === "error" ? "destructive" : "secondary"}
                    className="text-[10px] px-2 py-0 rounded-full font-mono tracking-wider"
                  >
                    {nodeStatus.toUpperCase()}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
