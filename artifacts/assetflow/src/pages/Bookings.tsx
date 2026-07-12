import { useState } from "react";
import { 
  useListBookings, 
  useCreateBooking,
  useCancelBooking,
  useListAssets,
  useGetMe,
  getListBookingsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  CalendarRange, Plus, Clock, Ban, ChevronLeft, ChevronRight, CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, addDays, subDays, parseISO, isSameDay } from "date-fns";

const bookingSchema = z.object({
  assetId: z.coerce.number().min(1, "Asset is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  purpose: z.string().optional().nullable(),
});

export default function Bookings() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAsset, setSelectedAsset] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const dateStr = format(currentDate, 'yyyy-MM-dd');
  
  const { data: bookings, isLoading } = useListBookings({ 
    date: dateStr,
    assetId: selectedAsset !== "all" ? parseInt(selectedAsset) : undefined
  });
  
  // Only fetch bookable assets
  const { data: bookableAssets } = useListAssets({ search: "" }); // Ideal API would let us filter by isBookable=true, filtering client-side for now
  const assets = bookableAssets?.filter(a => a.isBookable) || [];

  const createBooking = useCreateBooking();
  const cancelBooking = useCancelBooking();

  const form = useForm<z.infer<typeof bookingSchema>>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { 
      assetId: selectedAsset !== "all" ? parseInt(selectedAsset) : undefined,
      startTime: `${dateStr}T09:00`,
      endTime: `${dateStr}T10:00`,
      purpose: ""
    },
  });

  const onSubmit = (values: z.infer<typeof bookingSchema>) => {
    // Basic local validation
    if (new Date(values.endTime) <= new Date(values.startTime)) {
      toast.error("End time must be after start time");
      return;
    }

    createBooking.mutate(
      { data: {
          ...values,
          startTime: new Date(values.startTime).toISOString(),
          endTime: new Date(values.endTime).toISOString(),
          departmentId: me?.departmentId || null,
          purpose: values.purpose || null
      } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          setCreateOpen(false);
          toast.success("Booking confirmed");
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to create booking");
        },
      }
    );
  };

  const handleCancel = (id: number) => {
    cancelBooking.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
          toast.success("Booking cancelled");
        },
        onError: (err: any) => toast.error(err.message || "Failed to cancel booking"),
      }
    );
  };

  const hours = Array.from({ length: 15 }, (_, i) => i + 6); // 6 AM to 8 PM

  // Calculate left/width for absolute positioning of blocks
  const getBlockStyle = (startStr: string, endStr: string) => {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    
    // Only show blocks for the current day view
    if (!isSameDay(start, currentDate) && !isSameDay(end, currentDate)) return { display: 'none' };
    
    // Default to start/end of view day if span crosses midnight
    const viewStart = new Date(currentDate); viewStart.setHours(6, 0, 0, 0);
    const viewEnd = new Date(currentDate); viewEnd.setHours(21, 0, 0, 0);
    
    const effectiveStart = start < viewStart ? viewStart : start;
    const effectiveEnd = end > viewEnd ? viewEnd : end;

    const startMinutes = (effectiveStart.getHours() - 6) * 60 + effectiveStart.getMinutes();
    const durationMinutes = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);

    const left = `${(startMinutes / (15 * 60)) * 100}%`;
    const width = `${(durationMinutes / (15 * 60)) * 100}%`;

    return { left, width };
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RESOURCE SCHEDULER</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">Bookable equipment & spaces</p>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono tracking-wider bg-white text-black hover:bg-white/90">
              <Plus className="mr-2 h-4 w-4" /> NEW BOOKING
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-mono tracking-widest uppercase">RESERVE RESOURCE</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="assetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Resource</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                        <FormControl>
                          <SelectTrigger className="bg-black/40 border-white/10 font-mono text-sm">
                            <SelectValue placeholder="SELECT RESOURCE..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {assets?.map((a) => (
                            <SelectItem key={a.id} value={a.id.toString()}>{a.assetTag} - {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Start Time</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} className="bg-black/40 border-white/10 [color-scheme:dark] font-mono text-xs" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">End Time</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} className="bg-black/40 border-white/10 [color-scheme:dark] font-mono text-xs" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Purpose (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Client presentation" {...field} value={field.value || ''} className="bg-black/40 border-white/10" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full font-mono tracking-widest mt-2" disabled={createBooking.isPending}>
                  {createBooking.isPending ? "PROCESSING..." : "CONFIRM RESERVATION"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-card-border overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 bg-black/20 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" onClick={() => setCurrentDate(subDays(currentDate, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-[140px] text-center font-mono font-bold tracking-widest text-sm">
                {format(currentDate, 'MMM d, yyyy').toUpperCase()}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white" onClick={() => setCurrentDate(addDays(currentDate, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="ml-2 h-7 font-mono text-[10px] px-2 py-0" onClick={() => setCurrentDate(new Date())}>TODAY</Button>
            </div>
          </div>
          
          <Select value={selectedAsset} onValueChange={setSelectedAsset}>
            <SelectTrigger className="w-[250px] h-8 bg-black/40 border-white/10 font-mono text-xs uppercase">
              <SelectValue placeholder="FILTER RESOURCE" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL RESOURCES</SelectItem>
              {assets?.map((a) => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Timeline Header */}
            <div className="flex border-b border-white/5 bg-black/40 pl-[180px]">
              {hours.map(h => (
                <div key={h} className="flex-1 min-w-[60px] text-center py-2 text-[10px] font-mono text-muted-foreground border-l border-white/5">
                  {h}:00
                </div>
              ))}
            </div>
            
            {/* Timeline Rows */}
            {isLoading ? (
              <div className="text-center p-12 font-mono text-muted-foreground uppercase text-sm">LOADING SCHEDULE...</div>
            ) : assets.length === 0 ? (
               <div className="text-center p-12 font-mono text-muted-foreground uppercase text-sm">NO BOOKABLE RESOURCES FOUND</div>
            ) : (
              (selectedAsset === "all" ? assets : assets.filter(a => a.id.toString() === selectedAsset)).map(asset => {
                const assetBookings = bookings?.filter(b => b.assetId === asset.id && b.status !== 'cancelled') || [];
                
                return (
                  <div key={asset.id} className="flex border-b border-white/5 relative group hover:bg-white/5 transition-colors">
                    {/* Resource Name */}
                    <div className="w-[180px] shrink-0 border-r border-white/5 p-3 flex flex-col justify-center bg-card z-10">
                      <div className="font-bold text-xs truncate">{asset.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{asset.assetTag}</div>
                    </div>
                    
                    {/* Grid Background */}
                    <div className="flex-1 flex relative">
                      {hours.map(h => (
                        <div key={h} className="flex-1 border-l border-white/5 border-dashed" />
                      ))}
                      
                      {/* Booking Blocks */}
                      {assetBookings.map(b => {
                        const style = getBlockStyle(b.startTime, b.endTime);
                        if (style.display === 'none') return null;
                        
                        const isOwn = b.bookedBy === me?.id;
                        const isOngoing = b.status === 'ongoing';
                        
                        return (
                          <div 
                            key={b.id} 
                            className={`absolute top-[4px] bottom-[4px] rounded px-2 py-1 overflow-hidden shadow-sm flex flex-col justify-center
                              ${isOngoing ? 'bg-accent/20 border-l-2 border-l-accent' : 
                                isOwn ? 'bg-primary text-black border border-primary/20' : 
                                'bg-chart-5 text-black border border-chart-5/20'}
                            `}
                            style={style}
                            title={`${b.bookedByName || 'System'}: ${b.purpose || 'No purpose'}\n${format(parseISO(b.startTime), 'HH:mm')} - ${format(parseISO(b.endTime), 'HH:mm')}`}
                          >
                            <div className={`font-bold text-[10px] truncate leading-tight ${isOngoing ? 'text-accent' : 'text-black'}`}>
                              {b.bookedByName?.split(' ')[0]}
                            </div>
                            {parseFloat(style.width) > 5 && (
                              <div className={`font-mono text-[9px] truncate leading-tight opacity-80 ${isOngoing ? 'text-accent/80' : 'text-black/80'}`}>
                                {b.purpose || 'Reserved'}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* My Upcoming Bookings */}
      <Card className="bg-card border-card-border">
        <CardHeader className="py-4">
          <CardTitle className="font-mono text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Clock className="w-4 h-4" /> My Upcoming Reservations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookings?.filter(b => b.bookedBy === me?.id && (b.status === 'upcoming' || b.status === 'ongoing')).map(b => (
              <div key={b.id} className="bg-black/20 border border-white/10 p-3 rounded-lg flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div className="font-bold">{b.assetName}</div>
                  <Badge variant="outline" className={`font-mono text-[9px] py-0 px-1 ${b.status === 'ongoing' ? 'bg-accent/20 text-accent border-accent/30' : 'bg-white/10 text-muted-foreground border-white/20'}`}>
                    {b.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {format(parseISO(b.startTime), 'MMM d • HH:mm')} - {format(parseISO(b.endTime), 'HH:mm')}
                </div>
                {b.purpose && <div className="text-xs italic text-muted-foreground mt-1">"{b.purpose}"</div>}
                
                <div className="mt-2 flex justify-end">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] font-mono text-destructive hover:text-white hover:bg-destructive" onClick={() => handleCancel(b.id)} disabled={cancelBooking.isPending}>
                    <Ban className="w-3 h-3 mr-1" /> CANCEL
                  </Button>
                </div>
              </div>
            ))}
            
            {(!bookings || bookings.filter(b => b.bookedBy === me?.id && (b.status === 'upcoming' || b.status === 'ongoing')).length === 0) && (
              <div className="col-span-full text-center py-6 font-mono text-xs text-muted-foreground uppercase border border-dashed border-white/10 rounded-lg">
                NO UPCOMING RESERVATIONS
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}