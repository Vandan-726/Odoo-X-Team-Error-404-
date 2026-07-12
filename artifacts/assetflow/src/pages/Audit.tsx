import { useState } from "react";
import { 
  useListAuditCycles, 
  useCreateAuditCycle,
  useGetAuditCycle,
  useVerifyAuditItem,
  useCloseAuditCycle,
  useListDepartments,
  getListAuditCyclesQueryKey,
  getGetAuditCycleQueryKey,
  useGetMe
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  ClipboardCheck, Plus, Search, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Lock, ShieldAlert
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const createSchema = z.object({
  name: z.string().min(1, "Cycle name is required"),
  scopeDepartmentId: z.coerce.number().optional().nullable(),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().min(1, "End date required"),
});

export default function Audit() {
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: cycles, isLoading: isLoadingCycles } = useListAuditCycles();
  const { data: departments } = useListDepartments();
  const { data: activeCycle, isLoading: isLoadingCycle } = useGetAuditCycle(selectedCycleId || 0, {
    query: { enabled: !!selectedCycleId } as any
  });

  const createCycle = useCreateAuditCycle();
  const verifyItem = useVerifyAuditItem();
  const closeCycle = useCloseAuditCycle();

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0],
    }
  });

  if (me?.role === "employee") {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold tracking-tight">RESTRICTED ACCESS</h2>
        <p className="text-muted-foreground font-mono text-sm uppercase max-w-md">
          Asset Audits are restricted to management personnel. Your current clearance level ({me?.role}) does not grant access to this module.
        </p>
      </div>
    );
  }

  const onCreate = (values: z.infer<typeof createSchema>) => {
    createCycle.mutate(
      { data: { ...values, scopeDepartmentId: values.scopeDepartmentId || null } },
      {
        onSuccess: (newCycle) => {
          queryClient.invalidateQueries({ queryKey: getListAuditCyclesQueryKey() });
          setCreateOpen(false);
          setSelectedCycleId(newCycle.id);
          form.reset();
          toast.success("Audit cycle initialized");
        },
        onError: (err: any) => toast.error(err.message || "Failed to create audit cycle"),
      }
    );
  };

  const handleVerify = (itemId: number, status: string) => {
    verifyItem.mutate(
      { id: selectedCycleId!, itemId, data: { verificationStatus: status as any } },
      {
        onSuccess: () => {
          // Patch cache locally to avoid full refetch jumping
          queryClient.setQueryData(getGetAuditCycleQueryKey(selectedCycleId!), (old: any) => {
            if (!old) return old;
            const updatedItems = old.items.map((i: any) => 
              i.id === itemId ? { ...i, verificationStatus: status } : i
            );
            // Recompute summary
            const newSummary = {
              total: old.summary.total,
              verified: updatedItems.filter((i:any) => i.verificationStatus === 'verified').length,
              missing: updatedItems.filter((i:any) => i.verificationStatus === 'missing').length,
              damaged: updatedItems.filter((i:any) => i.verificationStatus === 'damaged').length,
              pending: updatedItems.filter((i:any) => i.verificationStatus === 'pending').length,
            };
            return { ...old, items: updatedItems, summary: newSummary };
          });
        },
        onError: (err: any) => toast.error(err.message || "Failed to update item"),
      }
    );
  };

  const handleClose = () => {
    if (!selectedCycleId) return;
    if (activeCycle?.summary?.pending && activeCycle.summary.pending > 0) {
      if (!confirm(`There are still ${activeCycle.summary.pending} pending items. Are you sure you want to close this audit?`)) return;
    }

    closeCycle.mutate(
      { id: selectedCycleId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAuditCycleQueryKey(selectedCycleId) });
          queryClient.invalidateQueries({ queryKey: getListAuditCyclesQueryKey() });
          toast.success("Audit cycle closed");
        },
        onError: (err: any) => toast.error(err.message || "Failed to close cycle"),
      }
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ASSET AUDIT</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">Verification & Compliance</p>
        </div>

        {(me?.role === "admin" || me?.role === "asset_manager") && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="font-mono tracking-wider bg-white text-black hover:bg-white/90">
                <Plus className="mr-2 h-4 w-4" /> INITIATE AUDIT
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle className="font-mono tracking-widest uppercase">INITIALIZE AUDIT CYCLE</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Cycle Designation</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Q3 2024 General Audit" {...field} className="bg-black/40 border-white/10 uppercase" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scopeDepartmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Scope (Department)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                          <FormControl>
                            <SelectTrigger className="bg-black/40 border-white/10 font-mono text-sm">
                              <SelectValue placeholder="ALL DEPARTMENTS" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">ALL DEPARTMENTS</SelectItem>
                            {departments?.map((d) => (
                              <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
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
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-black/40 border-white/10 [color-scheme:dark] font-mono text-xs" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">End Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} className="bg-black/40 border-white/10 [color-scheme:dark] font-mono text-xs" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button type="submit" className="w-full font-mono tracking-widest mt-4 bg-primary text-black hover:bg-primary/90" disabled={createCycle.isPending}>
                    GENERATE SNAPSHOT
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        {/* Left Col: Cycle List */}
        <Card className="xl:col-span-1 bg-card border-card-border h-[calc(100vh-12rem)] flex flex-col">
          <CardHeader className="py-4 border-b border-white/5 bg-black/20 shrink-0">
            <CardTitle className="font-mono text-sm tracking-widest text-muted-foreground uppercase flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> Audit History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto flex-1">
            {isLoadingCycles ? (
              <div className="p-8 text-center font-mono text-xs text-muted-foreground uppercase">LOADING...</div>
            ) : cycles?.length === 0 ? (
               <div className="p-8 text-center font-mono text-xs text-muted-foreground uppercase">NO RECORDS</div>
            ) : (
              <div className="flex flex-col">
                {cycles?.map(cycle => (
                  <button 
                    key={cycle.id} 
                    onClick={() => setSelectedCycleId(cycle.id)}
                    className={`flex flex-col gap-1 p-4 border-b border-white/5 text-left transition-colors ${selectedCycleId === cycle.id ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-white/5 border-l-2 border-l-transparent'}`}
                  >
                    <div className="font-bold text-sm truncate w-full">{cycle.name}</div>
                    <div className="flex items-center justify-between w-full">
                      <span className="font-mono text-[10px] text-muted-foreground">{format(parseISO(cycle.startDate), 'MMM d, yy')}</span>
                      <Badge variant="outline" className={`font-mono text-[8px] py-0 px-1 border ${
                        cycle.status === 'in_progress' ? 'bg-primary/20 text-primary border-primary/50' : 
                        cycle.status === 'planned' ? 'bg-muted text-muted-foreground' : 
                        'bg-white/10 text-white'
                      }`}>
                        {cycle.status.toUpperCase()}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Col: Cycle Details */}
        <Card className="xl:col-span-3 bg-card border-card-border h-[calc(100vh-12rem)] flex flex-col">
          {selectedCycleId ? (
            isLoadingCycle ? (
              <div className="flex-1 flex items-center justify-center font-mono text-sm text-muted-foreground uppercase">LOADING SNAPSHOT...</div>
            ) : activeCycle ? (
              <>
                <CardHeader className="py-4 border-b border-white/5 bg-black/20 shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={`font-mono text-[10px] py-0 border ${activeCycle.status === 'in_progress' ? 'bg-primary/20 text-primary border-primary' : 'bg-muted text-muted-foreground border-border'}`}>
                          {activeCycle.status.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">ID: {activeCycle.id}</span>
                      </div>
                      <CardTitle className="text-xl">{activeCycle.name}</CardTitle>
                      <CardDescription className="font-mono text-xs uppercase mt-1">
                        Scope: {activeCycle.scopeDepartmentName || 'ALL DEPARTMENTS'} • {format(parseISO(activeCycle.startDate), 'MMM d, yyyy')} to {format(parseISO(activeCycle.endDate), 'MMM d, yyyy')}
                      </CardDescription>
                    </div>
                    {activeCycle.status === 'in_progress' && (me?.role === "admin" || me?.role === "asset_manager") && (
                      <Button variant="outline" className="border-accent text-accent hover:bg-accent hover:text-white font-mono tracking-wider text-xs" onClick={handleClose} disabled={closeCycle.isPending}>
                        <Lock className="w-3 h-3 mr-2" /> CLOSE AUDIT
                      </Button>
                    )}
                  </div>

                  {/* Summary Bar */}
                  {activeCycle.summary && (
                    <div className="flex rounded-md overflow-hidden h-2 mt-6 bg-black/50">
                      <div className="bg-primary" style={{ width: `${(activeCycle.summary.verified / activeCycle.summary.total) * 100}%` }} title={`Verified: ${activeCycle.summary.verified}`} />
                      <div className="bg-chart-3" style={{ width: `${(activeCycle.summary.damaged / activeCycle.summary.total) * 100}%` }} title={`Damaged: ${activeCycle.summary.damaged}`} />
                      <div className="bg-destructive" style={{ width: `${(activeCycle.summary.missing / activeCycle.summary.total) * 100}%` }} title={`Missing: ${activeCycle.summary.missing}`} />
                      <div className="bg-muted" style={{ width: `${(activeCycle.summary.pending / activeCycle.summary.total) * 100}%` }} title={`Pending: ${activeCycle.summary.pending}`} />
                    </div>
                  )}
                  {activeCycle.summary && (
                    <div className="flex gap-4 mt-2 font-mono text-[10px] uppercase text-muted-foreground justify-between">
                      <div><span className="text-primary font-bold">{activeCycle.summary.verified}</span> VERIFIED</div>
                      <div><span className="text-chart-3 font-bold">{activeCycle.summary.damaged}</span> DAMAGED</div>
                      <div><span className="text-destructive font-bold">{activeCycle.summary.missing}</span> MISSING</div>
                      <div><span className="text-white font-bold">{activeCycle.summary.pending}</span> PENDING</div>
                      <div><span className="font-bold">{activeCycle.summary.total}</span> TOTAL</div>
                    </div>
                  )}
                </CardHeader>
                
                <CardContent className="p-0 overflow-auto flex-1">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10 shadow-sm border-b border-white/5">
                      <TableRow className="border-none hover:bg-transparent">
                        <TableHead className="font-mono text-[10px] uppercase tracking-widest pl-4">Asset Tag</TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-widest">Name</TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-widest">Location (Expected)</TableHead>
                        <TableHead className="font-mono text-[10px] uppercase tracking-widest w-[160px]">Verification</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeCycle.items?.map(item => (
                        <TableRow key={item.id} className="border-border/20 hover:bg-white/5 group">
                          <TableCell className="pl-4 font-mono font-bold text-xs">{item.assetTag}</TableCell>
                          <TableCell className="font-medium text-sm">{item.assetName}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{item.expectedLocation || 'Unassigned'}</TableCell>
                          <TableCell>
                            {activeCycle.status === 'in_progress' ? (
                              <Select 
                                value={item.verificationStatus} 
                                onValueChange={(val) => handleVerify(item.id, val)}
                              >
                                <SelectTrigger className={`h-8 font-mono text-[10px] uppercase border ${
                                  item.verificationStatus === 'verified' ? 'bg-primary/10 border-primary text-primary' :
                                  item.verificationStatus === 'missing' ? 'bg-destructive/10 border-destructive text-destructive' :
                                  item.verificationStatus === 'damaged' ? 'bg-chart-3/10 border-chart-3 text-chart-3' :
                                  'bg-black/40 border-white/10 text-muted-foreground'
                                }`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="font-mono text-[10px] uppercase">
                                  <SelectItem value="pending" className="text-muted-foreground">PENDING</SelectItem>
                                  <SelectItem value="verified" className="text-primary font-bold">VERIFIED</SelectItem>
                                  <SelectItem value="missing" className="text-destructive font-bold">MISSING</SelectItem>
                                  <SelectItem value="damaged" className="text-chart-3 font-bold">DAMAGED</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase">
                                {item.verificationStatus === 'verified' && <CheckCircle2 className="w-3 h-3 text-primary" />}
                                {item.verificationStatus === 'missing' && <XCircle className="w-3 h-3 text-destructive" />}
                                {item.verificationStatus === 'damaged' && <AlertTriangle className="w-3 h-3 text-chart-3" />}
                                {item.verificationStatus === 'pending' && <HelpCircle className="w-3 h-3 text-muted-foreground" />}
                                <span className={
                                  item.verificationStatus === 'verified' ? 'text-primary' :
                                  item.verificationStatus === 'missing' ? 'text-destructive' :
                                  item.verificationStatus === 'damaged' ? 'text-chart-3' : 'text-muted-foreground'
                                }>
                                  {item.verificationStatus}
                                </span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </>
            ) : null
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Search className="w-12 h-12 mb-4" />
              <div className="font-mono uppercase tracking-widest text-sm">SELECT A CYCLE TO VIEW</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}