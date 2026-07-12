import { useGetUtilizationReport, useGetMaintenanceFrequencyReport, useGetBookingHeatmap, useGetIdleAssetsReport, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, BarChart2, Activity, Hexagon, PieChart, ShieldAlert } from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { formatDistanceToNow, parseISO } from "date-fns";

export default function Reports() {
  const { data: me } = useGetMe();
  const { data: utilData, isLoading: isLoadingUtil } = useGetUtilizationReport();
  const { data: maintData, isLoading: isLoadingMaint } = useGetMaintenanceFrequencyReport();
  const { data: idleData, isLoading: isLoadingIdle } = useGetIdleAssetsReport();

  if (me?.role === "employee") {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold tracking-tight">RESTRICTED ACCESS</h2>
        <p className="text-muted-foreground font-mono text-sm uppercase max-w-md">
          Analytics and Reports are restricted to management personnel. Your current clearance level ({me?.role}) does not grant access to this module.
        </p>
      </div>
    );
  }
  
  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-xl font-mono text-xs">
          <p className="font-bold text-sm mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="flex justify-between gap-4 uppercase">
              <span>{entry.name}:</span>
              <span className="font-bold">{entry.value}{entry.name.includes('Rate') ? '%' : ''}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const handleExportCSV = () => {
    if (!utilData) return;
    
    // Simple CSV generation
    const headers = ['Category', 'Total', 'Allocated', 'Available', 'Utilization Rate (%)'];
    const rows = utilData.map(d => [
      d.categoryName, 
      d.total, 
      d.allocated, 
      d.available, 
      (d.utilizationRate * 100).toFixed(1)
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `utilization_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ANALYTICS & REPORTS</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1 uppercase tracking-wider">System intelligence & telemetry</p>
        </div>
        <Button variant="outline" className="font-mono tracking-wider border-primary text-primary hover:bg-primary hover:text-black" onClick={handleExportCSV}>
          <Download className="mr-2 h-4 w-4" /> EXPORT CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Utilization Chart */}
        <Card className="bg-card border-card-border overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
            <CardTitle className="font-mono text-sm tracking-widest text-muted-foreground uppercase flex items-center gap-2">
              <PieChart className="w-4 h-4" /> Category Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-8">
            <div className="h-[300px] w-full">
              {isLoadingUtil ? (
                 <div className="h-full flex items-center justify-center font-mono text-xs text-muted-foreground uppercase">PROCESSING TELEMETRY...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utilData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis dataKey="categoryName" stroke="#666" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontFamily: 'monospace' }} />
                    <Bar dataKey="allocated" name="Allocated" stackId="a" fill="hsl(var(--accent))" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="available" name="Available" stackId="a" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Frequency */}
        <Card className="bg-card border-card-border overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
            <CardTitle className="font-mono text-sm tracking-widest text-muted-foreground uppercase flex items-center gap-2">
              <Activity className="w-4 h-4" /> Failure Frequency (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-8">
            <div className="h-[300px] w-full">
              {isLoadingMaint ? (
                 <div className="h-full flex items-center justify-center font-mono text-xs text-muted-foreground uppercase">PROCESSING TELEMETRY...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={maintData?.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                    <XAxis type="number" stroke="#666" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="assetTag" type="category" stroke="#666" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="requestCount" name="Failures" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Idle Assets List */}
        <Card className="lg:col-span-2 bg-card border-card-border">
          <CardHeader className="border-b border-white/5 bg-black/20 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-sm tracking-widest text-muted-foreground uppercase flex items-center gap-2">
                <Hexagon className="w-4 h-4" /> Underutilized Capital (Idle {'>'} 30 Days)
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] border-primary text-primary py-0">{idleData?.length || 0} IDENTIFIED</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent bg-black/40">
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest pl-6 py-3 w-[150px]">Asset Tag</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest py-3">Model / Name</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest py-3">Category</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest py-3 text-right pr-6">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingIdle ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 font-mono text-xs text-muted-foreground">SCANNING REGISTRY...</TableCell></TableRow>
                ) : idleData?.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 font-mono text-xs text-muted-foreground">NO IDLE ASSETS DETECTED</TableCell></TableRow>
                ) : (
                  idleData?.map((asset: any) => (
                    <TableRow key={asset.id} className="border-white/5 hover:bg-white/5">
                      <TableCell className="pl-6 font-mono font-bold text-xs">{asset.assetTag}</TableCell>
                      <TableCell className="font-medium text-sm">{asset.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{asset.categoryName || 'Unknown'}</TableCell>
                      <TableCell className="text-right pr-6 font-mono text-xs text-muted-foreground">
                        {asset.updatedAt ? formatDistanceToNow(parseISO(asset.updatedAt)) + ' ago' : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}