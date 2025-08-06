import { CheckCircle, Clock } from "lucide-react";

export function MenuFooter() {
  return (
    <div className="mt-12 text-center space-y-4 border-t pt-8">
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span>"Man muss gewinnen, was man gewinnen will"</span>
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 text-orange-500" />
        <span>Die Verfügbarkeit kann sich kurzfristig ändern</span>
      </div>
    </div>
  );
}
