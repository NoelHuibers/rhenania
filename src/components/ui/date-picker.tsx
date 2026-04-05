"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface DatePickerProps {
	value: Date | undefined;
	onChange: (date: Date | undefined) => void;
	placeholder?: string;
	className?: string;
}

export function DatePicker({
	value,
	onChange,
	placeholder = "Datum wählen",
	className,
}: DatePickerProps) {
	const formatted = value
		? value.toLocaleDateString("de-DE", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
			})
		: null;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-full justify-start text-left font-normal",
						!value && "text-muted-foreground",
						className,
					)}
				>
					<CalendarIcon className="mr-2 h-4 w-4" />
					{formatted ?? placeholder}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={value}
					onSelect={onChange}
					initialFocus
				/>
			</PopoverContent>
		</Popover>
	);
}
