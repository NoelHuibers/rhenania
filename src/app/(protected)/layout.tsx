// layout.tsx
import { Toaster } from "sonner";
import { ThemeProvider } from "~/components/theme-provider";

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="de" suppressHydrationWarning>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					{children}
					<Toaster position="bottom-right" richColors closeButton />
				</ThemeProvider>
			</body>
		</html>
	);
}
