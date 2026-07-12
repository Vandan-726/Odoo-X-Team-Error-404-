import { useState } from "react";
import { useLocation } from "wouter";
import { 
  useListAssets, 
  useListCategories, 
  useListDepartments,
  useCreateAsset,
  useGetMe,
  getListAssetsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  Search, Filter, Plus, FileText, QrCode, Monitor, BoxSelect, Server, MapPin, Hash, CheckCircle2, AlertTriangle, XCircle, Wrench,
  ArrowRightLeft
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Asset, AssetInput } from "@workspace/api-client-react";

const assetSchema = z.object({
  assetTag: z.string().min(1, "Asset Tag is required"),
  name: z.string().min(1, "Name is required"),
  categoryId: z.coerce.number().optional().nullable(),
  departmentId: z.coerce.number().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  condition: z.string().optional(),
  isBookable: z.boolean().default(false),
});

const STATUS_COLORS: Record<string, string> = {
  available: "bg-primary text-black border-primary",
  allocated: "bg-accent text-white border-accent",
  reserved: "bg-chart-5 text-black border-chart-5",
  under_maintenance: "bg-chart-3 text-black border-chart-3",
  lost: "bg-destructive text-white border-destructive",
  retired: "bg-muted text-muted-foreground border-muted-foreground",
  disposed: "bg-background text-muted-foreground border-dashed border-muted-foreground",
};

export default function Assets() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [, setLocation] = useLocation();

  const queryClient = useQueryClient();
  const { data: me } = useGetMe();
  const isManager = me?.role === "admin" || me?.role === "asset_manager";

  const { data: categories } = useListCategories();
  const { data: departments } = useListDepartments();

  const params: any = {};
  if (search) params.search = search;
  if (statusFilter !== "all") params.status = statusFilter;
  if (categoryFilter !== "all") params.category = parseInt(categoryFilter);
  if (deptFilter !== "all") params.department = parseInt(deptFilter);

  const { data: assets, isLoading } = useListAssets(params);
  const createAsset = useCreateAsset();

  const form = useForm<z.infer<typeof assetSchema>>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      assetTag: `AST-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      name: "",
      condition: "new",
      isBookable: false,
    },
  });

  const onSubmit = (values: z.infer<typeof assetSchema>) => {
    // API expects null for empty optional fields, not undefined
    const submitData: AssetInput = {
      ...values,
      categoryId: values.categoryId || null,
      departmentId: values.departmentId || null,
      serialNumber: values.serialNumber || null,
      location: values.location || null,
    };

    createAsset.mutate(
      { data: submitData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
          setIsCreateOpen(false);
          form.reset({
            assetTag: `AST-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
            name: "",
            condition: "new",
            isBookable: false,
          });
          toast.success("Asset registered successfully");
        },
        onError: (err: any) => toast.error(err.message || "Failed to register asset"),
      }
    );
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'available': return <CheckCircle2 className="w-3 h-3 mr-1 inline" />;
      case 'allocated': return <ArrowRightLeft className="w-3 h-3 mr-1 inline" />;
      case 'under_maintenance': return <Wrench className="w-3 h-3 mr-1 inline" />;
      case 'lost': return <XCircle className="w-3 h-3 mr-1 inline" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ASSET DIRECTORY</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">Inventory & tracking master list</p>
        </div>

        {isManager && (
          <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <SheetTrigger asChild>
              <Button className="font-mono tracking-wider bg-white text-black hover:bg-white/90">
                <Plus className="mr-2 h-4 w-4" /> REGISTER ASSET
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-card border-l-border">
              <SheetHeader className="mb-6">
                <SheetTitle className="font-mono tracking-widest text-xl uppercase">New Asset Record</SheetTitle>
                <SheetDescription className="font-mono text-xs uppercase">Enter hardware specifications into the registry.</SheetDescription>
              </SheetHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="assetTag"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-primary">Asset Tag *</FormLabel>
                          <FormControl>
                            <Input {...field} className="font-mono bg-black/50 border-white/20 uppercase" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="serialNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Serial No.</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} className="font-mono bg-black/20" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-primary">Asset Name / Model *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. MacBook Pro M3 Max" {...field} className="bg-black/20" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Category</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                            <FormControl>
                              <SelectTrigger className="bg-black/20">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories?.map((c) => (
                                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="departmentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Department</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                            <FormControl>
                              <SelectTrigger className="bg-black/20">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {departments?.map((d) => (
                                <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase">Condition</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-black/20">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="new">New</SelectItem>
                              <SelectItem value="good">Good</SelectItem>
                              <SelectItem value="fair">Fair</SelectItem>
                              <SelectItem value="poor">Poor</SelectItem>
                              <SelectItem value="damaged">Damaged</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Location</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ''} placeholder="e.g. Floor 3, Desk 12" className="bg-black/20" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="isBookable"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border bg-black/20 p-4 mt-6">
                        <div className="space-y-0.5">
                          <FormLabel className="font-mono text-sm uppercase">Make Bookable</FormLabel>
                          <p className="text-xs text-muted-foreground">
                            Allow employees to reserve this asset by hour/day
                          </p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full mt-6 font-mono tracking-widest font-bold" disabled={createAsset.isPending}>
                    {createAsset.isPending ? "REGISTERING..." : "COMMIT TO REGISTRY"}
                  </Button>
                </form>
              </Form>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* FILTER BAR */}
      <div className="flex flex-col lg:flex-row gap-3 bg-card p-2 rounded-xl border border-card-border shadow-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by tag, name, or serial..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-transparent border-none focus-visible:ring-0 shadow-none"
          />
        </div>
        <div className="w-px bg-border hidden lg:block mx-1"></div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] bg-black/20 border-border/50 text-xs font-mono uppercase tracking-wider">
              <SelectValue placeholder="STATUS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL STATUSES</SelectItem>
              <SelectItem value="available">AVAILABLE</SelectItem>
              <SelectItem value="allocated">ALLOCATED</SelectItem>
              <SelectItem value="under_maintenance">MAINTENANCE</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] bg-black/20 border-border/50 text-xs font-mono uppercase tracking-wider">
              <SelectValue placeholder="CATEGORY" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL CATEGORIES</SelectItem>
              {categories?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[140px] bg-black/20 border-border/50 text-xs font-mono uppercase tracking-wider">
              <SelectValue placeholder="DEPARTMENT" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ALL DEPARTMENTS</SelectItem>
              {departments?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ASSET LIST */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent bg-black/40">
              <TableHead className="font-mono text-xs uppercase tracking-widest pl-4">Asset Tag</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-widest">Model / Name</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-widest">Category</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-widest">Status</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-widest hidden md:table-cell">Department</TableHead>
              <TableHead className="font-mono text-xs uppercase tracking-widest hidden lg:table-cell">Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center font-mono text-sm py-12 text-muted-foreground">LOADING REGISTRY DATA...</TableCell></TableRow>
            ) : assets?.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center font-mono text-sm py-12 text-muted-foreground">NO ASSETS MATCH CURRENT FILTERS</TableCell></TableRow>
            ) : (
              assets?.map((asset) => (
                <TableRow 
                  key={asset.id} 
                  className="border-border/20 hover:bg-white/5 cursor-pointer transition-colors group"
                  onClick={() => {/* In a real app we'd open a detail view */}}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="font-mono font-bold tracking-wider">{asset.assetTag}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {asset.name}
                    {asset.serialNumber && <div className="text-[10px] font-mono text-muted-foreground">SN: {asset.serialNumber}</div>}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <BoxSelect className="h-3 w-3" />
                      {asset.categoryName || 'Uncategorized'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`font-mono uppercase text-[10px] py-0 border px-1.5 ${STATUS_COLORS[asset.status] || 'border-border text-foreground'}`}>
                      {getStatusIcon(asset.status)}
                      {asset.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {asset.departmentName || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {asset.location ? (
                      <span className="text-xs flex items-center gap-1 text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {asset.location}
                      </span>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}