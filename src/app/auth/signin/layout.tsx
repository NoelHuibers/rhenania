// layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="de">
			<body>{children}</body>
		</html>
	);
}
