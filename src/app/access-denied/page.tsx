import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { auth } from "~/server/auth";

export default async function AccessDeniedPage({
	searchParams,
}: {
	searchParams: Promise<{ required?: string; path?: string }>;
}) {
	const session = await auth();

	// If user is not logged in, redirect to sign in
	if (!session?.user) {
		redirect("/api/auth/signin");
	}

	// Await the searchParams promise
	const params = await searchParams;

	const requiredRoles = params.required?.split(",") || ["admin", "versorger"];
	const attemptedPath = params.path || "/versorger";

	return (
		<div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 lg:px-8">
			<div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col items-center justify-center space-y-6">
				{/* Warning Icon */}
				<div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
					<AlertTriangle className="h-10 w-10 text-red-500" strokeWidth={2} />
				</div>

				{/* Main Heading */}
				<div className="text-center">
					<h1 className="mb-2 font-bold text-3xl text-gray-900">
						Access Denied
					</h1>
					<p className="text-gray-600">
						You don't have permission to access this page.
					</p>
				</div>

				{/* Main Information Card */}
				<Card className="w-full border-gray-200 shadow-sm">
					<CardContent className="space-y-6 p-6">
						{/* User Info */}
						<div>
							<p className="mb-2 text-gray-500 text-sm">Signed in as</p>
							<p className="font-medium text-gray-900">
								{session.user.email || "noel.huibers@rhenania-stuttgart.de"}
							</p>
						</div>

						{/* Required Roles */}
						<div>
							<p className="mb-3 text-gray-500 text-sm">Required roles</p>
							<div className="flex flex-wrap gap-2">
								{requiredRoles.map((role) => (
									<Badge
										key={role}
										className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100"
									>
										{role}
									</Badge>
								))}
							</div>
						</div>

						{/* Attempted Path */}
						<div>
							<p className="mb-2 text-gray-500 text-sm">Attempted to access</p>
							<code className="font-mono text-gray-900 text-sm">
								{attemptedPath}
							</code>
						</div>
					</CardContent>
				</Card>

				{/* Go to Home Button */}
				<Button
					asChild
					className="w-full max-w-lg bg-blue-600 hover:bg-blue-700"
					size="lg"
				>
					<Link href="/">Go to Home</Link>
				</Button>

				{/* Info Message */}
				<div className="flex max-w-lg items-start gap-3 text-blue-600 text-sm">
					<Info className="mt-0.5 h-5 w-5 flex-shrink-0" />
					<p>
						If you believe you should have access to this page, please contact
						your administrator.
					</p>
				</div>
			</div>
		</div>
	);
}
