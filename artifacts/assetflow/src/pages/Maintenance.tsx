import { useState } from "react";
import { 
  useListMaintenanceRequests, 
  useCreateMaintenanceRequest,
  useApproveMaintenanceRequest,
  useRejectMaintenanceRequest,
  useAssignTechnician,
  useResolveMaintenanceRequest,
  useListAssets,
  useGetMe,
  getListMaintenanceRequestsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Wrench, Plus, AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, UserCog, UserCircle2, Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";

const maintenanceSchema = z.object({
  assetId: z.coerce.number().min(1, "Asset is required"),
  issueDescription: z.string().min(5, "Please provide a descriptive issue"),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

const assignSchema = z.object({
  assignedTechnician: z.string().min(1, "Technician name is required"),
});

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-destructive text-white border-destructive",
  high: "bg-[#ff6a00] text-white border-[#ff6a00]",
  medium: "bg-chart-3 text-black border-chart-3",
  low: "bg-muted text-muted-foreground border-muted-foreground",
};

export default function Maintenance() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isManager = me?.role === "admin" || me?.role === "asset_manager";

  const { data: requests, isLoading } = useListMaintenanceRequests();
  const { data: assets } = useListAssets();

  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpenId, setAssignOpenId] = useState<number | null>(null);

  const createReq = useCreateMaintenanceRequest();
  const approveReq = useApproveMaintenanceRequest();
  const rejectReq = useRejectMaintenanceRequest();
  const assignTech = useAssignTechnician();
  const resolveReq = useResolveMaintenanceRequest();

  const createForm = useForm<z.infer<typeof maintenanceSchema>>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: { issueDescription: "", priority: "medium" },
  });

  const assignForm = useForm<z.infer<typeof assignSchema>>({
    resolver: zodResolver(assignSchema),
    defaultValues: { assignedTechnician: "" },
  });

  const onCreate = (values: z.infer<typeof maintenanceSchema>) => {
    createReq.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMaintenanceRequestsQueryKey() });
          setCreateOpen(false);
          createForm.reset();
          toast.success("Maintenance ticket generated");
        },
        onError: (err: any) => toast.error(err.message || "Failed to create ticket"),
      }
    );
  };

  const onAssign = (id: number, values: z.infer<typeof assignSchema>) => {
    assignTech.mutate(
      { id, data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMaintenanceRequestsQueryKey() });
          setAssignOpenId(null);
          assignForm.reset();
          toast.success("Technician dispatched");
        },
      }
    );
  };

  const handleAction = (id: number, action: 'approve' | 'reject' | 'resolve', mutation: any) => {
    mutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMaintenanceRequestsQueryKey() });
          toast.success(`Ticket marked as ${action}d`);
        }
      }
    );
  };

  // Group by status for Kanban
  const columns = [
    { id: "pending", title: "PENDING REVIEW" },
    { id: "approved", title: "APPROVED (UNASSIGNED)" },
    { id: "technician_assigned", title: "DISPATCHED" },
    { id: "in_progress", title: "IN PROGRESS" },
    { id: "resolved", title: "RESOLVED" },
  ];

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">REPAIR & MAINTENANCE</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">Service Tickets Kanban</p>
        </div>
        
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono tracking-wider bg-destructive text-white hover:bg-destructive/90 shadow-[0_0_15px_rgba(82,0,255,0.4)]">
              <AlertTriangle className="mr-2 h-4 w-4" /> REPORT ISSUE
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-mono tracking-widest text-destructive uppercase">NEW SERVICE TICKET</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="assetId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Select Asset</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                        <FormControl>
                          <SelectTrigger className="bg-black/40 border-white/10 font-mono text-sm">
                            <SelectValue placeholder="SEARCH REGISTRY..." />
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
                <FormField
                  control={createForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Severity Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="bg-black/40 border-white/10 font-mono text-sm uppercase">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="critical" className="text-destructive font-bold">CRITICAL (OUTAGE)</SelectItem>
                          <SelectItem value="high" className="text-[#ff6a00]">HIGH</SelectItem>
                          <SelectItem value="medium" className="text-primary">MEDIUM</SelectItem>
                          <SelectItem value="low">LOW</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="issueDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Malfunction Details</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Describe the failure mode..." {...field} className="bg-black/40 border-white/10 min-h-[100px]" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full font-mono tracking-widest" disabled={createReq.isPending}>
                  {createReq.isPending ? "TRANSMITTING..." : "SUBMIT TICKET"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center font-mono text-muted-foreground">LOADING KANBAN DATA...</div>
        ) : (
          columns.map(col => {
            const columnRequests = requests?.filter(r => r.status === col.id) || [];
            
            return (
              <div key={col.id} className="flex-shrink-0 w-[300px] flex flex-col gap-3 bg-black/20 rounded-xl border border-white/5 p-3">
                <div className="flex items-center justify-between font-mono text-xs tracking-widest text-muted-foreground border-b border-white/5 pb-2">
                  <span>{col.title}</span>
                  <Badge variant="outline" className="bg-black/50 border-none px-1.5 py-0">{columnRequests.length}</Badge>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {columnRequests.map(req => (
                    <Card key={req.id} className="bg-card border-card-border shadow-sm hover:border-white/20 transition-colors cursor-default">
                      <CardHeader className="p-3 pb-0 space-y-0">
                        <div className="flex justify-between items-start">
                          <Badge variant="outline" className={`font-mono text-[10px] uppercase px-1.5 py-0 border ${PRIORITY_COLORS[req.priority]}`}>
                            {req.priority}
                          </Badge>
                          <span className="font-mono text-[10px] text-muted-foreground">TKT-{req.id}</span>
                        </div>
                        <CardTitle className="text-sm font-bold mt-2 leading-tight">
                          {req.assetName}
                        </CardTitle>
                        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{req.assetTag}</div>
                      </CardHeader>
                      <CardContent className="p-3 py-2 text-xs text-muted-foreground line-clamp-3">
                        {req.issueDescription}
                      </CardContent>
                      
                      <div className="px-3 py-2 bg-black/20 border-t border-white/5 text-[10px] font-mono flex items-center justify-between">
                         <div className="flex items-center gap-1 text-muted-foreground">
                           <UserCircle2 className="w-3 h-3" /> {req.raisedByName?.split(' ')[0]}
                         </div>
                         <div className="flex items-center gap-1 text-muted-foreground">
                           <Clock className="w-3 h-3" /> {formatDistanceToNow(parseISO(req.createdAt))}
                         </div>
                      </div>
                      
                      {/* Action Area */}
                      {isManager && req.status === 'pending' && (
                        <CardFooter className="p-2 flex gap-2 border-t border-white/5 bg-black/40">
                          <Button size="sm" variant="ghost" className="flex-1 h-7 text-[10px] font-mono hover:bg-destructive hover:text-white" onClick={() => handleAction(req.id, 'reject', rejectReq)} disabled={rejectReq.isPending}>REJECT</Button>
                          <Button size="sm" className="flex-1 h-7 text-[10px] font-mono bg-primary text-black hover:bg-primary/80" onClick={() => handleAction(req.id, 'approve', approveReq)} disabled={approveReq.isPending}>APPROVE</Button>
                        </CardFooter>
                      )}
                      
                      {isManager && req.status === 'approved' && (
                        <CardFooter className="p-2 border-t border-white/5 bg-black/40">
                          <Dialog open={assignOpenId === req.id} onOpenChange={(open) => !open && setAssignOpenId(null)}>
                            <DialogTrigger asChild>
                              <Button size="sm" className="w-full h-7 text-[10px] font-mono" onClick={() => setAssignOpenId(req.id)}>
                                <UserCog className="w-3 h-3 mr-1" /> DISPATCH TECH
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="border-border bg-card">
                              <DialogHeader>
                                <DialogTitle className="font-mono tracking-widest uppercase">DISPATCH TECHNICIAN</DialogTitle>
                              </DialogHeader>
                              <Form {...assignForm}>
                                <form onSubmit={assignForm.handleSubmit((v) => onAssign(req.id, v))} className="space-y-4">
                                  <FormField
                                    control={assignForm.control}
                                    name="assignedTechnician"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Technician Name/ID</FormLabel>
                                        <FormControl>
                                          <Input placeholder="e.g. T-800" {...field} className="bg-black/40 border-white/10 uppercase font-mono" />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <Button type="submit" className="w-full font-mono tracking-widest text-xs uppercase bg-accent text-white hover:bg-accent/90" disabled={assignTech.isPending}>CONFIRM DISPATCH</Button>
                                </form>
                              </Form>
                            </DialogContent>
                          </Dialog>
                        </CardFooter>
                      )}

                      {isManager && req.status === 'in_progress' && (
                        <CardFooter className="p-2 border-t border-white/5 bg-black/40">
                          <Button size="sm" className="w-full h-7 text-[10px] font-mono bg-chart-5 text-black hover:bg-chart-5/80" onClick={() => handleAction(req.id, 'resolve', resolveReq)} disabled={resolveReq.isPending}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> MARK RESOLVED
                          </Button>
                        </CardFooter>
                      )}
                      
                      {req.assignedTechnician && req.status !== 'resolved' && (
                         <div className="p-2 border-t border-white/5 bg-accent/10 text-accent font-mono text-[10px] text-center uppercase border-t-accent/20">
                           TECH: {req.assignedTechnician}
                         </div>
                      )}
                    </Card>
                  ))}
                  
                  {columnRequests.length === 0 && (
                    <div className="text-center p-4 text-[10px] font-mono text-muted-foreground/50 border border-dashed border-white/5 rounded">EMPTY</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}