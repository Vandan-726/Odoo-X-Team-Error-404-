import { useEffect } from "react";
import { useGetDashboardStats, useListOverdueAllocations, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { 
  PackageSearch, 
  ArrowRightLeft, 
  CalendarRange, 
  Wrench,
  AlertTriangle,
  Clock,
  ArrowUpRight
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

export default function Dashboard() {
  const { data: me } = useGetMe();
  const isDeptHead = me?.role === "department_head";
  const isManager = me?.role === "admin" || me?.role === "asset_manager";
  const { data: stats, isLoading: isStatsLoading } = useGetDashboardStats({ query: { refetchInterval: 30000 } });
  const { data: overdue, isLoading: isOverdueLoading } = useListOverdueAllocations({ query: { refetchInterval: 30000 } });

  const kpiLabel = (base: string) => isDeptHead ? `DEPT ${base}` : base;
  const kpis = [
    { label: kpiLabel("AVAILABLE"), value: stats?.availableAssets || 0, total: stats?.totalAssets },
    { label: kpiLabel("ALLOCATED"), value: stats?.allocatedAssets || 0 },
    { label: "MAINTENANCE TODAY", value: stats?.maintenanceToday || 0 },
    { label: kpiLabel("BOOKINGS"), value: stats?.activeBookings || 0 },
    { label: isDeptHead ? "PENDING APPROVALS" : "PENDING TRANSFERS", value: stats?.pendingTransfers || 0, highlight: isDeptHead && (stats?.pendingTransfers || 0) > 0 },
    { label: kpiLabel("UPCOMING RETURNS"), value: stats?.upcomingReturns || 0 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">OPERATIONS CENTER</h1>
        <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">System Overview & Activity</p>
      </div>

      {/* OVERDUE ALERTS */}
      {!isOverdueLoading && Array.isArray(overdue) && overdue.length > 0 && (
        <Card className="border-destructive border-2 bg-destructive/5 shadow-[0_0_15px_rgba(82,0,255,0.2)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-destructive font-mono uppercase tracking-widest flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              CRITICAL: Overdue Returns ({overdue.length})
            </CardTitle>
            <Button variant="outline" size="sm" className="border-destructive text-destructive hover:bg-destructive hover:text-white font-mono uppercase text-xs" asChild>
              <Link href="/allocations">Resolve</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {overdue.slice(0, 3).map((allocation) => (
                <div key={allocation.id} className="bg-background border border-destructive/30 p-3 rounded-md flex flex-col gap-1">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm truncate pr-2">{allocation.assetName}</span>
                    <Badge variant="outline" className="text-[10px] font-mono border-destructive text-destructive bg-destructive/10 px-1.5 py-0">
                      {allocation.assetTag}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">Held by: <span className="text-foreground">{allocation.employeeName}</span></div>
                  <div className="text-xs text-destructive font-mono flex items-center gap-1 mt-1">
                    <Clock className="h-3 w-3" />
                    Overdue by {formatDistanceToNow(parseISO(allocation.expectedReturnDate!))}
                  </div>
                </div>
              ))}
              {overdue.length > 3 && (
                <div className="bg-background/50 border border-dashed border-destructive/30 p-3 rounded-md flex items-center justify-center text-xs font-mono text-destructive uppercase tracking-wider cursor-pointer hover:bg-destructive/10 transition-colors">
                  <Link href="/allocations">+ {overdue.length - 3} MORE</Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi, idx) => (
          <Card key={idx} className={`bg-card overflow-hidden group ${(kpi as any)?.highlight ? 'border-accent/50' : 'border-card-border'}`}>
            <CardContent className="p-5 flex flex-col justify-between h-full relative">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">{kpi.label}</div>
              <div className="flex items-end gap-2 mt-auto">
                <div className={`text-4xl font-bold font-mono tracking-tighter group-hover:text-primary transition-colors ${(kpi as any).highlight ? 'text-accent' : ''}`}>
                  {isStatsLoading ? "-" : kpi.value}
                </div>
                {kpi.total !== undefined && (
                  <div className="text-sm font-mono text-muted-foreground mb-1">/ {kpi.total}</div>
                )}
              </div>
              <div className="absolute -bottom-4 -right-4 h-16 w-16 bg-white/5 rounded-full blur-xl group-hover:bg-primary/20 transition-colors" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* QUICK ACTIONS */}
      <div className="flex flex-wrap gap-3">
        <Button className="rounded-full bg-card hover:bg-card/80 text-foreground border border-border h-12 px-6 font-mono uppercase tracking-wider text-xs" asChild>
          <Link href="/assets?new=true">
            <PackageSearch className="mr-2 h-4 w-4 text-primary" />
            Register Asset
          </Link>
        </Button>
        <Button className="rounded-full bg-card hover:bg-card/80 text-foreground border border-border h-12 px-6 font-mono uppercase tracking-wider text-xs" asChild>
          <Link href="/allocations">
            <ArrowRightLeft className="mr-2 h-4 w-4 text-primary" />
            New Allocation
          </Link>
        </Button>
        <Button className="rounded-full bg-card hover:bg-card/80 text-foreground border border-border h-12 px-6 font-mono uppercase tracking-wider text-xs" asChild>
          <Link href="/bookings">
            <CalendarRange className="mr-2 h-4 w-4 text-primary" />
            Book Resource
          </Link>
        </Button>
        <Button className="rounded-full bg-card hover:bg-card/80 text-foreground border border-border h-12 px-6 font-mono uppercase tracking-wider text-xs text-destructive hover:text-destructive hover:border-destructive" asChild>
          <Link href="/maintenance?new=true">
            <Wrench className="mr-2 h-4 w-4" />
            Report Issue
          </Link>
        </Button>
      </div>

      {/* RECENT ACTIVITY */}
      <Card className="border-card-border">
        <CardHeader>
          <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground">ACTIVITY LOG</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {isStatsLoading ? (
              <div className="text-center p-8 text-muted-foreground font-mono text-sm uppercase">Loading Feed...</div>
            ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((log, i) => (
                <div key={log.id} className={`flex gap-4 p-4 hover:bg-white/5 transition-colors ${i !== stats.recentActivity!.length - 1 ? 'border-b border-white/5' : ''}`}>
                  <div className="w-24 shrink-0 pt-0.5 text-[10px] font-mono text-muted-foreground uppercase">
                    {formatDistanceToNow(parseISO(log.createdAt))} ago
                  </div>
                  <div className="w-3 shrink-0 flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                    {i !== stats.recentActivity!.length - 1 && <div className="w-px h-full bg-white/10 mt-2" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className="text-sm">
                      <span className="font-bold">{log.userName || 'System'}</span>
                      {' '}
                      <span className="text-muted-foreground">{log.action.replace(/_/g, ' ')}</span>
                      {' '}
                      <span className="font-mono text-primary text-xs uppercase px-1 py-0.5 bg-primary/10 rounded">{log.entityType}</span>
                      {log.entityId && <span className="font-mono text-xs text-muted-foreground ml-1">#{log.entityId}</span>}
                    </p>
                  </div>
                  <div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" asChild>
                      <Link href={`/${log.entityType.toLowerCase()}s`}>
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center p-8 text-muted-foreground font-mono text-sm uppercase">No recent activity</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}