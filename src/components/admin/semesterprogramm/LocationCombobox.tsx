"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "~/components/ui/command";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import type { Venue } from "~/server/actions/venues";

export function LocationCombobox({
	value,
	onChange,
	venues,
}: {
	value: string;
	onChange: (value: string) => void;
	venues: Venue[];
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);

	// Keep search in sync if parent changes value (e.g. form reset)
	useEffect(() => {
		setSearch(value);
	}, [value]);

	function select(shortName: string) {
		onChange(shortName);
		setSearch(shortName);
		setOpen(false);
	}

	function handleSearchChange(val: string) {
		setSearch(val);
		onChange(val);
		setOpen(true);
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") setOpen(false);
	}

	const filtered = venues.filter((v) =>
		v.shortName.toLowerCase().includes(search.toLowerCase()),
	);

	const exactMatch = venues.some(
		(v) => v.shortName.toLowerCase() === search.toLowerCase(),
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<div className="relative">
					<Command shouldFilter={false}>
						<CommandInput
							ref={inputRef}
							value={search}
							onValueChange={handleSearchChange}
							onFocus={() => setOpen(true)}
							onKeyDown={handleKeyDown}
							placeholder="z.B. adH Rhenania"
							className="h-9"
						/>
					</Command>
					<ChevronsUpDown className="-translate-y-1/2 pointer-events-none absolute right-3 top-1/2 h-4 w-4 text-muted-foreground" />
				</div>
			</PopoverAnchor>

			<PopoverContent
				className="p-0"
				style={{ width: "var(--radix-popover-anchor-width)" }}
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<Command shouldFilter={false}>
					<CommandList>
						{filtered.length === 0 && search === "" && (
							<CommandEmpty className="py-4 text-center text-muted-foreground text-sm">
								Noch keine Orte angelegt.
							</CommandEmpty>
						)}

						{filtered.length > 0 && (
							<CommandGroup heading="Gespeicherte Orte">
								{filtered.map((v) => (
									<CommandItem
										key={v.id}
										value={v.shortName}
										onSelect={() => select(v.shortName)}
									>
										<Check
											className={cn(
												"mr-2 h-4 w-4",
												value === v.shortName ? "opacity-100" : "opacity-0",
											)}
										/>
										<div className="min-w-0">
											<p className="text-sm">{v.shortName}</p>
											<p className="truncate text-muted-foreground text-xs">
												{v.fullAddress}
											</p>
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						)}

						{search !== "" && !exactMatch && (
							<>
								{filtered.length > 0 && <CommandSeparator />}
								<CommandGroup heading="Eigener Ort">
									<CommandItem value={search} onSelect={() => select(search)}>
										<Check className="mr-2 h-4 w-4 opacity-0" />
										<span className="text-sm">"{search}" verwenden</span>
									</CommandItem>
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
