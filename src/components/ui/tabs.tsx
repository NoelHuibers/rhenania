"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { useSearchParams } from "next/navigation";
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "~/lib/utils";

function Tabs({
	className,
	orientation = "horizontal",
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			className={cn(
				"group/tabs flex gap-2 data-horizontal:flex-col",
				className,
			)}
			{...props}
		/>
	);
}

// The one tab bar (#87). A TabsList takes a layout instead of per-page
// width, height or grid overrides, so it has no className:
// - `scroll` (default): as wide as its tabs but never wider than its
//   container; extra tabs scroll sideways (snapping) instead of wrapping or
//   squeezing. Arrow keys move focus, and the browser scrolls it into view.
// - `fill`: full width, the tabs share it equally. For two or three short
//   tabs in a dialog or card.
// Phones get 40 px tall tabs, larger screens the compact 36 px.
const tabsListVariants = cva(
	"group/tabs-list inline-flex items-center rounded-lg p-[3px] text-muted-foreground data-[variant=line]:rounded-none group-data-horizontal/tabs:h-10 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col sm:group-data-horizontal/tabs:h-9",
	{
		variants: {
			variant: {
				default: "bg-muted",
				line: "gap-1 bg-transparent",
			},
			layout: {
				scroll:
					"w-fit max-w-full snap-x snap-proximity scroll-px-[3px] justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				fill: "w-full justify-center",
			},
		},
		defaultVariants: {
			variant: "default",
			layout: "scroll",
		},
	},
);

function TabsList({
	variant = "default",
	layout = "scroll",
	...props
}: Omit<React.ComponentProps<typeof TabsPrimitive.List>, "className"> &
	VariantProps<typeof tabsListVariants>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			data-variant={variant}
			data-layout={layout}
			className={tabsListVariants({ variant, layout })}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"relative inline-flex h-[calc(100%-1px)] flex-1 snap-start items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 py-1 font-medium text-muted-foreground text-sm transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none dark:hover:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				"group-data-[layout=scroll]/tabs-list:flex-none",
				"group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
				"data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
				"after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 text-sm outline-none", className)}
			{...props}
		/>
	);
}

/**
 * Tabs whose active tab lives in the URL (`?tab=…`), so a reload, a shared
 * link or the back button lands on the same tab. Switching rewrites the query
 * string with the History API: Next keeps `useSearchParams` in sync without
 * a server round trip, so the tabs' data is not fetched again. A value in
 * the URL that is not one of `values` shows `defaultValue`.
 */
function UrlTabs({
	param = "tab",
	values,
	defaultValue,
	...props
}: Omit<
	React.ComponentProps<typeof Tabs>,
	"value" | "defaultValue" | "onValueChange"
> & {
	/** Search parameter that holds the tab (default `tab`). */
	param?: string;
	/** The tabs this user can see; anything else shows the default. */
	values: readonly string[];
	defaultValue: string;
}) {
	const searchParams = useSearchParams();
	const fromUrl = searchParams.get(param);
	const value = fromUrl && values.includes(fromUrl) ? fromUrl : defaultValue;

	const onValueChange = (next: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set(param, next);
		window.history.replaceState(null, "", `?${params.toString()}`);
	};

	return <Tabs value={value} onValueChange={onValueChange} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants, UrlTabs };
