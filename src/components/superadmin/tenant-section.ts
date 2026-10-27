/** Props shared by every editable section of the superadmin tenant detail. */
export type SectionProps = {
	tenantId: string;
	disabled: boolean;
	startTransition: React.TransitionStartFunction;
	onDone: () => void;
};
