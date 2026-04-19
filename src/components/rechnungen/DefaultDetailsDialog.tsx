// DefaultDetailsDialog.tsx
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";
import type { BillingEntry } from "./BillingDashboard";
import { formatCurrency } from "./BillingTable";

export const DefaultDetailsDialog = ({ entry }: { entry: BillingEntry }) => (
	<Dialog>
		<DialogTrigger asChild>
			<Button variant="outline" size="sm">
				Details
			</Button>
		</DialogTrigger>
		<DialogContent className="mx-auto flex max-h-[90vh] w-[95vw] max-w-2xl flex-col">
			<DialogHeader className="flex-shrink-0">
				<DialogTitle className="break-words text-base sm:text-lg">
					Bestelldetails - {entry.name}
				</DialogTitle>
			</DialogHeader>
			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
				{/* Desktop Table View */}
				<div className="hidden sm:block">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Artikel</TableHead>
								<TableHead className="text-right">Anzahl</TableHead>
								<TableHead className="text-right">Einzelpreis</TableHead>
								<TableHead className="text-right">Zwischensumme</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{entry.items.map((item) => (
								<TableRow key={item.id}>
									<TableCell className="font-medium">{item.name}</TableCell>
									<TableCell className="text-right">{item.quantity}</TableCell>
									<TableCell className="text-right">
										{formatCurrency(item.unitPrice)}
									</TableCell>
									<TableCell className="text-right font-medium">
										{formatCurrency(item.subtotal)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				{/* Mobile Card View */}
				<div className="space-y-3 sm:hidden">
					{entry.items.map((item) => (
						<div
							key={item.id}
							className="space-y-2 rounded-lg bg-muted p-3"
						>
							<div className="break-words font-medium text-sm leading-tight">
								{item.name}
							</div>
							<div className="space-y-1.5 text-sm">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-xs">Anzahl:</span>
									<span className="font-medium">{item.quantity}</span>
								</div>
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-xs">
										Einzelpreis:
									</span>
									<span className="font-medium">
										{formatCurrency(item.unitPrice)}
									</span>
								</div>
								<div className="flex items-center justify-between border-border border-t pt-1.5">
									<span className="text-muted-foreground text-xs">
										Zwischensumme:
									</span>
									<span className="font-semibold text-sm">
										{formatCurrency(item.subtotal)}
									</span>
								</div>
							</div>
						</div>
					))}
				</div>

				<div className="flex items-center justify-between border-border border-t pt-4">
					<span className="font-semibold text-base sm:text-lg">Gesamt:</span>
					<span className="font-bold text-green-600 text-lg sm:text-xl dark:text-green-400">
						{formatCurrency(entry.totalDue)}
					</span>
				</div>
			</div>
		</DialogContent>
	</Dialog>
);
