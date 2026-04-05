import { Input } from "~/components/ui/input";
import type { Venue } from "~/server/actions/venues";

export function LocationInput({
	id,
	value,
	onChange,
	venues,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	venues: Venue[];
}) {
	const listId = `${id}-venues`;
	return (
		<>
			<Input
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				list={listId}
				placeholder="z.B. adH Rhenania"
				autoComplete="off"
			/>
			<datalist id={listId}>
				{venues.map((v) => (
					<option key={v.id} value={v.shortName}>
						{v.fullAddress}
					</option>
				))}
			</datalist>
		</>
	);
}
