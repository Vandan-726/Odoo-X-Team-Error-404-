import { useState } from "react";
import { 
  useListAllocations, 
  useListTransferRequests,
  useCreateAllocation,
  useReturnAllocation,
  useApproveTransferRequest,
  useRejectTransferRequest,
  useListAssets,
  useListUsers,
  getListAllocationsQueryKey,
  getListAssetsQueryKey,
  getListTransferRequestsQueryKey,
  useGetMe
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  ArrowRightLeft, ArrowLeftRight, Check, X, Clock, CornerDownLeft, FileSignature, AlertTriangle, ChevronRight, ShieldCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

const allocateSchema = z.object({
  assetId: z.coerce.number().min(1, "Asset is required"),
  employeeId: z.coerce.number().min(1, "Employee is required"),
  expectedReturnDate: z.string().optional().nullable(),
});

const returnSchema = z.object({
  returnConditionNotes: z.string().optional().nullable(),
});

export default function Allocations() {
  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isManager = me?.role === "admin" || me?.role === "asset_manager";
  const isDeptHead = me?.role === "department_head";
  const canIssue = isManager || isDeptHead;

  const { data: allocations, isLoading: isLoadingAllocations } = useListAllocations({ status: "active" });
  const { data: history } = useListAllocations({ status: "returned" });
  const { data: pendingTransfers, isLoading: isLoadingTransfers } = useListTransferRequests({ status: "requested" });

  // For dept_head: scope available assets to their department; for managers: all available
  const assetParams: any = { status: "available" };
  if (isDeptHead && me?.departmentId) assetParams.department = me.departmentId;
  const { data: assets } = useListAssets(assetParams);

  const { data: allUsers } = useListUsers();
  // For dept_head: only show employees in their own department
  const users = isDeptHead && me?.departmentId
    ? (allUsers?.filter(u => u.departmentId === me.departmentId) ?? [])
    : (allUsers ?? []);

  const createAllocation = useCreateAllocation();
  const returnAllocation = useReturnAllocation();
  const approveTransfer = useApproveTransferRequest();
  const rejectTransfer = useRejectTransferRequest();

  const [returnOpenId, setReturnOpenId] = useState<number | null>(null);

  const allocateForm = useForm<z.infer<typeof allocateSchema>>({
    resolver: zodResolver(allocateSchema),
    defaultValues: { expectedReturnDate: "" },
  });

  const returnForm = useForm<z.infer<typeof returnSchema>>({
    resolver: zodResolver(returnSchema),
    defaultValues: { returnConditionNotes: "" },
  });

  const onAllocate = (values: z.infer<typeof allocateSchema>) => {
    createAllocation.mutate(
      { data: {
        assetId: values.assetId,
        employeeId: values.employeeId,
        expectedReturnDate: values.expectedReturnDate || null,
        // For dept_head: pass their departmentId; backend will enforce it anyway
        departmentId: isDeptHead && me?.departmentId ? me.departmentId : null,
      } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAllocationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
          allocateForm.reset();
          toast.success("Asset allocated successfully");
        },
        onError: (err: any) => toast.error(err.message || "Failed to allocate asset"),
      }
    );
  };

  const onReturn = (allocationId: number, values: z.infer<typeof returnSchema>) => {
    returnAllocation.mutate(
      { id: allocationId, data: { returnConditionNotes: values.returnConditionNotes || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAllocationsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
          setReturnOpenId(null);
          returnForm.reset();
          toast.success("Asset returned to inventory");
        },
        onError: (err: any) => toast.error(err.message || "Failed to process return"),
      }
    );
  };

  const onApprove = (transferId: number) => {
    approveTransfer.mutate(
      { id: transferId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTransferRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListAllocationsQueryKey() });
          toast.success("Transfer approved — allocation updated");
        },
        onError: (err: any) => toast.error(err.message || "Failed to approve transfer"),
      }
    );
  };

  const onReject = (transferId: number) => {
    rejectTransfer.mutate(
      { id: transferId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTransferRequestsQueryKey() });
          toast.success("Transfer rejected");
        },
        onError: (err: any) => toast.error(err.message || "Failed to reject transfer"),
      }
    );
  };

  const pendingCount = pendingTransfers?.length ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CUSTODY LOG</h1>
        <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">Asset Assignments & Transfers</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Issue + Transfer Approvals */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {canIssue && (
            <Card className="bg-card border-primary/30 shadow-[0_0_15px_rgba(60,255,208,0.05)]">
              <CardHeader className="pb-3 border-b border-white/5 mb-4">
                <CardTitle className="font-mono tracking-widest text-primary flex items-center gap-2 text-sm uppercase">
                  <ArrowRightLeft className="h-4 w-4" /> Issue Asset
                </CardTitle>
                {isDeptHead && (
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1">
                    Scoped to your department
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <Form {...allocateForm}>
                  <form onSubmit={allocateForm.handleSubmit(onAllocate)} className="space-y-4">
                    <FormField
                      control={allocateForm.control}
                      name="assetId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">
                            Available Asset {isDeptHead && <span className="text-primary">(Dept)</span>}
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                            <FormControl>
                              <SelectTrigger className="bg-black/40 font-mono text-xs border-white/10">
                                <SelectValue placeholder="SELECT ASSET..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {assets?.map((a) => (
                                <SelectItem key={a.id} value={a.id.toString()} className="font-mono text-xs">
                                  {a.assetTag} - {a.name}
                                </SelectItem>
                              ))}
                              {assets?.length === 0 && (
                                <SelectItem value="none" disabled>NO AVAILABLE ASSETS</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={allocateForm.control}
                      name="employeeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">
                            Assign To {isDeptHead && <span className="text-primary">(Dept)</span>}
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                            <FormControl>
                              <SelectTrigger className="bg-black/40 font-mono text-xs border-white/10">
                                <SelectValue placeholder="SELECT PERSONNEL..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {users.map((u) => (
                                <SelectItem key={u.id} value={u.id.toString()} className="text-xs">
                                  {u.name} <span className="text-muted-foreground font-mono ml-2">({u.email})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={allocateForm.control}
                      name="expectedReturnDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Expected Return (Optional)</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value || ""} className="bg-black/40 font-mono text-xs border-white/10 [color-scheme:dark]" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" className="w-full mt-2 font-mono tracking-widest text-xs uppercase" disabled={createAllocation.isPending}>
                      {createAllocation.isPending ? "PROCESSING..." : "AUTHORIZE DEPLOYMENT"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {/* Pending Approvals quick-count card for dept_head */}
          {isDeptHead && (
            <Card className={`bg-card border-card-border ${pendingCount > 0 ? 'border-accent/40' : ''}`}>
              <CardHeader className="pb-2">
                <CardTitle className="font-mono tracking-widest text-muted-foreground flex items-center gap-2 text-sm uppercase">
                  <ShieldCheck className={`h-4 w-4 ${pendingCount > 0 ? 'text-accent' : ''}`} /> Dept Approvals
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingCount > 0 ? (
                  <div className="text-xs font-mono text-accent uppercase tracking-wider">
                    {pendingCount} TRANSFER{pendingCount !== 1 ? 'S' : ''} AWAITING YOUR APPROVAL
                  </div>
                ) : (
                  <div className="text-xs font-mono text-muted-foreground">No pending approvals</div>
                )}
              </CardContent>
            </Card>
          )}

          {!isDeptHead && (
            <Card className="bg-card border-card-border">
              <CardHeader className="pb-3 border-b border-white/5">
                <CardTitle className="font-mono tracking-widest text-muted-foreground flex items-center gap-2 text-sm uppercase">
                  <FileSignature className="h-4 w-4" /> Transfer Requests
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {isLoadingTransfers ? (
                  <div className="text-center p-4 text-xs font-mono text-muted-foreground">LOADING...</div>
                ) : pendingCount === 0 ? (
                  <div className="text-center p-4 text-xs font-mono text-muted-foreground border border-dashed border-white/10 rounded">
                    NO PENDING TRANSFERS
                  </div>
                ) : (
                  <div className="text-xs font-mono text-accent uppercase tracking-wider">
                    {pendingCount} pending — see Approvals tab
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Lists */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="active" className="w-full h-full flex flex-col">
            <TabsList className="bg-black/20 p-1 border border-white/10 self-start">
              <TabsTrigger value="active" className="font-mono uppercase tracking-wider text-xs">ACTIVE CUSTODY</TabsTrigger>
              <TabsTrigger value="history" className="font-mono uppercase tracking-wider text-xs">RETURN LOG</TabsTrigger>
              {(isManager || isDeptHead) && (
                <TabsTrigger value="approvals" className="font-mono uppercase tracking-wider text-xs relative">
                  APPROVALS
                  {pendingCount > 0 && (
                    <span className="ml-1.5 bg-accent text-black text-[9px] font-bold px-1 py-0 rounded-full">{pendingCount}</span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="active" className="mt-4 flex-1">
              <div className="space-y-3">
                {isLoadingAllocations ? (
                  <div className="text-center p-12 text-muted-foreground font-mono text-sm uppercase border border-border rounded-xl">LOADING LOGS...</div>
                ) : allocations?.length === 0 ? (
                  <div className="text-center p-12 text-muted-foreground font-mono text-sm uppercase border border-border rounded-xl bg-black/20">NO ACTIVE ALLOCATIONS</div>
                ) : (
                  allocations?.map((a) => (
                    <div key={a.id} className={`flex flex-col sm:flex-row gap-4 p-4 rounded-xl border transition-colors ${a.isOverdue ? 'border-destructive bg-destructive/5' : 'border-border/40 bg-card hover:bg-white/5'}`}>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`font-mono text-[10px] px-1.5 py-0 ${a.isOverdue ? 'border-destructive text-destructive bg-destructive/10' : 'border-primary/50 text-primary bg-primary/10'}`}>
                            {a.assetTag}
                          </Badge>
                          <span className="font-bold">{a.assetName}</span>
                        </div>
                        
                        <div className="flex items-center text-sm gap-2 text-muted-foreground">
                          <CornerDownLeft className="h-3 w-3" /> Assigned to: <span className="text-foreground">{a.employeeName}</span>
                          <span className="text-xs font-mono">({a.departmentName || 'HQ'})</span>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs font-mono">
                          <span className="flex items-center gap-1">
                            <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                            Out: {format(parseISO(a.allocatedAt), 'MMM d, yyyy')}
                          </span>
                          {a.expectedReturnDate && (
                            <span className={`flex items-center gap-1 ${a.isOverdue ? 'text-destructive font-bold' : ''}`}>
                              <Clock className="h-3 w-3" /> 
                              Due: {format(parseISO(a.expectedReturnDate), 'MMM d, yyyy')}
                              {a.isOverdue && " (OVERDUE)"}
                            </span>
                          )}
                        </div>
                      </div>

                      {(isManager || isDeptHead || a.employeeId === me?.id) && (
                        <div className="flex sm:flex-col justify-end gap-2 shrink-0">
                          <Dialog open={returnOpenId === a.id} onOpenChange={(open) => !open && setReturnOpenId(null)}>
                            <DialogTrigger asChild>
                              <Button 
                                variant={a.isOverdue ? "destructive" : "outline"} 
                                size="sm" 
                                className="font-mono text-xs tracking-wider"
                                onClick={() => setReturnOpenId(a.id)}
                              >
                                LOG RETURN
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="border-border bg-card">
                              <DialogHeader>
                                <DialogTitle className="font-mono tracking-widest uppercase">PROCESS RETURN</DialogTitle>
                              </DialogHeader>
                              <div className="bg-black/20 p-3 rounded text-sm mb-4 border border-white/5">
                                <div className="font-bold">{a.assetName} <span className="font-mono text-muted-foreground">({a.assetTag})</span></div>
                                <div className="text-muted-foreground mt-1 text-xs">Returning from: {a.employeeName}</div>
                              </div>
                              <Form {...returnForm}>
                                <form onSubmit={returnForm.handleSubmit((v) => onReturn(a.id, v))} className="space-y-4">
                                  <FormField
                                    control={returnForm.control}
                                    name="returnConditionNotes"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel className="font-mono text-[10px] uppercase text-muted-foreground">Condition Notes (Optional)</FormLabel>
                                        <FormControl>
                                          <Input placeholder="e.g. Returned with minor scratch on case" {...field} value={field.value || ''} className="bg-black/40 border-white/10" />
                                        </FormControl>
                                      </FormItem>
                                    )}
                                  />
                                  <Button type="submit" className="w-full font-mono tracking-widest text-xs uppercase" disabled={returnAllocation.isPending}>
                                    CONFIRM RECEIPT
                                  </Button>
                                </form>
                              </Form>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-4 flex-1">
               <div className="space-y-2">
                 {history?.length === 0 ? (
                    <div className="text-center p-12 text-muted-foreground font-mono text-sm uppercase border border-border rounded-xl bg-black/20">NO HISTORY FOUND</div>
                 ) : (
                   history?.map((a) => (
                    <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded bg-black/20 border border-white/5 hover:border-white/10 transition-colors">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-muted-foreground">{a.assetTag}</span>
                          <span className="font-bold text-sm">{a.assetName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.employeeName} <ChevronRight className="inline h-3 w-3" /> Returned {format(parseISO(a.returnedAt!), 'MMM d, yyyy')}
                        </div>
                      </div>
                      <Badge variant="outline" className="self-start sm:self-auto bg-muted text-muted-foreground border-border font-mono text-[10px] py-0 px-1">RETURNED</Badge>
                    </div>
                   ))
                 )}
               </div>
            </TabsContent>

            {(isManager || isDeptHead) && (
              <TabsContent value="approvals" className="mt-4 flex-1">
                <div className="space-y-3">
                  {isDeptHead && (
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-wider pb-2 border-b border-white/5">
                      <ShieldCheck className="h-3 w-3 text-primary" />
                      Showing transfers for your department's assets only
                    </div>
                  )}
                  {isLoadingTransfers ? (
                    <div className="text-center p-12 text-muted-foreground font-mono text-sm uppercase border border-border rounded-xl">LOADING...</div>
                  ) : pendingCount === 0 ? (
                    <div className="text-center p-12 text-muted-foreground font-mono text-sm uppercase border border-border rounded-xl bg-black/20">
                      NO PENDING TRANSFER REQUESTS
                    </div>
                  ) : (
                    pendingTransfers?.map((t) => (
                      <div key={t.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-accent/20 bg-accent/5">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 border-accent/50 text-accent bg-accent/10">
                              {t.assetTag}
                            </Badge>
                            <span className="font-bold">{t.assetName}</span>
                          </div>
                          <div className="flex items-center text-sm gap-1 text-muted-foreground">
                            <ArrowLeftRight className="h-3 w-3" />
                            <span className="text-foreground">{t.fromEmployeeName || 'Unallocated'}</span>
                            <span className="text-xs font-mono mx-1">→</span>
                            <span className="text-foreground">{t.toEmployeeName}</span>
                          </div>
                          {t.reason && (
                            <div className="text-xs text-muted-foreground italic">"{t.reason}"</div>
                          )}
                          <div className="text-[10px] font-mono text-muted-foreground">
                            Requested {format(parseISO(t.requestedAt), 'MMM d, yyyy')}
                          </div>
                        </div>
                        <div className="flex sm:flex-col gap-2 shrink-0 justify-end">
                          <Button
                            size="sm"
                            className="font-mono text-xs tracking-wider bg-primary text-black hover:bg-primary/80"
                            onClick={() => onApprove(t.id)}
                            disabled={approveTransfer.isPending}
                          >
                            <Check className="h-3 w-3 mr-1" /> APPROVE
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="font-mono text-xs tracking-wider border-destructive/50 text-destructive hover:bg-destructive hover:text-white"
                            onClick={() => onReject(t.id)}
                            disabled={rejectTransfer.isPending}
                          >
                            <X className="h-3 w-3 mr-1" /> REJECT
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
