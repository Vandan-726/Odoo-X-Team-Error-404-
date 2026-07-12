import { useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useGetAsset, useGetAssetQRCode } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Wrench, BoxSelect, MapPin, CheckCircle2, AlertTriangle, XCircle, ArrowRightLeft } from "lucide-react";

interface AssetDetailSheetProps {
  assetId: number | null;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-primary text-black border-primary",
  allocated: "bg-accent text-white border-accent",
  reserved: "bg-chart-5 text-black border-chart-5",
  under_maintenance: "bg-chart-3 text-black border-chart-3",
  lost: "bg-destructive text-white border-destructive",
  retired: "bg-muted text-muted-foreground border-muted-foreground",
  disposed: "bg-background text-muted-foreground border-dashed border-muted-foreground",
};

export function AssetDetailSheet({ assetId, onClose }: AssetDetailSheetProps) {
  const { data: assetDetail, isLoading } = useGetAsset(assetId as number, {
    query: { enabled: !!assetId } as any
  });

  const { data: qrData } = useGetAssetQRCode(assetId as number, {
    query: { enabled: !!assetId } as any
  });

  return (
    <Sheet open={!!assetId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto bg-black/95 border-l border-white/10">
        {isLoading || !assetDetail ? (
          <div className="flex h-full items-center justify-center font-mono text-sm text-muted-foreground">LOADING ASSET DATA...</div>
        ) : (
          <>
            <SheetHeader className="mb-6">
              <SheetTitle className="font-mono text-xl uppercase tracking-widest text-primary flex items-center gap-2">
                {assetDetail.assetTag}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs uppercase text-muted-foreground">
                {assetDetail.name}
              </SheetDescription>
            </SheetHeader>
            
            <div className="space-y-8">
              {qrData?.qrCode && (
                <div className="flex flex-col items-center justify-center p-4 bg-white/5 border border-white/10 rounded-lg">
                  <img src={qrData.qrCode} alt="Asset QR Code" className="w-48 h-48 rounded-md mix-blend-screen" />
                  <span className="mt-4 font-mono text-xs text-muted-foreground tracking-widest">SCAN FOR QUICK ACCESS</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">Category</p>
                  <p className="font-mono text-sm flex items-center gap-1.5"><BoxSelect className="w-3 h-3 text-primary" /> {assetDetail.categoryName || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`font-mono uppercase text-[10px] py-0 border px-1.5 ${STATUS_COLORS[assetDetail.status] || 'border-border'}`}>
                    {assetDetail.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">Serial Number</p>
                  <p className="font-mono text-sm">{assetDetail.serialNumber || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">Location</p>
                  <p className="font-mono text-sm flex items-center gap-1.5"><MapPin className="w-3 h-3 text-primary" /> {assetDetail.location || '-'}</p>
                </div>
              </div>

              {assetDetail.maintenanceHistory && assetDetail.maintenanceHistory.length > 0 && (
                <div>
                  <h4 className="font-mono text-sm tracking-widest border-b border-white/10 pb-2 mb-4 text-primary">MAINTENANCE HISTORY</h4>
                  <div className="space-y-3">
                    {assetDetail.maintenanceHistory.map((m: any) => (
                      <div key={m.id} className="p-3 rounded bg-black/40 border border-white/5">
                        <div className="flex justify-between items-start mb-2">
                          <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                            m.status === 'resolved' ? 'border-primary text-primary' : 
                            m.priority === 'critical' ? 'border-destructive text-destructive' : 'border-chart-3 text-chart-3'
                          }`}>
                            {m.status}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-foreground/80">{m.issueDescription}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
