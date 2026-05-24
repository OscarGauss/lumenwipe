import { Loader2 } from "lucide-react";

interface ProgressIndicatorProps {
  status: string;
}

export default function ProgressIndicator({ status }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2.5">
      <Loader2 className="h-4 w-4 animate-spin text-stellar shrink-0" />
      {status}
    </div>
  );
}
