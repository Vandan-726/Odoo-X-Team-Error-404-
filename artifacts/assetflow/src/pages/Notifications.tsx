import { useState } from "react";
import { 
  useListNotifications, 
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useListActivityLogs,
  getListNotificationsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Bell, Check, AlertTriangle, ArrowRightLeft, CalendarRange, Info, Activity, Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, parseISO } from "date-fns";

export default function Notifications() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  
  const { data: notifications, isLoading: isLoadingNotifs } = useListNotifications({ filter: filter !== "all" ? filter : undefined }, { query: { refetchInterval: 15000 } });
  const { data: activityLogs, isLoading: isLoadingLogs } = useListActivityLogs({ limit: 50 });

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'alert': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'approval': return <Check className="w-4 h-4 text-primary" />;
      case 'transfer': return <ArrowRightLeft className="w-4 h-4 text-accent" />;
      case 'booking': return <CalendarRange className="w-4 h-4 text-chart-5" />;
      default: return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">COMMUNICATIONS</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">System Alerts & Audit Trail</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* NOTIFICATIONS */}
        <Card className="bg-card border-card-border flex flex-col h-[calc(100vh-12rem)]">
          <CardHeader className="py-4 border-b border-white/5 bg-black/20 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-sm tracking-widest text-muted-foreground uppercase flex items-center gap-2">
                <Bell className="w-4 h-4" /> Action Items
                {unreadCount > 0 && <Badge variant="outline" className="bg-primary text-black border-primary px-1.5 py-0 text-[10px]">{unreadCount}</Badge>}
              </CardTitle>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 font-mono text-[10px] hover:bg-white/10" onClick={handleMarkAllRead} disabled={markAllRead.isPending}>
                  CLEAR QUEUE
                </Button>
              )}
            </div>
            
            <div className="flex gap-2 mt-4 overflow-x-auto custom-scrollbar pb-1">
              {['all', 'alert', 'transfer', 'booking'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 font-mono text-[10px] uppercase rounded-full border transition-colors whitespace-nowrap ${filter === f ? 'bg-white text-black border-white' : 'bg-transparent text-muted-foreground border-white/10 hover:border-white/30'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </CardHeader>
          
          <CardContent className="p-0 overflow-y-auto flex-1">
            {isLoadingNotifs ? (
               <div className="p-8 text-center font-mono text-xs text-muted-foreground uppercase">LOADING QUEUE...</div>
            ) : notifications?.length === 0 ? (
               <div className="p-8 text-center font-mono text-xs text-muted-foreground uppercase opacity-50 flex flex-col items-center gap-2">
                 <Check className="w-8 h-8" />
                 QUEUE IS EMPTY
               </div>
            ) : (
              <div className="flex flex-col">
                {notifications?.map(n => (
                  <div key={n.id} className={`flex gap-3 p-4 border-b border-white/5 transition-colors hover:bg-white/5 ${!n.isRead ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent opacity-70'}`}>
                    <div className="shrink-0 mt-0.5">{getIcon(n.type)}</div>
                    <div className="flex-1 space-y-1">
                      <p className={`text-sm leading-tight ${!n.isRead ? 'font-bold' : ''}`}>{n.message}</p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">{formatDistanceToNow(parseISO(n.createdAt))} ago</span>
                        {n.referenceType && <span className="font-mono text-[9px] uppercase px-1 rounded bg-black/40 text-muted-foreground">{n.referenceType} #{n.referenceId}</span>}
                      </div>
                    </div>
                    {!n.isRead && (
                      <button onClick={() => handleMarkRead(n.id)} className="shrink-0 h-6 w-6 rounded-full border border-primary/50 text-primary flex items-center justify-center hover:bg-primary hover:text-black transition-colors" title="Mark read">
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ACTIVITY LOG */}
        <Card className="bg-card border-card-border flex flex-col h-[calc(100vh-12rem)]">
          <CardHeader className="py-4 border-b border-white/5 bg-black/20 shrink-0">
            <CardTitle className="font-mono text-sm tracking-widest text-muted-foreground uppercase flex items-center gap-2">
              <Activity className="w-4 h-4" /> Global Audit Trail
            </CardTitle>
          </CardHeader>
          
          <CardContent className="p-0 overflow-y-auto flex-1 bg-black/40">
            {isLoadingLogs ? (
               <div className="p-8 text-center font-mono text-xs text-muted-foreground uppercase">LOADING REGISTRY...</div>
            ) : activityLogs?.length === 0 ? (
               <div className="p-8 text-center font-mono text-xs text-muted-foreground uppercase">NO AUDIT LOGS FOUND</div>
            ) : (
              <div className="p-4 space-y-4">
                {activityLogs?.map((log, i) => (
                  <div key={log.id} className="relative pl-6">
                    {/* Timeline line */}
                    {i !== activityLogs.length - 1 && (
                      <div className="absolute left-[11px] top-4 bottom-[-16px] w-px bg-white/10" />
                    )}
                    {/* Timeline dot */}
                    <div className="absolute left-[8px] top-1.5 w-[7px] h-[7px] rounded-full bg-muted-foreground/30 border border-black" />
                    
                    <div className="bg-card border border-white/5 rounded p-3 text-sm flex flex-col gap-1">
                      <div className="flex justify-between items-start gap-4">
                        <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDistanceToNow(parseISO(log.createdAt))} ago
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground/50" title={log.entryHash}>HASH:{log.entryHash.substring(0,8)}</span>
                      </div>
                      <p>
                        <span className="font-bold">{log.userName || 'System'}</span>
                        {' '}
                        <span className="text-muted-foreground">{log.action.replace(/_/g, ' ')}</span>
                        {' '}
                        <span className="font-mono text-accent text-xs uppercase px-1 py-0.5 bg-accent/10 rounded border border-accent/20 mx-1">{log.entityType}</span>
                        {log.entityId && <span className="font-mono text-xs text-muted-foreground">#{log.entityId}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}